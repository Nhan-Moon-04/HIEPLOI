from typing import List, Optional
from datetime import date
import calendar
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.database import get_db
from app.models.schedule import WorkSchedule
from app.models.employee import Employee
from app.models.shift import ShiftTemplate
from app.models.attendance import AttendanceDaily, AttendanceLog
from app.models.holiday import CompanyHoliday
from app.models.user import AppUser
from app.middleware.auth import get_current_user
from app.routers.attendance import evaluate_attendance
from app.services.nu_shift import is_nu_dynamic_shift_code, build_nu_shift_day_results
from pydantic import BaseModel
from datetime import date, datetime, time, timedelta

router = APIRouter(prefix="/overtime", tags=["Overtime - Tang Ca"])

DOW_VN = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]


class OvertimeRow(BaseModel):
    employee_id: int
    employee_code: str
    full_name: str
    department: Optional[str] = None
    default_shift_code: Optional[str] = None
    days: dict  # {1: {shift: "D", ot: 2.0, is_sunday: false, is_holiday: false}, ...}
    total_ot_normal: float  # OT ngay thuong (x1.5)
    total_ot_sunday: float  # OT chu nhat (x2.0)
    total_ot_holiday: float # OT ngay le (x3.0)
    total_ot_hours: float


class OvertimeMonthResponse(BaseModel):
    month_key: str
    days_in_month: int
    weekdays: dict
    rows: List[OvertimeRow]
    summary: dict  # tong hop


