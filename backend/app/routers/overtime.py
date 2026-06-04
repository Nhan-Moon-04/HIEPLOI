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
from app.models.user import AppUser, UserRole
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
        from sqlalchemy import or_
        emp_q = select(Employee).where(
            and_(
                Employee.is_active == True,
                or_(Employee.join_date.is_(None), Employee.join_date <= last_day)
            )
        )
        if current_user.role == UserRole.WORKER:
            emp_q = emp_q.where(Employee.id == current_user.employee_id)
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


# ─────────────────────────────────────────────────────────────────────────────
# Actual OT (OT thực tế) - Dựa trên chấm công thực tế, không dựa trên cấu hình ca
# ─────────────────────────────────────────────────────────────────────────────

class ActualOTDetail(BaseModel):
    work_date: str
    day: int
    dow: str
    shift_code: Optional[str] = None
    shift_start: Optional[str] = None  # HH:MM
    shift_end: Optional[str] = None    # HH:MM
    check_in: Optional[str] = None     # HH:MM
    check_out: Optional[str] = None    # HH:MM
    standard_hours: float = 8.0
    ot_minutes: int = 0                # OT phút (đã làm tròn 30p)
    ot_hours: float = 0.0             # OT giờ (ot_minutes / 60)
    work_hours: float = 8.0           # Giờ làm = standard_hours
    total_hours: float = 8.0          # Tổng giờ = work_hours + ot_hours


class ActualOTRow(BaseModel):
    employee_id: int
    employee_code: str
    full_name: str
    department: Optional[str] = None
    details: List[ActualOTDetail]
    total_ot_minutes: int = 0
    total_ot_hours: float = 0.0
    total_work_hours: float = 0.0      # Tổng giờ làm (8h × ngày công)
    total_all_hours: float = 0.0       # Tổng giờ = work + OT


class ActualOTResponse(BaseModel):
    month_key: str
    rows: List[ActualOTRow]
    summary: dict


def calc_ot_30min_round(extra_minutes: float) -> int:
    """
    Tính OT làm tròn 30 phút.
    Quy tắc: nếu phút lẻ >= 16 thì làm tròn lên 30p tiếp theo,
    nếu < 16 thì làm tròn xuống.
    Ví dụ:
      16 phút → 30p OT
      15 phút → 0p OT
      46 phút → 60p OT
      45 phút → 30p OT
      76 phút → 90p OT
      75 phút → 60p OT
    """
    if extra_minutes <= 0:
        return 0
    # Số block 30 phút hoàn chỉnh
    full_blocks = int(extra_minutes) // 30
    remainder = extra_minutes - (full_blocks * 30)
    if remainder >= 16:
        full_blocks += 1
    return full_blocks * 30


def round_ot_minutes_to_hours(total_ot_minutes: float) -> float:
    """
    Làm tròn tổng số phút OT sang giờ OT theo quy tắc:
      - Phần phút lẻ từ 0-15p: không tính (làm tròn xuống)
      - Phần phút lẻ từ 16-45p: tính 0.5h OT
      - Phần phút lẻ từ 46-59p: tính 1h OT
    Trả về số giờ OT dạng float (ví dụ: 0.5, 1.0, 7.0, v.v.)
    """
    return calc_ot_30min_round(total_ot_minutes) / 60.0



