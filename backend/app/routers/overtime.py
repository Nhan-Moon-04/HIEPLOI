from typing import List, Optional
from datetime import date
import calendar
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.database import get_db
from app.models.schedule import WorkSchedule
from app.models.employee import Employee
from app.models.shift import ShiftTemplate
from app.models.user import AppUser
from app.middleware.auth import get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/overtime", tags=["Overtime - Tang Ca"])

DOW_VN = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]


class OvertimeRow(BaseModel):
    employee_id: int
    employee_code: str
    full_name: str
    department: Optional[str] = None
    default_shift_code: Optional[str] = None
    days: dict  # {1: {shift: "D", ot: 2.0, is_sunday: false}, ...}
    total_ot_normal: float  # OT ngay thuong (x1.5)
    total_ot_sunday: float  # OT chu nhat (x2.0)
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
    """Tinh OT theo thang dua tren lich lam + ma ca"""
    try:
        year, month = map(int, month_key.split("-"))
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(400, "month_key phai la YYYY-MM")

    days_in_month = calendar.monthrange(year, month)[1]

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
    shifts_by_id = {}
    shifts_by_code = {}
    for s in shift_result.scalars().all():
        shifts_by_id[s.id] = s
        shifts_by_code[s.code] = s

    # Load active employees
    first_day = date(year, month, 1)
    last_day = date(year, month, days_in_month)
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

    # Build OT data
    rows = []
    grand_ot_normal = 0
    grand_ot_sunday = 0

    for emp in employees:
        days_data = {}
        emp_ot_normal = 0.0
        emp_ot_sunday = 0.0

        default_shift = shifts_by_code.get(emp.default_shift_code)

        for d in range(1, days_in_month + 1):
            is_sunday = d in sundays

            # Determine shift for this day
            override_shift_id = override_map.get((emp.id, d))
            if override_shift_id:
                shift = shifts_by_id.get(override_shift_id)
            else:
                shift = None if is_sunday else default_shift

            if not shift:
                days_data[d] = {"shift": None, "ot": 0, "is_sunday": is_sunday}
                continue

            ot_hours = float(shift.default_overtime_hours or 0)

            # Sunday = all work hours count as OT x2
            # For Sunday with default shift that has standard_hours but no explicit OT,
            # the standard_hours become OT
            if is_sunday and shift and not shift.is_leave_code:
                if ot_hours == 0:
                    # Sunday default: standard hours count as OT
                    ot_hours = float(shift.standard_hours or 0)
                emp_ot_sunday += ot_hours
            elif ot_hours > 0:
                emp_ot_normal += ot_hours

            days_data[d] = {
                "shift": shift.code,
                "ot": ot_hours,
                "is_sunday": is_sunday,
            }

        total_ot = emp_ot_normal + emp_ot_sunday
        grand_ot_normal += emp_ot_normal
        grand_ot_sunday += emp_ot_sunday

        rows.append(OvertimeRow(
            employee_id=emp.id,
            employee_code=emp.employee_code,
            full_name=emp.full_name,
            department=emp.department,
            default_shift_code=emp.default_shift_code,
            days=days_data,
            total_ot_normal=emp_ot_normal,
            total_ot_sunday=emp_ot_sunday,
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
            "total_ot_hours": grand_ot_normal + grand_ot_sunday,
        },
    )
