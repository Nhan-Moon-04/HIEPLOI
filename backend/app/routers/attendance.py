from typing import List, Optional
from datetime import date, datetime, time, timedelta
import calendar
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete
from app.database import get_db
from app.models.attendance import AttendanceDaily, AttendanceDetail, AttendanceLog
from app.models.employee import Employee
from app.models.shift import ShiftTemplate
from app.models.schedule import WorkSchedule
from app.models.holiday import CompanyHoliday
from app.models.user import AppUser, UserRole
from app.middleware.auth import get_current_user, require_roles
from pydantic import BaseModel

router = APIRouter(prefix="/attendance", tags=["Attendance - Cham Cong"])

DOW_VN = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]

GRACE_MINUTES = 15  # Cho phep ve som 15p


class AttendanceCell(BaseModel):
    work_date: str
    day: int
    dow: str
    shift_code: Optional[str] = None
    shift_name: Optional[str] = None
    shift_start: Optional[str] = None  # HH:MM
    shift_end: Optional[str] = None
    standard_hours: Optional[float] = None
    check_in: Optional[str] = None  # HH:MM or datetime
    check_out: Optional[str] = None
    actual_hours: Optional[float] = None
    deviation: Optional[float] = None  # negative = ve som
    ot_hours: Optional[float] = None
    status: str = "no_data"  # full, early_leave, late, absent, no_data, holiday, off, night
    is_holiday: bool = False
    is_sunday: bool = False
    notes: Optional[str] = None
    meal_allowance: float = 0.0
    night_allowance: float = 0.0


class AttendanceRow(BaseModel):
    employee_id: int
    employee_code: str
    full_name: str
    department: Optional[str] = None
    default_shift_code: Optional[str] = None
    days: List[AttendanceCell]
    summary: dict  # total_days, present, absent, ot_hours, etc.


class AttendanceMonthResponse(BaseModel):
    month_key: str
    days_in_month: int
    rows: List[AttendanceRow]


