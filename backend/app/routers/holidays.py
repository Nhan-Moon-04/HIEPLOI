from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, extract, and_
from app.database import get_db
from app.models.holiday import CompanyHoliday
from app.models.user import AppUser, UserRole
from app.schemas.holiday import HolidayCreate, HolidayUpdate, HolidayResponse, HolidayBulkGenerate
from app.middleware.auth import get_current_user, require_roles

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
        return [HolidayResponse.model_validate(h) for h in holidays]
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
    existing = await db.execute(
        select(CompanyHoliday).where(CompanyHoliday.holiday_date == request.holiday_date)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Ngay {request.holiday_date} da ton tai")

    holiday = CompanyHoliday(
        **request.model_dump(),
        created_by=current_user.username,
    )
    db.add(holiday)
    await db.commit()
    await db.refresh(holiday)
    return HolidayResponse.model_validate(holiday)


@router.put("/{holiday_id}", response_model=HolidayResponse)
async def update_holiday(
    holiday_id: int,
    request: HolidayUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Cap nhat ngay le - toggle is_active de bat/tat nghi"""
    result = await db.execute(select(CompanyHoliday).where(CompanyHoliday.id == holiday_id))
    holiday = result.scalar_one_or_none()
    if not holiday:
        raise HTTPException(status_code=404, detail="Ngay le khong ton tai")

    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(holiday, key, value)

    await db.commit()
    await db.refresh(holiday)
    return HolidayResponse.model_validate(holiday)


@router.patch("/{holiday_id}/toggle", response_model=HolidayResponse)
async def toggle_holiday(
    holiday_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Toggle bat/tat ngay nghi. is_active=True => nghi (ko tinh luong), is_active=False => di lam binh thuong"""
    result = await db.execute(select(CompanyHoliday).where(CompanyHoliday.id == holiday_id))
    holiday = result.scalar_one_or_none()
    if not holiday:
        raise HTTPException(status_code=404, detail="Ngay le khong ton tai")

    holiday.is_active = not holiday.is_active
    await db.commit()
    await db.refresh(holiday)
    return HolidayResponse.model_validate(holiday)


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
