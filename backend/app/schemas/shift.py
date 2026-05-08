from pydantic import BaseModel
from typing import Optional
from datetime import time, datetime
from decimal import Decimal


class ShiftCreate(BaseModel):
    code: str
    name: str
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    break_minutes: int = 60
    standard_hours: Decimal = Decimal("8")
    default_overtime_hours: Decimal = Decimal("0")
    meal_allowance: Decimal = Decimal("0")
    meal_count: int = 0
    is_night_shift: bool = False
    is_leave_code: bool = False
    is_paid_leave: bool = False
    notes: Optional[str] = None


class ShiftUpdate(BaseModel):
    name: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    break_minutes: Optional[int] = None
    standard_hours: Optional[Decimal] = None
    default_overtime_hours: Optional[Decimal] = None
    meal_allowance: Optional[Decimal] = None
    meal_count: Optional[int] = None
    is_night_shift: Optional[bool] = None
    is_leave_code: Optional[bool] = None
    is_paid_leave: Optional[bool] = None
    notes: Optional[str] = None


class ShiftResponse(BaseModel):
    id: int
    code: str
    name: str
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    break_minutes: int
    standard_hours: Decimal
    default_overtime_hours: Decimal
    meal_allowance: Decimal
    meal_count: int
    is_night_shift: bool
    is_leave_code: bool
    is_paid_leave: bool
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
