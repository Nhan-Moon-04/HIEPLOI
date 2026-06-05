from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, extract, and_, delete
from pydantic import BaseModel
from app.database import get_db
from app.models.holiday import CompanyHoliday, HolidayException, HolidayTargetEmployee
from app.models.employee import Employee
from app.models.user import AppUser, UserRole
from app.schemas.holiday import HolidayCreate, HolidayUpdate, HolidayResponse, HolidayBulkGenerate
from app.middleware.auth import get_current_user, require_roles
from app.utils.lock_helper import check_date_locked, check_month_locked

router = APIRouter(prefix="/holidays", tags=["Holidays - Ngay Le"])

# Ngay le co dinh cua Viet Nam (day, month, name)
VN_HOLIDAYS = [
    (1, 1, "Tet Duong lich"),
    (29, 4, "Ngay Giai phong mien Nam"),
    (30, 4, "Ngay Giai phong mien Nam"),
    (1, 5, "Ngay Quoc te Lao dong"),
    (2, 9, "Ngay Quoc khanh"),
    (3, 9, "Ngay Quoc khanh (bu)"),
]

# Am lich (tet) - approximate, admin can adjust
TET_DATES_BY_YEAR = {
    2025: [(28, 1), (29, 1), (30, 1), (31, 1), (1, 2), (2, 2), (3, 2)],
    2026: [(16, 2), (17, 2), (18, 2), (19, 2), (20, 2), (21, 2), (22, 2)],
    2027: [(5, 2), (6, 2), (7, 2), (8, 2), (9, 2), (10, 2), (11, 2)],
    2028: [(25, 1), (26, 1), (27, 1), (28, 1), (29, 1), (30, 1), (31, 1)],
}

HUNG_KINGS_BY_YEAR = {
    2025: (7, 4),
    2026: (26, 3),
    2027: (15, 4),
    2028: (3, 4),
}


