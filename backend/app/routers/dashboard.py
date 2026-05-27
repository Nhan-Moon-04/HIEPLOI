from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import date, timedelta
from app.database import get_db
from app.models.employee import Employee
from app.models.attendance import AttendanceDetail, AttendanceDaily
from app.models.user import AppUser, UserRole
from app.models.schedule import WorkSchedule
from app.models.shift import ShiftTemplate
from app.models.holiday import CompanyHoliday
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
async def get_dashboard_stats(
    month_key: str = Query(..., description="Tháng (YYYY-MM)", example="2026-05"),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Lấy thống kê dashboard theo tháng (admin view)"""
    # Total active employees
    emp_result = await db.execute(
        select(func.count()).select_from(Employee).where(Employee.is_active == True)
    )
    total_employees = emp_result.scalar()

    # Attendance records for the month
    att_result = await db.execute(
        select(func.count()).select_from(AttendanceDetail).where(
            AttendanceDetail.month_key == month_key
        )
    )
    total_attendance_records = att_result.scalar()

    # Total hours
    hours_result = await db.execute(
        select(func.coalesce(func.sum(AttendanceDetail.actual_work_hours), 0)).where(
            AttendanceDetail.month_key == month_key
        )
    )
    total_hours = float(hours_result.scalar())

    # Warnings (status N = nghỉ không phép)
    warnings_result = await db.execute(
        select(func.count()).select_from(AttendanceDetail).where(
            AttendanceDetail.month_key == month_key,
            AttendanceDetail.status_code == "N",
        )
    )
    total_warnings = warnings_result.scalar()

    # Attendance rate
    attendance_rate = 0
    if total_employees > 0 and total_attendance_records > 0:
        attendance_rate = round((total_attendance_records / (total_employees * 26)) * 100, 1)

    return {
        "month_key": month_key,
        "total_employees": total_employees,
        "total_attendance_records": total_attendance_records,
        "total_hours": round(total_hours, 2),
        "total_estimated_salary": 0,
        "attendance_rate": attendance_rate,
        "total_warnings": total_warnings,
    }


@router.get("/my-stats")
async def get_my_dashboard_stats(
    month_key: str = Query(..., description="Tháng (YYYY-MM)", example="2026-05"),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Dashboard cá nhân cho công nhân — chỉ xem dữ liệu của mình"""
    employee_id = current_user.employee_id
    if not employee_id:
        return {
            "month_key": month_key,
            "employee": None,
            "attendance": {},
            "leave": {},
            "message": "Tài khoản chưa liên kết nhân viên",
        }

    # Thông tin nhân viên
    emp = await db.get(Employee, employee_id)
    if not emp:
        return {
            "month_key": month_key,
            "employee": None,
            "attendance": {},
            "leave": {},
            "message": "Không tìm thấy nhân viên",
        }

    try:
        year, month = map(int, month_key.split("-"))
    except ValueError:
        year, month = date.today().year, date.today().month

    # ── Chấm công tháng này ──────────────────────────────────────────────
    att_q = select(AttendanceDetail).where(
        and_(
            AttendanceDetail.employee_id == employee_id,
            AttendanceDetail.month_key == month_key,
        )
    )
    att_result = await db.execute(att_q)
    att_records = att_result.scalars().all()

    total_present = sum(1 for a in att_records if a.status_code in ("FULL", "HALF", "full", "early_leave", "short"))
    total_absent = sum(1 for a in att_records if a.status_code in ("N", "absent"))
    total_hours = sum(float(a.actual_work_hours or 0) for a in att_records)
    total_ot = sum(float(a.overtime_hours or 0) for a in att_records)
    total_meal = sum(float(a.meal_allowance_daily or 0) for a in att_records)

    # ── Ngày làm gần nhất (7 ngày gần đây) ──────────────────────────────
    import calendar
    month_days = calendar.monthrange(year, month)[1]
    month_start = date(year, month, 1)
    month_end = date(year, month, month_days)

    recent_att_q = select(AttendanceDaily).where(
        and_(
            AttendanceDaily.employee_id == employee_id,
            AttendanceDaily.work_date >= month_start,
            AttendanceDaily.work_date <= month_end,
        )
    ).order_by(AttendanceDaily.work_date.desc()).limit(7)
    recent_result = await db.execute(recent_att_q)
    recent_records = recent_result.scalars().all()

    recent_days = []
    for r in reversed(recent_records):
        recent_days.append({
            "date": str(r.work_date),
            "check_in": r.first_check_in.strftime("%H:%M") if r.first_check_in else None,
            "check_out": r.last_check_out.strftime("%H:%M") if r.last_check_out else None,
            "hours": float(r.total_hours or 0),
        })

    # ── Phép năm ─────────────────────────────────────────────────────────
    # Đếm số ngày nghỉ phép đã dùng trong năm
    shift_result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.is_paid_leave == True))
    paid_leave_shifts = {s.id: s for s in shift_result.scalars().all()}

    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    leave_q = select(WorkSchedule).where(
        and_(
            WorkSchedule.employee_id == employee_id,
            WorkSchedule.work_date >= year_start,
            WorkSchedule.work_date <= year_end,
        )
    )
    leave_result = await db.execute(leave_q)
    leave_used = 0.0
    for ws in leave_result.scalars().all():
        if ws.shift_id in paid_leave_shifts:
            s = paid_leave_shifts[ws.shift_id]
            if s.code == "P":
                leave_used += 1.0
            elif s.code in ("S", "C"):
                leave_used += 0.5

    leave_total = 12.0
    leave_remaining = leave_total - leave_used

    return {
        "month_key": month_key,
        "employee": {
            "id": emp.id,
            "employee_code": emp.employee_code,
            "full_name": emp.full_name,
            "department": emp.department,
            "position": emp.position,
            "join_date": str(emp.join_date) if emp.join_date else None,
            "base_salary": float(emp.base_salary) if emp.base_salary else 0,
        },
        "attendance": {
            "total_present": total_present,
            "total_absent": total_absent,
            "total_hours": round(total_hours, 2),
            "total_ot": round(total_ot, 2),
            "total_meal_allowance": round(total_meal, 0),
            "total_records": len(att_records),
        },
        "leave": {
            "total": leave_total,
            "used": leave_used,
            "remaining": max(0, leave_remaining),
        },
        "recent_days": recent_days,
    }
