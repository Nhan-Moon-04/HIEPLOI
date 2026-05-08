from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.models.shift import ShiftTemplate
from app.models.user import AppUser, UserRole
from app.schemas.shift import ShiftCreate, ShiftUpdate, ShiftResponse
from app.middleware.auth import get_current_user, require_roles

router = APIRouter(prefix="/shifts", tags=["Shifts - Mã Ca"])


@router.get("", response_model=List[ShiftResponse])
async def list_shifts(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Danh sách mã ca"""
    result = await db.execute(select(ShiftTemplate).order_by(ShiftTemplate.code))
    shifts = result.scalars().all()
    return [ShiftResponse.model_validate(s) for s in shifts]


@router.get("/{shift_id}", response_model=ShiftResponse)
async def get_shift(
    shift_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Chi tiết mã ca"""
    result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.id == shift_id))
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Mã ca không tồn tại")
    return ShiftResponse.model_validate(shift)


@router.post("", response_model=ShiftResponse, status_code=201)
async def create_shift(
    request: ShiftCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Tạo mã ca mới"""
    # Check code exists
    result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.code == request.code.upper()))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Mã ca '{request.code}' đã tồn tại")

    shift = ShiftTemplate(**request.model_dump())
    shift.code = shift.code.upper()
    db.add(shift)
    await db.commit()
    await db.refresh(shift)
    return ShiftResponse.model_validate(shift)


@router.put("/{shift_id}", response_model=ShiftResponse)
async def update_shift(
    shift_id: int,
    request: ShiftUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Cập nhật mã ca"""
    result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.id == shift_id))
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Mã ca không tồn tại")

    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(shift, key, value)

    await db.commit()
    await db.refresh(shift)
    return ShiftResponse.model_validate(shift)


@router.delete("/{shift_id}")
async def delete_shift(
    shift_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Xóa mã ca"""
    result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.id == shift_id))
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Mã ca không tồn tại")

    await db.delete(shift)
    await db.commit()
    return {"message": f"Đã xóa mã ca '{shift.code}'"}
