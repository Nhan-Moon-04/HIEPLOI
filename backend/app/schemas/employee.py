from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime
from decimal import Decimal


class EmployeeCreate(BaseModel):
    employee_code: str
    full_name: str
    full_name_tw: Optional[str] = None
    gender: Optional[str] = None
    hometown: Optional[str] = None
    birth_year: Optional[int] = None
    department: Optional[str] = None
    department_tw: Optional[str] = None
    position: Optional[str] = None
    default_shift_code: Optional[str] = None
    base_salary: Optional[Decimal] = 0
    join_date: Optional[date] = None
    leave_date: Optional[date] = None
    is_active: bool = True
    notes: Optional[str] = None


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    full_name_tw: Optional[str] = None
    gender: Optional[str] = None
    hometown: Optional[str] = None
    birth_year: Optional[int] = None
    department: Optional[str] = None
    department_tw: Optional[str] = None
    position: Optional[str] = None
    default_shift_code: Optional[str] = None
    base_salary: Optional[Decimal] = None
    join_date: Optional[date] = None
    leave_date: Optional[date] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class EmployeeResponse(BaseModel):
    id: int
    employee_code: str
    full_name: str
    full_name_tw: Optional[str] = None
    gender: Optional[str] = None
    hometown: Optional[str] = None
    birth_year: Optional[int] = None
    department: Optional[str] = None
    department_tw: Optional[str] = None
    position: Optional[str] = None
    default_shift_code: Optional[str] = None
    base_salary: Optional[Decimal] = None
    join_date: Optional[date] = None
    leave_date: Optional[date] = None
    is_active: bool
    dependents: Optional[int] = 0
    notes: Optional[str] = None
    month_salary: Optional[Decimal] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
