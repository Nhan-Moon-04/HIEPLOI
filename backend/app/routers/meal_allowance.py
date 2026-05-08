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

    att_by_emp = defaultdict(list)
    for att in atts:
        if att.work_date in holiday_dates:
            continue
        att_by_emp[att.employee_id].append(att.work_date)

    rows = []
    total_meal = 0.0
    total_work_days = 0
    total_night_shifts = 0
    total_leave_days = 0

    for emp in employees:
        worked_dates = att_by_emp.get(emp.id, [])
        meal_rates = Counter()
        work_days = 0
        night_shifts = 0
        total_emp_meal = 0.0

        for work_date in worked_dates:
            shift = None
            shift_id = sched_map.get((emp.id, work_date))
            if shift_id:
                shift = shifts_by_id.get(shift_id)
            else:
                shift = shifts_by_code.get(emp.default_shift_code)

            if not shift or shift.is_leave_code:
                continue

            meal = to_float(shift.meal_allowance)
            if meal <= 0:
                continue

            total_emp_meal += meal
            work_days += 1
            meal_rates[meal] += 1

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
        ))

        total_meal += total_emp_meal
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
            "night_allowance": night_allowance,
        },
    )
