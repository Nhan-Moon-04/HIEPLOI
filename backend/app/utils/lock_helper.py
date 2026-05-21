from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.salary import MonthlyWorkdayConfig
from fastapi import HTTPException
from datetime import date, datetime

async def is_month_locked(db: AsyncSession, month_key: str) -> bool:
    """Kiểm tra tháng đã chốt dữ liệu hay chưa"""
    config_result = await db.execute(select(MonthlyWorkdayConfig).where(MonthlyWorkdayConfig.month_key == month_key))
    config = config_result.scalar_one_or_none()
    return bool(config.is_locked) if config else False

async def check_month_locked(db: AsyncSession, month_key: str):
    """Ném lỗi 400 nếu tháng đã bị chốt"""
    if await is_month_locked(db, month_key):
        raise HTTPException(status_code=400, detail=f"Dữ liệu tháng {month_key} đã bị chốt (khóa), không thể thực hiện thao tác này.")

async def check_date_locked(db: AsyncSession, d: date):
    """Kiểm tra xem ngày truyền vào thuộc tháng đã bị chốt hay chưa"""
    if isinstance(d, datetime):
        d = d.date()
    month_key = d.strftime("%Y-%m")
    if await is_month_locked(db, month_key):
        raise HTTPException(status_code=400, detail=f"Ngày {d.strftime('%d/%m/%Y')} thuộc tháng {month_key} đã bị chốt (khóa) dữ liệu.")
