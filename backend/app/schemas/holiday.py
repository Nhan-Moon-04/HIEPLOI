from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel


class HolidayBase(BaseModel):
    holiday_date: date
    name: str
    holiday_type: str = "company"  # national, company, custom
    is_active: bool = True
    notes: Optional[str] = None
    scope: str = "all"  # all, department, employee
    departments: Optional[str] = None
    duration: str = "full"  # full, half


class HolidayCreate(HolidayBase):
    target_employee_ids: Optional[List[int]] = None


class HolidayUpdate(BaseModel):
    holiday_date: Optional[date] = None
    name: Optional[str] = None
    holiday_type: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    scope: Optional[str] = None
    departments: Optional[str] = None
    duration: Optional[str] = None
    target_employee_ids: Optional[List[int]] = None


class HolidayResponse(HolidayBase):
    id: int
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    target_employee_ids: Optional[List[int]] = []

    class Config:
        from_attributes = True


class HolidayBulkGenerate(BaseModel):
    """Request body de tu dong tao ngay le VN trong thang"""
    month_key: str