@router.get("", response_model=OvertimeMonthResponse)
async def get_overtime(
    month_key: str = Query(..., description="YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Tinh OT theo thang dua tren lich lam + ma ca + thuc te cham cong"""
    try:
        year, month = map(int, month_key.split("-"))
    except ValueError:
        raise HTTPException(400, "month_key phai la YYYY-MM")

    try:
        days_in_month = calendar.monthrange(year, month)[1]
        first_day = date(year, month, 1)
        last_day = date(year, month, days_in_month)

        # Weekday labels + sunday detection
        weekdays = {}
        sundays = set()
        for d in range(1, days_in_month + 1):
            dt = date(year, month, d)
            dow = DOW_VN[dt.weekday()]
            weekdays[d] = dow
            if dow == "CN":
                sundays.add(d)

        # Load all shifts
        shift_result = await db.execute(select(ShiftTemplate))
        shifts_by_id = {s.id: s for s in shift_result.scalars().all()}
        shifts_by_code = {s.code: s for s in shift_result.scalars().all()}

        # Load holidays
        holiday_q = select(CompanyHoliday).where(
            and_(CompanyHoliday.holiday_date >= first_day, CompanyHoliday.holiday_date <= last_day, CompanyHoliday.is_active == True)
        )
        holiday_result = await db.execute(holiday_q)
        holiday_dates = {h.holiday_date for h in holiday_result.scalars().all()}

        # Load active employees
        emp_q = select(Employee).where(
            and_(Employee.is_active == True, Employee.join_date <= last_day)
        ).order_by(Employee.employee_code)
        emp_result = await db.execute(emp_q)
        employees = emp_result.scalars().all()

        # Load schedule overrides
        schedule_q = select(WorkSchedule).where(WorkSchedule.month_key == month_key)
        schedule_result = await db.execute(schedule_q)
        override_map = {}
        for ws in schedule_result.scalars().all():
            override_map[(ws.employee_id, ws.work_date.day)] = ws.shift_id

        # Load attendance data
        att_q = select(AttendanceDaily).where(
            and_(AttendanceDaily.work_date >= first_day, AttendanceDaily.work_date <= last_day)
        )
        att_result = await db.execute(att_q)
        att_map = {}
        for a in att_result.scalars().all():
            att_map[(a.employee_id, a.work_date)] = a

        # Load raw logs for NU mode detection
        log_q = select(AttendanceLog).where(
            and_(AttendanceLog.event_time >= datetime.combine(first_day, time(0, 0)), 
                 AttendanceLog.event_time <= datetime.combine(last_day + timedelta(days=1), time(12, 0)))
        )
        log_result = await db.execute(log_q)
        all_logs = log_result.scalars().all()
        
        # Map logs to employee_id
        emp_code_to_id = {str(e.employee_code).lstrip("'"): e.id for e in employees}
        logs_with_id = []
        for l in all_logs:
            eid = emp_code_to_id.get(str(l.employee_code).lstrip("'"))
            if eid:
                l.employee_id = eid
                logs_with_id.append(l)

        # Build NU results
        nu_shift_code_map = {}
        emp_id_list = [e.id for e in employees]
        for emp in employees:
            default_shift = shifts_by_code.get(emp.default_shift_code)
            for d in range(1, days_in_month + 1):
                dt = date(year, month, d)
                override_id = override_map.get((emp.id, d))
                if override_id:
                    s = shifts_by_id.get(override_id)
                    if s: nu_shift_code_map[(emp.id, dt)] = s.code
                elif default_shift and is_nu_dynamic_shift_code(default_shift.code):
                    nu_shift_code_map[(emp.id, dt)] = default_shift.code

        nu_results = build_nu_shift_day_results(
            nu_shift_code_map=nu_shift_code_map,
            employee_id_list=emp_id_list,
            attendance_log_rows=logs_with_id
        )

        # Build OT data
        rows = []
        grand_ot_normal = 0
        grand_ot_sunday = 0
        grand_ot_holiday = 0

        for emp in employees:
            days_data = {}
            emp_ot_normal = 0.0
            emp_ot_sunday = 0.0
            emp_ot_holiday = 0.0

            default_shift = shifts_by_code.get(emp.default_shift_code)

            for d in range(1, days_in_month + 1):
                dt = date(year, month, d)
                is_sunday = dt.weekday() == 6
                is_holiday = dt in holiday_dates

                # Determine shift
                override_id = override_map.get((emp.id, d))
                if override_id:
                    shift = shifts_by_id.get(override_id)
                elif default_shift and is_nu_dynamic_shift_code(default_shift.code):
                    shift = default_shift
                else:
                    shift = None if is_sunday else default_shift

                # Get attendance
                att = att_map.get((emp.id, dt))
                check_in_dt = att.first_check_in if att else None
                check_out_dt = att.last_check_out if att else None
                
                nu_res = nu_results.get((emp.id, dt))
                if nu_res:
                    check_in_dt = nu_res.check_in
                    check_out_dt = nu_res.check_out
                    ev = evaluate_attendance(shift, check_in_dt, check_out_dt, dt, is_sunday, is_holiday, is_night_override=(nu_res.mode=="night"))
                    # Use nu_res ot_hours
                    ot_hours = float(nu_res.total_ot_hours)
                    shift_code = nu_res.shift_code
                else:
                    ev = evaluate_attendance(shift, check_in_dt, check_out_dt, dt, is_sunday, is_holiday)
                    ot_hours = float(ev["ot_hours"])
                    shift_code = shift.code if shift else None

                # Categorize OT
                if is_holiday:
                    emp_ot_holiday += ot_hours
                elif is_sunday:
                    emp_ot_sunday += ot_hours
                else:
                    emp_ot_normal += ot_hours

                days_data[d] = {
                    "shift": shift_code,
                    "ot": ot_hours,
                    "is_sunday": is_sunday,
                    "is_holiday": is_holiday
                }

            total_ot = emp_ot_normal + emp_ot_sunday + emp_ot_holiday
            grand_ot_normal += emp_ot_normal
            grand_ot_sunday += emp_ot_sunday
            grand_ot_holiday += emp_ot_holiday

            rows.append(OvertimeRow(
                employee_id=emp.id,
                employee_code=emp.employee_code,
                full_name=emp.full_name,
                department=emp.department,
                default_shift_code=emp.default_shift_code,
                days=days_data,
                total_ot_normal=emp_ot_normal,
                total_ot_sunday=emp_ot_sunday,
                total_ot_holiday=emp_ot_holiday,
                total_ot_hours=total_ot,
            ))

        return OvertimeMonthResponse(
            month_key=month_key,
            days_in_month=days_in_month,
            weekdays=weekdays,
            rows=rows,
            summary={
                "total_employees": len(rows),
                "employees_with_ot": len([r for r in rows if r.total_ot_hours > 0]),
                "total_ot_normal": grand_ot_normal,
                "total_ot_sunday": grand_ot_sunday,
                "total_ot_holiday": grand_ot_holiday,
                "total_ot_hours": grand_ot_normal + grand_ot_sunday + grand_ot_holiday,
            },
        )
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