def parse_time(t) -> Optional[time]:
    if t is None:
        return None
    if isinstance(t, time):
        return t
    if isinstance(t, str):
        parts = t.split(":")
        return time(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
    return None


def calc_hours_between(check_in_dt, check_out_dt, break_minutes=60):
    """Tinh gio lam thuc te"""
    if not check_in_dt or not check_out_dt:
        return 0.0
    diff = (check_out_dt - check_in_dt).total_seconds() / 3600.0
    # Tru gio nghi
    if diff > 4:
        diff -= break_minutes / 60.0
    return round(max(diff, 0), 2)


def evaluate_attendance(shift, check_in_dt, check_out_dt, work_date, is_sunday, is_holiday):
    """Danh gia cham cong 1 ngay dua tren ma ca"""
    result = {
        "actual_hours": 0.0,
        "deviation": 0.0,
        "ot_hours": 0.0,
        "status": "no_data",
        "notes": "",
        "meal_allowance": 0.0,
        "night_allowance": 0.0,
    }

    if is_holiday:
        result["status"] = "holiday"
        result["notes"] = "Ngay le/nghi"
        return result

    if not shift:
        result["status"] = "no_data"
        return result

    if shift.is_leave_code:
        result["status"] = "off"
        result["notes"] = shift.name or "Nghi"
        return result

    standard = float(shift.standard_hours or 8)

    if not check_in_dt and not check_out_dt:
        # Ko co du lieu cham cong nao
        result["status"] = "absent"
        result["deviation"] = -standard
        result["notes"] = "Vang mat (Khong quet the)"
        return result

    if not check_in_dt or not check_out_dt:
        # Chi co 1 dau (vao hoac ra)
        result["status"] = "forgot_scan"
        result["actual_hours"] = 0.0
        result["deviation"] = -standard
        result["notes"] = "Quen quet the (Chi co 1 dau)"
        return result

    # Tinh gio lam thuc te
    break_mins = int(shift.break_minutes or 60)
    actual = calc_hours_between(check_in_dt, check_out_dt, break_mins)
    result["actual_hours"] = actual

    # Check ve som
    shift_end_time = parse_time(shift.end_time)
    if shift_end_time and check_out_dt:
        # For night shift: end_time is next day
        if shift.is_night_shift:
            expected_end = datetime.combine(work_date + timedelta(days=1), shift_end_time)
        else:
            expected_end = datetime.combine(work_date, shift_end_time)

        diff_minutes = (check_out_dt - expected_end).total_seconds() / 60.0

        if diff_minutes < -GRACE_MINUTES:
            # Ve som qua 15p
            result["status"] = "early_leave"
            result["deviation"] = round(diff_minutes / 60.0, 2)
            result["notes"] = f"Ve som {abs(int(diff_minutes))}p"
        elif actual >= standard:
            result["status"] = "full"
        else:
            result["deviation"] = round(actual - standard, 2)
            result["status"] = "full" if abs(result["deviation"]) <= 0.25 else "short"
    else:
        result["status"] = "full" if actual >= standard * 0.9 else "short"

    # OT
    ot = float(shift.default_overtime_hours or 0)
    if is_sunday and not shift.is_leave_code:
        ot = max(ot, standard)
    result["ot_hours"] = ot

    # Tiền ăn: Nếu có mặt thì tính meal_allowance * meal_count (hoặc cứ cho mặc định nếu config meal_count)
    # Tạm thời nếu status in (full, early_leave, short) thì đc hưởng meal_allowance (hoặc theo số h thực tế)
    if result["status"] in ("full", "early_leave", "short"):
        meal_val = float(shift.meal_allowance or 0)
        meal_count = int(shift.meal_count or 1)
        # Giả sử trong hệ thống hiện tại, nếu check-in thì cho meal_allowance * count
        # Hoặc nếu là nghỉ phép có lương (paid leave) thì k có ăn.
        result["meal_allowance"] = meal_val * (meal_count if meal_count > 0 else 1)

    return result


@router.get("", response_model=AttendanceMonthResponse)
async def get_attendance(
    month_key: str = Query(..., description="YYYY-MM"),
    employee_id: Optional[int] = None,
    department: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    night_allowance_rate: Optional[float] = 0.0,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Cham cong thang - ket hop lich lam + du lieu cham cong + ma ca"""
    try:
        year, month = map(int, month_key.split("-"))
    except ValueError:
        raise HTTPException(400, "month_key phai la YYYY-MM")

    days_in_month = calendar.monthrange(year, month)[1]
    first_day = date(year, month, 1)
    last_day = date(year, month, days_in_month)

    if start_date:
        sd = date.fromisoformat(start_date)
        first_day = max(first_day, sd)
    if end_date:
        ed = date.fromisoformat(end_date)
        last_day = min(last_day, ed)

    if first_day > last_day:
        # Invalid range or no days in range for this month
        return AttendanceMonthResponse(month_key=month_key, days_in_month=days_in_month, rows=[])


    # Load shifts
    shift_result = await db.execute(select(ShiftTemplate))
    shifts_by_id = {}
    shifts_by_code = {}
    for s in shift_result.scalars().all():
        shifts_by_id[s.id] = s
        shifts_by_code[s.code] = s

    # Load holidays
    holiday_q = select(CompanyHoliday).where(
        and_(CompanyHoliday.holiday_date >= first_day, CompanyHoliday.holiday_date <= last_day, CompanyHoliday.is_active == True)
    )
    holiday_result = await db.execute(holiday_q)
    holiday_dates = {h.holiday_date for h in holiday_result.scalars().all()}

    # Load employees
    emp_q = select(Employee).where(and_(Employee.is_active == True, Employee.join_date <= last_day))
    if employee_id:
        emp_q = emp_q.where(Employee.id == employee_id)
    if department:
        emp_q = emp_q.where(Employee.department == department)
    emp_q = emp_q.order_by(Employee.employee_code)
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

    # Build rows
    rows = []
    for emp in employees:
        default_shift = shifts_by_code.get(emp.default_shift_code)
        days_cells = []
        total_present = 0
        total_absent = 0
        total_forgot_scan = 0
        total_early = 0
        total_hours = 0.0
        total_ot = 0.0

        for d in range(first_day.day, last_day.day + 1):
            dt = date(year, month, d)
            dow_idx = dt.weekday()
            dow = DOW_VN[dow_idx]
            is_sunday = dow == "CN"
            is_holiday = dt in holiday_dates

            # Determine shift
            override_id = override_map.get((emp.id, d))
            if override_id:
                shift = shifts_by_id.get(override_id)
            else:
                shift = None if is_sunday else default_shift

            # Get attendance record
            att = att_map.get((emp.id, dt))
            check_in_dt = att.first_check_in if att else None
            check_out_dt = att.last_check_out if att else None

            # Evaluate
            ev = evaluate_attendance(shift, check_in_dt, check_out_dt, dt, is_sunday, is_holiday)

            # Format times
            ci_str = check_in_dt.strftime("%H:%M") if check_in_dt else None
            co_str = check_out_dt.strftime("%H:%M") if check_out_dt else None

            # Night allowance
            if shift and shift.is_night_shift and ev["status"] in ("full", "early_leave", "short"):
                ev["night_allowance"] = night_allowance_rate

            cell = AttendanceCell(
                work_date=str(dt),
                day=d,
                dow=dow,
                shift_code="N" if ev["status"] == "absent" else (shift.code if shift else None),
                shift_name="Nghi khong phep" if ev["status"] == "absent" else (shift.name if shift else None),
                shift_start=str(shift.start_time)[:5] if shift and shift.start_time and ev["status"] != "absent" else None,
                shift_end=str(shift.end_time)[:5] if shift and shift.end_time and ev["status"] != "absent" else None,
                standard_hours=float(shift.standard_hours) if shift and shift.standard_hours else None,
                check_in=ci_str,
                check_out=co_str,
                actual_hours=ev["actual_hours"],
                deviation=ev["deviation"],
                ot_hours=ev["ot_hours"],
                status=ev["status"],
                is_holiday=is_holiday,
                is_sunday=is_sunday,
                notes=ev["notes"],
                meal_allowance=ev["meal_allowance"],
                night_allowance=ev["night_allowance"],
            )
            days_cells.append(cell)

            # Summary
            if ev["status"] in ("full", "early_leave", "short"):
                total_present += 1
                total_hours += ev["actual_hours"]
            if ev["status"] == "absent":
                total_absent += 1
            if ev["status"] == "forgot_scan":
                total_forgot_scan += 1
            if ev["status"] == "early_leave":
                total_early += 1
            total_ot += ev["ot_hours"]

        rows.append(AttendanceRow(
            employee_id=emp.id,
            employee_code=emp.employee_code,
            full_name=emp.full_name,
            department=emp.department,
            default_shift_code=emp.default_shift_code,
            days=days_cells,
            summary={
                "total_present": total_present,
                "total_absent": total_absent,
                "total_forgot_scan": total_forgot_scan,
                "total_early_leave": total_early,
                "total_hours": round(total_hours, 2),
                "total_ot": round(total_ot, 2),
                "total_meal_allowance": sum(c.meal_allowance for c in days_cells),
                "total_night_allowance": sum(c.night_allowance for c in days_cells),
                "total_paid_leave": len([c for c in days_cells if c.status == "off" and c.notes and "Nghi" not in c.notes]) # Gian luoc
            },
        ))

    return AttendanceMonthResponse(
        month_key=month_key,
        days_in_month=days_in_month,
        rows=rows,
    )
