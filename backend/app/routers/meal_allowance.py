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
from app.models.x_overtime import XOvertimeConfig
from app.models.user import AppUser, UserRole
from app.middleware.auth import get_current_user
from app.services.nu_shift import is_nu_dynamic_shift_code, build_nu_shift_day_results, calculate_nu_shift_details
from app.routers.attendance import check_holiday_applies_to_employee

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
            or_(Employee.join_date.is_(None), Employee.join_date <= end_date),
            or_(Employee.leave_date.is_(None), Employee.leave_date >= start_date),
            or_(Employee.is_active == True, Employee.leave_date.is_not(None)),
        )
    )
    if current_user.role == UserRole.WORKER:
        emp_q = emp_q.where(Employee.id == current_user.employee_id)
    if department:
        emp_q = emp_q.where(Employee.department == department)

    emp_result = await db.execute(emp_q)
    employees = list(emp_result.scalars().all())

    # Sắp xếp nhân viên theo thứ tự bộ phận, sau đó tới thứ tự nhân viên trong bộ phận
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

    holiday_q = select(CompanyHoliday).where(
        and_(
            CompanyHoliday.holiday_date >= start_date,
            CompanyHoliday.holiday_date <= end_date,
            CompanyHoliday.is_active == True,
        )
    )
    holiday_result = await db.execute(holiday_q)
    holidays_in_range = list(holiday_result.scalars().all())
    holiday_dates = {h.holiday_date for h in holidays_in_range}

    # Load holiday targets (for employee scope)
    from app.models.holiday import HolidayTargetEmployee
    holiday_ids = [h.id for h in holidays_in_range]
    holiday_targets_map = {}
    if holiday_ids:
        target_res = await db.execute(
            select(HolidayTargetEmployee.holiday_id, HolidayTargetEmployee.employee_id)
            .where(HolidayTargetEmployee.holiday_id.in_(holiday_ids))
        )
        for h_id, emp_id in target_res.all():
            if h_id not in holiday_targets_map:
                holiday_targets_map[h_id] = set()
            holiday_targets_map[h_id].add(emp_id)

    # Load holiday exceptions
    from app.models.holiday import HolidayException
    exc_q = select(HolidayException.employee_id, CompanyHoliday.holiday_date).join(
        CompanyHoliday, HolidayException.holiday_id == CompanyHoliday.id
    ).where(
        and_(
            CompanyHoliday.holiday_date >= start_date,
            CompanyHoliday.holiday_date <= end_date,
            CompanyHoliday.is_active == True
        )
    )
    exc_res = await db.execute(exc_q)
    holiday_exceptions = {(row[0], row[1]) for row in exc_res.all()}

    sched_q = select(WorkSchedule).where(
        and_(
            WorkSchedule.work_date >= start_date - timedelta(days=1),
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

    # Map employees to department for scope check
    employee_dept_map = {e.id: e.department for e in employees}

    att_map = {}
    att_by_emp = defaultdict(list)
    for att in atts:
        # Check if there is an active holiday that applies to this employee
        active_holiday = None
        for h in holidays_in_range:
            if h.holiday_date == att.work_date:
                is_exception = (att.employee_id, att.work_date) in holiday_exceptions
                if not is_exception and check_holiday_applies_to_employee(h, att.employee_id, employee_dept_map.get(att.employee_id), holiday_targets_map):
                    active_holiday = h
                    break
        
        if active_holiday:
            if active_holiday.duration == "half":
                # Only eligible for meal if they worked (both punches present)
                has_punches = bool(att.first_check_in and att.last_check_out)
                if not has_punches:
                    continue
            else:
                continue

        att_map[(att.employee_id, att.work_date)] = att
        att_by_emp[att.employee_id].append(att.work_date)

    # Load raw logs for NU mode detection
    from app.models.attendance import AttendanceLog
    from datetime import datetime, time, timedelta
    log_q = select(AttendanceLog).where(
        and_(AttendanceLog.event_time >= datetime.combine(start_date - timedelta(days=1), time(0, 0)), 
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
        # Scan all days in range (including 1 day before start_date to properly link cross-boundary night shifts)
        curr = start_date - timedelta(days=1)
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

    # Load X overtime configs cho date range
    xot_q = select(XOvertimeConfig).where(
        and_(
            XOvertimeConfig.work_date >= start_date,
            XOvertimeConfig.work_date <= end_date,
            XOvertimeConfig.employee_id.in_(emp_ids),
        )
    )
    xot_result = await db.execute(xot_q)
    xot_configs = xot_result.scalars().all()
    # Map: (employee_id, work_date) -> XOvertimeConfig
    xot_map = {(c.employee_id, c.work_date): c for c in xot_configs}

    # Load MealApproval data cho giờ làm bất thường
    from app.models.meal_approval import MealApproval
    approval_q = select(MealApproval).where(
        and_(
            MealApproval.work_date >= start_date,
            MealApproval.work_date <= end_date,
            MealApproval.employee_id.in_(emp_ids),
        )
    )
    approval_result = await db.execute(approval_q)
    approval_map = {(a.employee_id, a.work_date): a for a in approval_result.scalars().all()}

    rows = []
    total_meal = 0.0
    total_work_days = 0
    total_night_shifts = 0
    total_meal_count = 0
    total_leave_days = 0

    for emp in employees:
        default_shift = shifts_by_code.get(emp.default_shift_code) if emp.default_shift_code else None
        worked_dates = att_by_emp.get(emp.id, [])
        
        # Nếu là ca sếp (SEP), sếp không cần chấm công nhưng vẫn tính đủ các ngày từ Thứ 2 đến Thứ 7 (trừ ngày lễ)
        is_sep_emp = (default_shift and default_shift.code.upper() == "SEP")
        has_sep_override = False
        curr = start_date
        while curr <= end_date:
            sid = sched_map.get((emp.id, curr))
            if sid:
                s = shifts_by_id.get(sid)
                if s and s.code.upper() == "SEP":
                    has_sep_override = True
                    break
            curr += timedelta(days=1)
            
        if is_sep_emp or has_sep_override:
            all_dates_in_period = []
            curr = start_date
            while curr <= end_date:
                if (emp.join_date and curr < emp.join_date) or (emp.leave_date and curr > emp.leave_date):
                    curr += timedelta(days=1)
                    continue
                is_holiday_for_emp = False
                for h in holidays_in_range:
                    if h.holiday_date == curr:
                        is_exception = (emp.id, curr) in holiday_exceptions
                        if not is_exception and check_holiday_applies_to_employee(h, emp.id, emp.department, holiday_targets_map):
                            is_holiday_for_emp = True
                            break
                if curr.weekday() != 6 and not is_holiday_for_emp:  # Không tính chủ nhật và ngày lễ
                    all_dates_in_period.append(curr)
                curr += timedelta(days=1)
            worked_dates = all_dates_in_period

        meal_rates = Counter()
        work_days = 0
        night_shifts = 0
        total_emp_meal = 0.0
        emp_meal_count = 0

        for work_date in worked_dates:
            if (emp.join_date and work_date < emp.join_date) or (emp.leave_date and work_date > emp.leave_date):
                continue
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

            # Ghi đè số bữa ăn và tiền ăn động cho ca của sếp (SEP)
            if shift.code.upper() == "SEP":
                meal_rate_val = float(shift.meal_allowance or 40000)
                dow_idx = work_date.weekday()
                if dow_idx <= 4:  # Thứ 2 - Thứ 6
                    day_meal_count = 2
                elif dow_idx == 5:  # Thứ 7
                    day_meal_count = 1
                else:
                    day_meal_count = 0
                
                day_meal_total = meal_rate_val * day_meal_count
                total_emp_meal += day_meal_total
                work_days += 1
                meal_rates[meal_rate_val] += 1
                emp_meal_count += day_meal_count
                continue

            # Check if we have NU result for this day
            nu_res = nu_results.get((emp.id, work_date))
            if nu_res:
                # Kiểm tra giờ bất thường và approval
                if nu_res.is_irregular:
                    approval = approval_map.get((emp.id, work_date))
                    if approval and approval.status == "approved":
                        # Đã duyệt → tính tiền ăn theo approved_meal_count
                        approved_count = approval.approved_meal_count or 1
                        meal = 35000.0 * approved_count
                        total_emp_meal += meal
                        work_days += 1
                        meal_rates[meal] += 1
                        emp_meal_count += approved_count
                        # Nếu ca đêm và đã duyệt → tính PC đêm
                        from app.services.nu_shift import XNU_MODE_3 as _XNU3, NU_NIGHT_MODE as _NUN
                        if nu_res.mode in (_XNU3, _NUN) and night_allowance > 0:
                            night_shifts += 1
                            total_emp_meal += night_allowance
                    else:
                        # pending hoặc rejected → không tính tiền ăn, nhưng vẫn đếm ngày đi làm
                        work_days += 1
                else:
                    if nu_res.check_in or nu_res.check_out or nu_res.meal_count > 0:
                        meal = nu_res.meal_allowance
                        total_emp_meal += meal
                        work_days += 1
                        meal_rates[meal] += 1
                        
                        if nu_res.night_allowance and nu_res.night_allowance > 0:
                            night_shifts += 1
                            total_emp_meal += nu_res.night_allowance
                        
                        emp_meal_count += nu_res.meal_count

                # XNU: cộng thêm tiền ăn OT thủ công nếu có config
                if nu_res.shift_code == "XNU":
                    xot = xot_map.get((emp.id, work_date))
                    if xot and xot.meal_count and xot.meal_count > 0:
                        ot_meal = 35000.0 * int(xot.meal_count)
                        total_emp_meal += ot_meal
                        emp_meal_count += int(xot.meal_count)
                        # Nếu ot_end_time >= 23h thì cộng phụ cấp ca đêm
                        if xot.ot_end_time:
                            from datetime import time as dt_time
                            ot_end = xot.ot_end_time
                            if hasattr(ot_end, 'hour') and ot_end.hour >= 23:
                                total_emp_meal += night_allowance
                                if nu_res.night_allowance <= 0:
                                    night_shifts += 1
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
                meal_rate_val = to_float(shift.meal_allowance)
                is_holiday_for_emp = False
                for h in holidays_in_range:
                    if h.holiday_date == work_date:
                        is_exception = (emp.id, work_date) in holiday_exceptions
                        if not is_exception and check_holiday_applies_to_employee(h, emp.id, emp.department, holiday_targets_map):
                            is_holiday_for_emp = True
                            break
                is_sunday_or_holiday = work_date.weekday() == 6 or is_holiday_for_emp

                if shift.code.upper() in ("TX1", "TX2") and is_sunday_or_holiday:
                    # Chủ nhật/lễ: dùng giờ thực tế, không dùng ot>=3 (tránh tính 2 bữa khi về trước 18h)
                    att = att_map.get((emp.id, work_date))
                    ci = att.first_check_in if att else None
                    co = att.last_check_out if att else None
                    has_morning = bool(ci and ci.hour < 9)
                    has_late = bool(
                        (co and (co.hour * 60 + co.minute) >= 17 * 60 + 50)
                        or (ci and ci.hour >= 18)
                    )
                    day_meal_count = (1 if has_morning else 0) + (1 if has_late else 0)
                else:
                    day_meal_count = int(shift.meal_count or 1)  # số bữa mặc định của ca

                if meal_rate_val <= 0:
                    continue

                day_meal_total = meal_rate_val * day_meal_count  # tiền ăn = đơn giá × số bữa
                total_emp_meal += day_meal_total
                work_days += 1
                meal_rates[meal_rate_val] += 1
                emp_meal_count += day_meal_count

                if shift.is_night_shift:
                    night_shifts += 1
                    if night_allowance > 0:
                        total_emp_meal += night_allowance

                # Cộng thêm tiền ăn OT ca X/X40 nếu có config
                if shift.code in ('X', 'X40'):
                    xot = xot_map.get((emp.id, work_date))
                    if xot and xot.meal_count and xot.meal_count > 0:
                        ot_meal = meal_rate_val * int(xot.meal_count)
                        total_emp_meal += ot_meal
                        emp_meal_count += int(xot.meal_count)

        day_shifts = max(work_days - night_shifts, 0)

        default_shift = shifts_by_code.get(emp.default_shift_code) if emp.default_shift_code else None
        default_meal = to_float(default_shift.meal_allowance) if default_shift else 0.0
        if meal_rates:
            meal_rate = float(max(meal_rates, key=meal_rates.get))
        else:
            meal_rate = default_meal

        emp_holiday_dates = set()
        for h in holidays_in_range:
            is_exception = (emp.id, h.holiday_date) in holiday_exceptions
            if not is_exception and check_holiday_applies_to_employee(h, emp.id, emp.department, holiday_targets_map):
                if (not emp.join_date or h.holiday_date >= emp.join_date) and (not emp.leave_date or h.holiday_date <= emp.leave_date):
                    emp_holiday_dates.add(h.holiday_date)

        leave_dates = set(emp_holiday_dates)
        for l_dt in leave_dates_by_emp.get(emp.id, set()):
            if (not emp.join_date or l_dt >= emp.join_date) and (not emp.leave_date or l_dt <= emp.leave_date):
                leave_dates.add(l_dt)
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
