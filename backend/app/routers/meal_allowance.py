from typing import List, Optional
from datetime import date
from collections import defaultdict, Counter
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, cast, Integer
from pydantic import BaseModel
from app.database import get_db
from app.models.attendance import AttendanceDaily
from app.models.employee import Employee
from app.models.shift import ShiftTemplate
from app.models.schedule import WorkSchedule
from app.models.holiday import CompanyHoliday
from app.models.user import AppUser
from app.middleware.auth import get_current_user
from app.services.nu_shift import is_nu_dynamic_shift_code, build_nu_shift_day_results, calculate_nu_shift_details

router = APIRouter(prefix="/meal-allowance", tags=["Meal Allowance - Tien An"])


def to_float(v) -> float:
    return float(v) if v is not None else 0.0


class MealAllowanceRow(BaseModel):
    employee_id: int
    employee_code: str
    full_name: str
    department: Optional[str] = None
    meal_rate: float
    work_days: int
    day_shifts: int
    night_shifts: int
    leave_days: int
    total_meal: float
    meal_count: int


class MealAllowanceResponse(BaseModel):
    start_date: date
    end_date: date
    rows: List[MealAllowanceRow]
    summary: dict


@router.get("", response_model=MealAllowanceResponse)
async def get_meal_allowance(
    start_date: date = Query(..., description="YYYY-MM-DD"),
    end_date: date = Query(..., description="YYYY-MM-DD"),
    department: Optional[str] = None,
    night_allowance: float = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    if end_date < start_date:
        raise HTTPException(400, "end_date phai lon hon hoac bang start_date")

    emp_q = select(Employee).where(
        and_(
            Employee.is_active == True,
            or_(Employee.join_date.is_(None), Employee.join_date <= end_date),
            or_(Employee.leave_date.is_(None), Employee.leave_date >= start_date),
        )
    )
    if department:
        emp_q = emp_q.where(Employee.department == department)
    emp_q = emp_q.order_by(cast(Employee.employee_code, Integer))
    emp_result = await db.execute(emp_q)
    employees = emp_result.scalars().all()

    if not employees:
        return MealAllowanceResponse(
            start_date=start_date,
            end_date=end_date,
            rows=[],
            summary={
                "total_employees": 0,
                "total_work_days": 0,
                "total_night_shifts": 0,
                "total_leave_days": 0,
                "total_meal": 0,
                "night_allowance": night_allowance,
            },
        )

    emp_ids = [e.id for e in employees]

    shift_result = await db.execute(select(ShiftTemplate))
    shifts = shift_result.scalars().all()
    shifts_by_id = {s.id: s for s in shifts}
    shifts_by_code = {s.code: s for s in shifts}

    holiday_q = select(CompanyHoliday.holiday_date).where(
        and_(
            CompanyHoliday.holiday_date >= start_date,
            CompanyHoliday.holiday_date <= end_date,
            CompanyHoliday.is_active == True,
        )
    )
    holiday_result = await db.execute(holiday_q)
    holiday_dates = set(holiday_result.scalars().all())

    sched_q = select(WorkSchedule).where(
        and_(
            WorkSchedule.work_date >= start_date,
            WorkSchedule.work_date <= end_date,
            WorkSchedule.employee_id.in_(emp_ids),
        )
    )
    sched_result = await db.execute(sched_q)
    scheds = sched_result.scalars().all()

    sched_map = {}
    leave_dates_by_emp = defaultdict(set)
    for ws in scheds:
        sched_map[(ws.employee_id, ws.work_date)] = ws.shift_id
        shift = shifts_by_id.get(ws.shift_id)
        if shift and shift.is_leave_code:
            leave_dates_by_emp[ws.employee_id].add(ws.work_date)

    att_q = select(AttendanceDaily).where(
        and_(
            AttendanceDaily.work_date >= start_date,
            AttendanceDaily.work_date <= end_date,
            AttendanceDaily.employee_id.in_(emp_ids),
        )
    )
    att_result = await db.execute(att_q)
    atts = att_result.scalars().all()

    att_map = {}
    att_by_emp = defaultdict(list)
    for att in atts:
        if att.work_date in holiday_dates:
            continue
        att_map[(att.employee_id, att.work_date)] = att
        att_by_emp[att.employee_id].append(att.work_date)

    # Load raw logs for NU mode detection
    from app.models.attendance import AttendanceLog
    from datetime import datetime, time, timedelta
    log_q = select(AttendanceLog).where(
        and_(AttendanceLog.event_time >= datetime.combine(start_date, time(0, 0)), 
             AttendanceLog.event_time <= datetime.combine(end_date + timedelta(days=1), time(12, 0)))
    )
    log_result = await db.execute(log_q)
    all_logs = log_result.scalars().all()
    
    # Map logs to employee_id
    emp_code_to_id = {e.employee_code: e.id for e in employees}
    logs_with_id = []
    for l in all_logs:
        eid = emp_code_to_id.get(str(l.employee_code).lstrip("'"))
        if eid:
            l.employee_id = eid
            logs_with_id.append(l)
            
    # Prepare NU shift code map
    nu_shift_code_map = {}
    for emp in employees:
        default_shift = shifts_by_code.get(emp.default_shift_code)
        # Scan all days in range
        curr = start_date
        while curr <= end_date:
            sid = sched_map.get((emp.id, curr))
            if sid:
                s = shifts_by_id.get(sid)
                if s and is_nu_dynamic_shift_code(s.code):
                    nu_shift_code_map[(emp.id, curr)] = s.code
            elif default_shift and is_nu_dynamic_shift_code(default_shift.code):
                nu_shift_code_map[(emp.id, curr)] = default_shift.code
            curr += timedelta(days=1)

    nu_results = build_nu_shift_day_results(
        nu_shift_code_map=nu_shift_code_map,
        employee_id_list=emp_ids,
        attendance_log_rows=logs_with_id,
        night_allowance_rate=night_allowance
    )

    rows = []
    total_meal = 0.0
    total_work_days = 0
    total_night_shifts = 0
    total_meal_count = 0
    total_leave_days = 0

    for emp in employees:
        worked_dates = att_by_emp.get(emp.id, [])
        meal_rates = Counter()
        work_days = 0
        night_shifts = 0
        total_emp_meal = 0.0
        emp_meal_count = 0

        for work_date in worked_dates:
            shift = None
            shift_id = sched_map.get((emp.id, work_date))
            if shift_id:
                shift = shifts_by_id.get(shift_id)
            elif default_shift and is_nu_dynamic_shift_code(default_shift.code):
                shift = default_shift
            else:
                shift = shifts_by_code.get(emp.default_shift_code)

            if not shift or shift.is_leave_code:
                continue

            # Check if we have NU result for this day
            nu_res = nu_results.get((emp.id, work_date))
            if nu_res:
                meal = nu_res.meal_allowance
                total_emp_meal += meal
                work_days += 1
                meal_rates[meal] += 1
                
                if nu_res.mode == "night":
                    night_shifts += 1
                    total_emp_meal += nu_res.night_allowance
                
                emp_meal_count += nu_res.meal_count
            elif is_nu_dynamic_shift_code(shift.code):
                # Fallback for NU shifts without logs
                att = att_map.get((emp.id, work_date))
                actual_hours = float(att.total_hours or 0) if att else 0.0
                nu_calc = calculate_nu_shift_details(shift.code, actual_hours, is_night=False, night_allowance_rate=night_allowance)
                
                meal = nu_calc["meal_allowance"]
                total_emp_meal += meal
                work_days += 1
                meal_rates[meal] += 1
                emp_meal_count += 1 if meal > 0 else 0
                if meal > 35000: emp_meal_count += 1
            else:
                meal = to_float(shift.meal_allowance)
                if meal <= 0:
                    continue

                total_emp_meal += meal
                work_days += 1
                meal_rates[meal] += 1
                emp_meal_count += 1

                if shift.is_night_shift:
                    night_shifts += 1
                    if night_allowance > 0:
                        total_emp_meal += night_allowance

        day_shifts = max(work_days - night_shifts, 0)

        default_shift = shifts_by_code.get(emp.default_shift_code) if emp.default_shift_code else None
        default_meal = to_float(default_shift.meal_allowance) if default_shift else 0.0
        if meal_rates:
            meal_rate = float(max(meal_rates, key=meal_rates.get))
        else:
            meal_rate = default_meal

        leave_dates = set(holiday_dates)
        leave_dates.update(leave_dates_by_emp.get(emp.id, set()))
        leave_days = len(leave_dates)

        rows.append(MealAllowanceRow(
            employee_id=emp.id,
            employee_code=emp.employee_code,
            full_name=emp.full_name,
            department=emp.department,
            meal_rate=meal_rate,
            work_days=work_days,
            day_shifts=day_shifts,
            night_shifts=night_shifts,
            leave_days=leave_days,
            total_meal=round(total_emp_meal, 2),
            meal_count=emp_meal_count,
        ))

        total_meal += total_emp_meal
        total_meal_count += emp_meal_count
        total_work_days += work_days
        total_night_shifts += night_shifts
        total_leave_days += leave_days

    return MealAllowanceResponse(
        start_date=start_date,
        end_date=end_date,
        rows=rows,
        summary={
            "total_employees": len(rows),
            "total_work_days": total_work_days,
            "total_night_shifts": total_night_shifts,
            "total_leave_days": total_leave_days,
            "total_meal": round(total_meal, 2),
            "total_meal_count": total_meal_count,
            "night_allowance": night_allowance,
        },
    )
