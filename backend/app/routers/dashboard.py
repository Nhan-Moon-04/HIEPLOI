from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.employee import Employee
from app.models.attendance import AttendanceDetail
from app.models.user import AppUser
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
async def get_dashboard_stats(
    month_key: str = Query(..., description="Tháng (YYYY-MM)", example="2026-05"),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Lấy thống kê dashboard theo tháng"""
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
