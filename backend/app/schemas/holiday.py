from datetime import date
from typing import Optional
from pydantic import BaseModel


class HolidayBase(BaseModel):
    holiday_date: date
    name: str
    holiday_type: str = "company"  # national, company, custom
    is_active: bool = True
    notes: Optional[str] = None


class HolidayCreate(HolidayBase):
    pass


class HolidayUpdate(BaseModel):
    name: Optional[str] = None
    holiday_type: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class HolidayResponse(HolidayBase):
    id: int
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


class HolidayBulkGenerate(BaseModel):
    """Request body de tu dong tao ngay le VN trong nam"""
    year: int
