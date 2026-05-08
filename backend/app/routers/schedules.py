from typing import List, Optional
from datetime import date
import calendar
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete
from app.database import get_db
from app.models.schedule import WorkSchedule
from app.models.employee import Employee
from app.models.shift import ShiftTemplate
from app.models.user import AppUser, UserRole
from app.middleware.auth import get_current_user, require_roles
from pydantic import BaseModel

router = APIRouter(prefix="/schedules", tags=["Schedules - Lich Lam"])


class ScheduleCell(BaseModel):
    employee_id: int
    employee_code: str
    full_name: str
    department: Optional[str] = None
    default_shift_code: Optional[str] = None
    days: dict  # {1: "X", 2: "D", 3: null, ...} null = default shift


class ScheduleMonthResponse(BaseModel):
    month_key: str
    year: int
    month: int
    days_in_month: int
    weekdays: dict  # {1: "T4", 2: "T5", ...}
    rows: List[ScheduleCell]


class ScheduleUpdateRequest(BaseModel):
    employee_id: int
    day: int
    shift_code: Optional[str] = None  # null = remove override, use default


DOW_VN = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]


@router.get("", response_model=ScheduleMonthResponse)
async def get_schedule(
    month_key: str = Query(..., description="YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Lay lich lam ca thang - grid NV x ngay"""
    try:
        year, month = map(int, month_key.split("-"))
    except ValueError:
        raise HTTPException(400, "month_key phai la YYYY-MM")

    days_in_month = calendar.monthrange(year, month)[1]

    # Weekday labels
    weekdays = {}
    for d in range(1, days_in_month + 1):
        dt = date(year, month, d)
        weekdays[d] = DOW_VN[dt.weekday()]

    # Get active employees for this month
    first_day = date(year, month, 1)
    last_day = date(year, month, days_in_month)
    emp_q = select(Employee).where(
        and_(
            Employee.is_active == True,
            Employee.join_date <= last_day,
        )
    ).order_by(Employee.employee_code)
    emp_result = await db.execute(emp_q)
    employees = emp_result.scalars().all()

    # Get all schedule overrides for this month
    schedule_q = select(WorkSchedule).where(WorkSchedule.month_key == month_key)
    schedule_result = await db.execute(schedule_q)
    schedules = schedule_result.scalars().all()

    # Build lookup: (employee_id, day) -> shift_code
    override_map = {}
    # We need shift_id -> code mapping
    shift_q = select(ShiftTemplate)
    shift_result = await db.execute(shift_q)
    shifts = {s.id: s.code for s in shift_result.scalars().all()}

    for ws in schedules:
        day = ws.work_date.day
        shift_code = shifts.get(ws.shift_id, "?")
        override_map[(ws.employee_id, day)] = shift_code

    # Build response rows
    rows = []
    for emp in employees:
        days = {}
        for d in range(1, days_in_month + 1):
            key = (emp.id, d)
            if key in override_map:
                days[d] = override_map[key]
            else:
                days[d] = None  # null = use default
        rows.append(ScheduleCell(
            employee_id=emp.id,
            employee_code=emp.employee_code,
            full_name=emp.full_name,
            department=emp.department,
            default_shift_code=emp.default_shift_code,
            days=days,
        ))

    return ScheduleMonthResponse(
        month_key=month_key,
        year=year,
        month=month,
        days_in_month=days_in_month,
        weekdays=weekdays,
        rows=rows,
    )


@router.put("/cell")
async def update_schedule_cell(
    request: ScheduleUpdateRequest,
    month_key: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Cap nhat 1 o lich lam - thay doi ca cho 1 NV 1 ngay"""
    try:
        year, month = map(int, month_key.split("-"))
    except ValueError:
        raise HTTPException(400, "month_key phai la YYYY-MM")

    work_date = date(year, month, request.day)

    if request.shift_code is None:
        # Remove override - revert to default
        await db.execute(
            delete(WorkSchedule).where(
                and_(
                    WorkSchedule.employee_id == request.employee_id,
                    WorkSchedule.work_date == work_date,
                )
            )
        )
        await db.commit()
        return {"message": "Da xoa override, dung ca mac dinh"}

    # Find shift
    shift_result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.code == request.shift_code))
    shift = shift_result.scalar_one_or_none()
    if not shift:
        raise HTTPException(400, f"Ma ca '{request.shift_code}' khong ton tai")

    # Upsert
    existing = await db.execute(
        select(WorkSchedule).where(
            and_(
                WorkSchedule.employee_id == request.employee_id,
                WorkSchedule.work_date == work_date,
            )
        )
    )
    ws = existing.scalar_one_or_none()
    if ws:
        ws.shift_id = shift.id
    else:
        ws = WorkSchedule(
            employee_id=request.employee_id,
            work_date=work_date,
            month_key=month_key,
            shift_id=shift.id,
        )
        db.add(ws)

    await db.commit()
    return {"message": f"Da cap nhat NV {request.employee_id} ngay {request.day} -> ca {request.shift_code}"}


@router.post("/import")
async def import_schedule(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Import lich lam tu Excel. Format: STT | Ma NV | Ho Ten | ngay1 | ngay2 | ...
    O trong = ca mac dinh (bo qua). O co gia tri = override ca."""
    import openpyxl
    from io import BytesIO

    content = await file.read()
    wb = openpyxl.load_workbook(BytesIO(content), data_only=True)

    # Find schedule sheet
    target_sheet = None
    for name in wb.sheetnames:
        if 'lich' in name.lower() or 'schedule' in name.lower():
            target_sheet = name
            break
    if not target_sheet:
        target_sheet = wb.sheetnames[0]

    ws = wb[target_sheet]

    # Parse header row to find month from title (R1)
    title = str(ws.cell(1, 1).value or "")
    month_key = None
    import re
    m = re.search(r'(\d{1,2})\s*/\s*(\d{4})', title)
    if m:
        month_num = int(m.group(1))
        year_num = int(m.group(2))
        month_key = f"{year_num}-{month_num:02d}"

    if not month_key:
        raise HTTPException(400, "Khong tim thay thang/nam trong tieu de sheet. Format: 'LICH LAM VIEC THANG MM/YYYY'")

    year, month = map(int, month_key.split("-"))
    days_in_month = calendar.monthrange(year, month)[1]

    # R2 = headers: STT, Ma NV, Ho Ten, 1, 2, 3, ...
    # Find column mapping for days
    day_cols = {}
    for c in range(4, ws.max_column + 1):
        day_val = ws.cell(2, c).value
        if day_val is not None:
            try:
                d = int(day_val)
                if 1 <= d <= days_in_month:
                    day_cols[c] = d
            except (ValueError, TypeError):
                pass

    # Load shift code -> id mapping
    shift_result = await db.execute(select(ShiftTemplate))
    shift_map = {}
    for s in shift_result.scalars().all():
        shift_map[s.code.upper()] = s.id
        shift_map[s.code.lower()] = s.id

    # Load employee_code -> id mapping
    emp_result = await db.execute(select(Employee))
    emp_map = {e.employee_code: e.id for e in emp_result.scalars().all()}

    created = 0
    updated = 0
    skipped = 0
    unknown_shifts = set()
    unknown_employees = []

    # R4+ = data rows
    for r in range(4, ws.max_row + 1):
        emp_code = ws.cell(r, 2).value
        if emp_code is None:
            continue
        emp_code = str(int(emp_code) if isinstance(emp_code, float) else emp_code).strip()

        if emp_code not in emp_map:
            unknown_employees.append(emp_code)
            continue

        emp_id = emp_map[emp_code]

        for col, day in day_cols.items():
            cell_val = ws.cell(r, col).value
            if cell_val is None or str(cell_val).strip() == "":
                continue  # Empty = default shift, skip

            shift_code = str(cell_val).strip().upper()

            # Handle special codes
            if shift_code == "O" or shift_code == "OFF":
                shift_code = "OFF"
            if shift_code == "VP40":
                shift_code = "XVP"  # Map VP40 to XVP shift

            if shift_code not in shift_map:
                unknown_shifts.add(shift_code)
                skipped += 1
                continue

            shift_id = shift_map[shift_code]
            work_date = date(year, month, day)

            # Upsert
            existing = await db.execute(
                select(WorkSchedule).where(
                    and_(
                        WorkSchedule.employee_id == emp_id,
                        WorkSchedule.work_date == work_date,
                    )
                )
            )
            ws_record = existing.scalar_one_or_none()
            if ws_record:
                ws_record.shift_id = shift_id
                updated += 1
            else:
                ws_record = WorkSchedule(
                    employee_id=emp_id,
                    work_date=work_date,
                    month_key=month_key,
                    shift_id=shift_id,
                )
                db.add(ws_record)
                created += 1

    await db.commit()

    return {
        "message": f"Import thanh cong! Tao {created}, cap nhat {updated}, bo qua {skipped}",
        "month_key": month_key,
        "sheet": target_sheet,
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "unknown_shifts": list(unknown_shifts) if unknown_shifts else [],
        "unknown_employees": unknown_employees[:10] if unknown_employees else [],
    }