@router.get("/actual-ot", response_model=ActualOTResponse)
async def get_actual_ot(
    month_key: str = Query(..., description="YYYY-MM"),
    department: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Tính OT thực tế dựa trên chấm công (check-in/check-out) so với ca làm việc.
    - Vào sớm: KHÔNG tính OT (trừ TX1/TX2: vào sớm >= 1h thì tính thêm)
    - Ra trễ: Trừ 30p nghỉ, tính OT theo quy tắc làm tròn 30 phút (>= 16p phút lẻ → tròn lên)
    - NU/XNU: Tự động nhận diện ca sáng/tối từ dữ liệu chấm công
    """
    DRIVER_OT_SHIFT_CODES = {"TX1", "TX2"}

    # XNU shift end times
    XNU_SHIFT_ENDS = {
        "xnu_shift1": time(14, 0),   # Ca 1: 06:00 - 14:00
        "xnu_shift2": time(22, 0),   # Ca 2: 14:00 - 22:00
        "xnu_shift3": time(6, 0),    # Ca 3: 22:00 - 06:00 (next day)
    }
    XNU_SHIFT_STARTS = {
        "xnu_shift1": time(6, 0),
        "xnu_shift2": time(14, 0),
        "xnu_shift3": time(22, 0),
    }
    XNU_SHIFT_LABELS = {
        "xnu_shift1": ("06:00", "14:00"),
        "xnu_shift2": ("14:00", "22:00"),
        "xnu_shift3": ("22:00", "06:00"),
    }
    XNU_IS_NIGHT = {"xnu_shift3"}

    try:
        year, month = map(int, month_key.split("-"))
    except ValueError:
        raise HTTPException(400, "month_key phải là YYYY-MM")

    try:
        days_in_month = calendar.monthrange(year, month)[1]
        first_day = date(year, month, 1)
        last_day = date(year, month, days_in_month)

        # Load shifts
        shift_result = await db.execute(select(ShiftTemplate))
        shifts_by_id = {}
        shifts_by_code = {}
        for s in shift_result.scalars().all():
            shifts_by_id[s.id] = s
            shifts_by_code[s.code] = s

        # Load holidays
        holiday_q = select(CompanyHoliday).where(
            and_(
                CompanyHoliday.holiday_date >= first_day,
                CompanyHoliday.holiday_date <= last_day,
                CompanyHoliday.is_active == True,
            )
        )
        holiday_result = await db.execute(holiday_q)
        holiday_dates = {h.holiday_date for h in holiday_result.scalars().all()}

        # Load employees
        from sqlalchemy import or_
        emp_q = select(Employee).where(
            and_(
                Employee.is_active == True,
                or_(Employee.join_date.is_(None), Employee.join_date <= last_day),
            )
        )
        if current_user.role == UserRole.WORKER:
            emp_q = emp_q.where(Employee.id == current_user.employee_id)
        if department:
            emp_q = emp_q.where(Employee.department == department)
        emp_q = emp_q.order_by(Employee.employee_code)
        emp_result = await db.execute(emp_q)
        employees = list(emp_result.scalars().all())

        # Sort by department order
        from app.models.department import Department
        dept_order_q = await db.execute(select(Department.name, Department.sort_order))
        dept_order_map = {row[0]: row[1] for row in dept_order_q.all() if row[0]}

        def get_emp_sort_key(e):
            d_name = e.department
            d_order = dept_order_map.get(d_name, 9999) if d_name else 9999
            e_order = e.sort_order if e.sort_order is not None else 9999
            try:
                code_num = int(e.employee_code)
            except ValueError:
                code_num = 999999
            return (d_order, d_name or "", e_order, code_num)

        employees.sort(key=get_emp_sort_key)

        emp_id_list = [e.id for e in employees]

        # Load schedule overrides
        schedule_q = select(WorkSchedule).where(WorkSchedule.month_key == month_key)
        if emp_id_list:
            schedule_q = schedule_q.where(WorkSchedule.employee_id.in_(emp_id_list))
        schedule_result = await db.execute(schedule_q)
        override_map = {}
        for ws in schedule_result.scalars().all():
            override_map[(ws.employee_id, ws.work_date)] = ws.shift_id

        # Load attendance data
        att_q = select(AttendanceDaily).where(
            and_(AttendanceDaily.work_date >= first_day, AttendanceDaily.work_date <= last_day)
        )
        if emp_id_list:
            att_q = att_q.where(AttendanceDaily.employee_id.in_(emp_id_list))
        att_result = await db.execute(att_q)
        att_map = {}
        for a in att_result.scalars().all():
            att_map[(a.employee_id, a.work_date)] = a

        # Load raw logs for NU mode detection
        log_q = select(AttendanceLog).where(
            and_(
                AttendanceLog.event_time >= datetime.combine(first_day, time(0, 0)),
                AttendanceLog.event_time <= datetime.combine(last_day + timedelta(days=1), time(12, 0)),
            )
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

        # Build NU shift code map
        nu_shift_code_map = {}
        for emp in employees:
            default_shift = shifts_by_code.get(emp.default_shift_code)
            for d in range(1, days_in_month + 1):
                dt = date(year, month, d)
                override_id = override_map.get((emp.id, dt))
                if override_id:
                    s = shifts_by_id.get(override_id)
                    if s and is_nu_dynamic_shift_code(s.code):
                        nu_shift_code_map[(emp.id, dt)] = s.code
                elif default_shift and is_nu_dynamic_shift_code(default_shift.code):
                    nu_shift_code_map[(emp.id, dt)] = default_shift.code

        nu_results = build_nu_shift_day_results(
            nu_shift_code_map=nu_shift_code_map,
            employee_id_list=emp_id_list,
            attendance_log_rows=logs_with_id,
        )

        def parse_time_val(t):
            if t is None:
                return None
            if isinstance(t, time):
                return t
            if isinstance(t, str):
                parts = t.split(":")
                return time(int(parts[0]), int(parts[1]))
            return None

        # Build rows
        rows = []
        grand_total_ot_minutes = 0
        grand_total_ot_hours = 0.0
        employees_with_ot = 0

        for emp in employees:
            default_shift = shifts_by_code.get(emp.default_shift_code)
            details = []
            emp_total_ot_minutes = 0
            emp_total_work_hours = 0.0

            for d in range(1, days_in_month + 1):
                dt = date(year, month, d)
                dow_idx = dt.weekday()
                dow = DOW_VN[dow_idx]
                is_sunday = dow == "CN"
                is_holiday = dt in holiday_dates

                if is_holiday:
                    continue

                # Check if this is a NU/XNU shift
                nu_res = nu_results.get((emp.id, dt))

                if nu_res:
                    # ── NU/XNU shift ──
                    check_in_dt = nu_res.check_in
                    check_out_dt = nu_res.check_out
                    if not check_in_dt or not check_out_dt:
                        continue

                    nu_mode = nu_res.mode
                    shift_code_display = nu_res.shift_code

                    # Determine shift end time based on mode
                    if nu_mode in XNU_SHIFT_ENDS:
                        # XNU
                        shift_end_t = XNU_SHIFT_ENDS[nu_mode]
                        is_night = nu_mode in XNU_IS_NIGHT
                        label_start, label_end = XNU_SHIFT_LABELS.get(nu_mode, ("?", "?"))
                    elif nu_mode == "night":
                        # NU night: check-in evening → check-out next day morning ~06:00
                        shift_end_t = time(6, 0)
                        is_night = True
                        label_start = "18:00"
                        label_end = "06:00"
                    else:
                        # NU morning: 06:00 - 18:00 (roughly)
                        shift_end_t = time(18, 0)
                        is_night = False
                        label_start = "06:00"
                        label_end = "18:00"

                    shift_start_t = parse_time_val(label_start) or time(6, 0)
                    standard_hours = float(nu_res.standard_hours) if nu_res.standard_hours else 8.0

                    if is_sunday:
                        # Apply Sunday rule for NU/XNU:
                        # 1. work_hours = 0
                        # 2. total worked hours (in_shift + post_shift) * 2
                        shift_start_dt = datetime.combine(dt, shift_start_t)
                        if is_night:
                            shift_end_dt = datetime.combine(dt + timedelta(days=1), shift_end_t)
                        else:
                            shift_end_dt = datetime.combine(dt, shift_end_t)

                        work_start = max(check_in_dt, shift_start_dt)
                        work_end = min(check_out_dt, shift_end_dt)

                        if work_end > work_start:
                            raw_in_shift_minutes = (work_end - work_start).total_seconds() / 60.0
                            if raw_in_shift_minutes > 4.5 * 60:
                                shift_duration = (shift_end_dt - shift_start_dt).total_seconds() / 60.0
                                break_minutes = shift_duration - standard_hours * 60
                                raw_in_shift_minutes = max(0.0, raw_in_shift_minutes - max(0.0, break_minutes))
                        else:
                            raw_in_shift_minutes = 0.0

                        raw_post_shift_minutes = 0.0
                        late_minutes = (check_out_dt - shift_end_dt).total_seconds() / 60.0
                        if late_minutes > 0:
                            adjusted_late = late_minutes - 30
                            if adjusted_late > 0:
                                raw_post_shift_minutes = adjusted_late

                        raw_total_ot_minutes = (raw_in_shift_minutes + raw_post_shift_minutes) * 2.0
                        ot_hours_val = round_ot_minutes_to_hours(raw_total_ot_minutes)
                        ot_minutes = int(ot_hours_val * 60)
                        work_hours = 0.0
                    else:
                        # Weekday logic for NU/XNU (original logic)
                        if is_night:
                            expected_end = datetime.combine(dt + timedelta(days=1), shift_end_t)
                        else:
                            expected_end = datetime.combine(dt, shift_end_t)

                        late_minutes = (check_out_dt - expected_end).total_seconds() / 60.0
                        raw_post_shift_minutes = 0.0
                        if late_minutes > 0:
                            # Trừ 30 phút nghỉ ngơi
                            adjusted_late = late_minutes - 30
                            if adjusted_late > 0:
                                raw_post_shift_minutes = adjusted_late

                        raw_total_ot_minutes = raw_post_shift_minutes
                        ot_hours_val = round_ot_minutes_to_hours(raw_total_ot_minutes)
                        ot_minutes = int(ot_hours_val * 60)
                        work_hours = standard_hours
                    if ot_minutes <= 0:
                        continue

                    total_hours = work_hours + ot_hours_val

                    details.append(ActualOTDetail(
                        work_date=str(dt),
                        day=d,
                        dow=dow,
                        shift_code=shift_code_display,
                        shift_start=label_start,
                        shift_end=label_end,
                        check_in=check_in_dt.strftime("%H:%M"),
                        check_out=check_out_dt.strftime("%H:%M"),
                        standard_hours=standard_hours,
                        ot_minutes=int(ot_hours_val * 60),
                        ot_hours=ot_hours_val,
                        work_hours=work_hours,
                        total_hours=total_hours,
                    ))
                    emp_total_ot_minutes += int(ot_hours_val * 60)
                    emp_total_work_hours += work_hours

                else:
                    # ── Regular / TX shifts ──
                    override_id = override_map.get((emp.id, dt))
                    if override_id:
                        shift = shifts_by_id.get(override_id)
                    else:
                        if is_sunday:
                            shift = default_shift if (default_shift and (default_shift.code or "").upper() in DRIVER_OT_SHIFT_CODES) else None
                        else:
                            shift = default_shift

                    # Check validation
                    if not is_sunday:
                        if not shift or shift.is_leave_code:
                            continue
                    else:
                        if shift and shift.is_leave_code:
                            continue

                    att = att_map.get((emp.id, dt))
                    if not att or not att.first_check_in or not att.last_check_out:
                        continue

                    check_in_dt = att.first_check_in
                    check_out_dt = att.last_check_out

                    # Choose reference shift to determine start/end times
                    ref_shift = shift or default_shift
                    if ref_shift and not ref_shift.is_leave_code:
                        shift_start_t = parse_time_val(ref_shift.start_time) or time(7, 0)
                        shift_end_t = parse_time_val(ref_shift.end_time) or time(16, 0)
                        standard_hours = float(ref_shift.standard_hours or 8)
                        is_night = ref_shift.is_night_shift
                        shift_code = ref_shift.code
                    else:
                        shift_start_t = time(7, 0)
                        shift_end_t = time(16, 0)
                        standard_hours = 8.0
                        is_night = False
                        shift_code = "X"

                    shift_code_upper = (shift_code or "").upper()
                    is_driver = shift_code_upper in DRIVER_OT_SHIFT_CODES

                    # 1. Early entry for drivers
                    raw_early_ot_minutes = 0.0
                    if is_driver:
                        expected_start = datetime.combine(dt, shift_start_t)
                        early_seconds = (expected_start - check_in_dt).total_seconds()
                        early_hours = early_seconds / 3600.0
                        if early_hours >= 1.0:
                            raw_early_ot_minutes = early_seconds / 60.0

                    # 2. In-shift worked hours
                    shift_start_dt = datetime.combine(dt, shift_start_t)
                    if is_night:
                        shift_end_dt = datetime.combine(dt + timedelta(days=1), shift_end_t)
                    else:
                        shift_end_dt = datetime.combine(dt, shift_end_t)

                    work_start = max(check_in_dt, shift_start_dt)
                    work_end = min(check_out_dt, shift_end_dt)

                    if work_end > work_start:
                        raw_in_shift_minutes = (work_end - work_start).total_seconds() / 60.0
                        # Nếu làm hơn 4.5 tiếng trong ca, trừ giờ nghỉ
                        if raw_in_shift_minutes > 4.5 * 60:
                            shift_duration = (shift_end_dt - shift_start_dt).total_seconds() / 60.0
                            break_minutes = shift_duration - standard_hours * 60
                            raw_in_shift_minutes = max(0.0, raw_in_shift_minutes - max(0.0, break_minutes))
                    else:
                        raw_in_shift_minutes = 0.0

                    # 3. Post-shift worked hours
                    raw_post_shift_minutes = 0.0
                    late_minutes = (check_out_dt - shift_end_dt).total_seconds() / 60.0
                    if late_minutes > 0:
                        # Trừ 30 phút nghỉ ngơi
                        adjusted_late = late_minutes - 30
                        if adjusted_late > 0:
                            raw_post_shift_minutes = adjusted_late

                    # 4. Sunday vs Weekday logic
                    if is_sunday:
                        work_hours = 0.0
                        raw_total_ot_minutes = (raw_in_shift_minutes + raw_post_shift_minutes + raw_early_ot_minutes) * 2.0
                        ot_hours_val = round_ot_minutes_to_hours(raw_total_ot_minutes)
                        total_ot_minutes = int(ot_hours_val * 60)
                    else:
                        work_hours = raw_in_shift_minutes / 60.0
                        raw_total_ot_minutes = raw_early_ot_minutes + raw_post_shift_minutes
                        ot_hours_val = round_ot_minutes_to_hours(raw_total_ot_minutes)
                        total_ot_minutes = int(ot_hours_val * 60)

                    if total_ot_minutes <= 0:
                        continue

                    # Round values
                    work_hours = round(work_hours, 2)
                    ot_hours_val = round(ot_hours_val, 2)
                    total_hours = round(work_hours + ot_hours_val, 2)

                    details.append(ActualOTDetail(
                        work_date=str(dt),
                        day=d,
                        dow=dow,
                        shift_code=shift_code,
                        shift_start=str(shift_start_t)[:5] if shift_start_t else None,
                        shift_end=str(shift_end_t)[:5] if shift_end_t else None,
                        check_in=check_in_dt.strftime("%H:%M"),
                        check_out=check_out_dt.strftime("%H:%M"),
                        standard_hours=standard_hours,
                        ot_minutes=total_ot_minutes,
                        ot_hours=ot_hours_val,
                        work_hours=work_hours,
                        total_hours=total_hours,
                    ))
                    emp_total_ot_minutes += total_ot_minutes
                    emp_total_work_hours += work_hours

            if not details:
                continue

            emp_total_ot_hours = emp_total_ot_minutes / 60.0
            emp_total_work_hours = round(emp_total_work_hours, 2)
            emp_total_all = round(emp_total_work_hours + emp_total_ot_hours, 2)

            rows.append(ActualOTRow(
                employee_id=emp.id,
                employee_code=emp.employee_code,
                full_name=emp.full_name,
                department=emp.department,
                details=details,
                total_ot_minutes=emp_total_ot_minutes,
                total_ot_hours=emp_total_ot_hours,
                total_work_hours=emp_total_work_hours,
                total_all_hours=emp_total_all,
            ))

            grand_total_ot_minutes += emp_total_ot_minutes
            grand_total_ot_hours += emp_total_ot_hours
            employees_with_ot += 1

        return ActualOTResponse(
            month_key=month_key,
            rows=rows,
            summary={
                "total_employees": len(employees),
                "employees_with_ot": employees_with_ot,
                "total_ot_minutes": grand_total_ot_minutes,
                "total_ot_hours": round(grand_total_ot_hours, 2),
            },
        )
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