@router.get("", response_model=List[HolidayResponse])
async def list_holidays(
    month_key: Optional[str] = Query(None, description="YYYY-MM"),
    year: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Danh sach ngay le/nghi - chi Admin"""
    import traceback
    try:
        query = select(CompanyHoliday)

        if month_key:
            try:
                y, m = map(int, month_key.split("-"))
                query = query.where(
                    and_(
                        extract("year", CompanyHoliday.holiday_date) == y,
                        extract("month", CompanyHoliday.holiday_date) == m,
                    )
                )
            except ValueError:
                pass
        elif year:
            query = query.where(extract("year", CompanyHoliday.holiday_date) == year)

        query = query.order_by(CompanyHoliday.holiday_date)
        result = await db.execute(query)
        holidays = result.scalars().all()

        # Batch load target employee IDs
        holiday_ids = [h.id for h in holidays]
        target_employees_map = {}
        if holiday_ids:
            target_res = await db.execute(
                select(HolidayTargetEmployee.holiday_id, HolidayTargetEmployee.employee_id)
                .where(HolidayTargetEmployee.holiday_id.in_(holiday_ids))
            )
            for h_id, emp_id in target_res.all():
                if h_id not in target_employees_map:
                    target_employees_map[h_id] = []
                target_employees_map[h_id].append(emp_id)

        response_data = []
        for h in holidays:
            resp = HolidayResponse.model_validate(h)
            resp.target_employee_ids = target_employees_map.get(h.id, [])
            response_data.append(resp)

        return response_data
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=HolidayResponse, status_code=201)
async def create_holiday(
    request: HolidayCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Tao ngay le/nghi moi - chi Admin"""
    await check_date_locked(db, request.holiday_date)
    existing = await db.execute(
        select(CompanyHoliday).where(CompanyHoliday.holiday_date == request.holiday_date)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Ngay {request.holiday_date} da ton tai")

    create_data = request.model_dump()
    target_employee_ids = create_data.pop("target_employee_ids", None) or []

    holiday = CompanyHoliday(
        **create_data,
        created_by=current_user.username,
    )
    db.add(holiday)
    await db.flush()

    if request.scope == "employee" and target_employee_ids:
        for emp_id in target_employee_ids:
            target_emp = HolidayTargetEmployee(holiday_id=holiday.id, employee_id=emp_id)
            db.add(target_emp)

    await db.commit()
    await db.refresh(holiday)

    resp = HolidayResponse.model_validate(holiday)
    resp.target_employee_ids = target_employee_ids
    return resp


@router.put("/{holiday_id}", response_model=HolidayResponse)
async def update_holiday(
    holiday_id: int,
    request: HolidayUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Cap nhat ngay le - ho tro scope, duration, target employees"""
    result = await db.execute(select(CompanyHoliday).where(CompanyHoliday.id == holiday_id))
    holiday = result.scalar_one_or_none()
    if not holiday:
        raise HTTPException(status_code=404, detail="Ngay le khong ton tai")

    await check_date_locked(db, holiday.holiday_date)

    update_data = request.model_dump(exclude_unset=True)
    target_employee_ids = update_data.pop("target_employee_ids", None)

    for key, value in update_data.items():
        setattr(holiday, key, value)

    if target_employee_ids is not None:
        await db.execute(
            delete(HolidayTargetEmployee).where(HolidayTargetEmployee.holiday_id == holiday_id)
        )
        if holiday.scope == "employee" and target_employee_ids:
            for emp_id in target_employee_ids:
                target_emp = HolidayTargetEmployee(holiday_id=holiday_id, employee_id=emp_id)
                db.add(target_emp)
    elif holiday.scope != "employee":
        await db.execute(
            delete(HolidayTargetEmployee).where(HolidayTargetEmployee.holiday_id == holiday_id)
        )

    await db.commit()
    await db.refresh(holiday)

    target_res = await db.execute(
        select(HolidayTargetEmployee.employee_id)
        .where(HolidayTargetEmployee.holiday_id == holiday_id)
    )
    current_target_ids = target_res.scalars().all()

    resp = HolidayResponse.model_validate(holiday)
    resp.target_employee_ids = current_target_ids
    return resp


@router.patch("/{holiday_id}/toggle", response_model=HolidayResponse)
async def toggle_holiday(
    holiday_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Toggle bat/tat ngay nghi. is_active=True => nghi, is_active=False => di lam binh thuong"""
    result = await db.execute(select(CompanyHoliday).where(CompanyHoliday.id == holiday_id))
    holiday = result.scalar_one_or_none()
    if not holiday:
        raise HTTPException(status_code=404, detail="Ngay le khong ton tai")

    await check_date_locked(db, holiday.holiday_date)

    holiday.is_active = not holiday.is_active
    await db.commit()
    await db.refresh(holiday)

    target_res = await db.execute(
        select(HolidayTargetEmployee.employee_id)
        .where(HolidayTargetEmployee.holiday_id == holiday_id)
    )
    current_target_ids = target_res.scalars().all()

    resp = HolidayResponse.model_validate(holiday)
    resp.target_employee_ids = current_target_ids
    return resp


@router.delete("/{holiday_id}")
async def delete_holiday(
    holiday_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Xoa ngay le"""
    result = await db.execute(select(CompanyHoliday).where(CompanyHoliday.id == holiday_id))
    holiday = result.scalar_one_or_none()
    if not holiday:
        raise HTTPException(status_code=404, detail="Ngay le khong ton tai")

    await check_date_locked(db, holiday.holiday_date)

    await db.delete(holiday)
    await db.commit()
    return {"message": f"Da xoa ngay le {holiday.holiday_date}"}


@router.post("/generate-vn", response_model=dict)
async def generate_vn_holidays(
    request: HolidayBulkGenerate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Tu dong tao cac ngay le Viet Nam trong thang hien tai."""
    await check_month_locked(db, request.month_key)
    try:
        year, month = map(int, request.month_key.split("-"))
    except ValueError:
        raise HTTPException(400, "month_key phai la YYYY-MM")

    created = 0
    skipped = 0

    holidays_to_create = []

    # Fixed holidays
    for day, m, name in VN_HOLIDAYS:
        if m == month:
            try:
                holidays_to_create.append((date(year, m, day), name, "national"))
            except ValueError:
                pass

    # Tet Nguyen Dan
    tet_dates = TET_DATES_BY_YEAR.get(year)
    if tet_dates:
        for i, (day, m) in enumerate(tet_dates):
            if m == month:
                try:
                    holidays_to_create.append(
                        (date(year, m, day), f"Tet Nguyen Dan (ngay {i+1})", "national")
                    )
                except ValueError:
                    pass

    # Gio To Hung Vuong
    hk = HUNG_KINGS_BY_YEAR.get(year)
    if hk and hk[1] == month:
        try:
            holidays_to_create.append(
                (date(year, hk[1], hk[0]), "Gio To Hung Vuong (10/3 AL)", "national")
            )
        except ValueError:
            pass

    # Chu nhat trong thang
    import calendar
    num_days = calendar.monthrange(year, month)[1]
    for d in range(1, num_days + 1):
        dt = date(year, month, d)
        if dt.weekday() == 6: # 6 la Chu nhat
            holidays_to_create.append((dt, "Chu nhat", "company"))

    for h_date, h_name, h_type in holidays_to_create:
        existing = await db.execute(
            select(CompanyHoliday).where(CompanyHoliday.holiday_date == h_date)
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue
        holiday = CompanyHoliday(
            holiday_date=h_date,
            name=h_name,
            holiday_type=h_type,
            is_active=True,
            created_by=current_user.username,
        )
        db.add(holiday)
        created += 1

    await db.commit()
    return {
        "message": f"Da tao {created} ngay le cho thang {request.month_key}, bo qua {skipped} ngay da ton tai",
        "created": created,
        "skipped": skipped,
        "month_key": request.month_key,
    }


class HolidayExceptionsUpdate(BaseModel):
    employee_ids: List[int]


@router.get("/{holiday_id}/exceptions")
async def get_holiday_exceptions(
    holiday_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Lấy danh sách nhân viên ngoại lệ của ngày lễ"""
    holiday = await db.get(CompanyHoliday, holiday_id)
    if not holiday:
        raise HTTPException(status_code=404, detail="Ngày lễ không tồn tại")

    query = select(Employee).join(
        HolidayException, Employee.id == HolidayException.employee_id
    ).where(HolidayException.holiday_id == holiday_id).order_by(Employee.employee_code)
    
    result = await db.execute(query)
    employees = result.scalars().all()
    return [{
        "employee_id": e.id,
        "employee_code": e.employee_code,
        "full_name": e.full_name,
        "department": e.department
    } for e in employees]


@router.post("/{holiday_id}/exceptions")
async def update_holiday_exceptions(
    holiday_id: int,
    request: HolidayExceptionsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Cập nhật danh sách nhân viên ngoại lệ đi làm ngày lễ"""
    holiday = await db.get(CompanyHoliday, holiday_id)
    if not holiday:
        raise HTTPException(status_code=404, detail="Ngày lễ không tồn tại")

    await check_date_locked(db, holiday.holiday_date)

    # Delete existing exceptions
    await db.execute(
        delete(HolidayException).where(HolidayException.holiday_id == holiday_id)
    )

    # Insert new exceptions
    for emp_id in request.employee_ids:
        # Verify employee exists
        emp = await db.get(Employee, emp_id)
        if emp:
            exc = HolidayException(holiday_id=holiday_id, employee_id=emp_id)
            db.add(exc)

    await db.commit()
    return {"message": "Cập nhật danh sách ngoại lệ thành công"}
