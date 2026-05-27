from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class DepartmentBase(BaseModel):
    code: str = Field(..., max_length=32, description="Mã bộ phận")
    name: str = Field(..., max_length=120, description="Tên bộ phận VN")
    name_tw: Optional[str] = Field(None, max_length=120, description="Tên bộ phận tiếng Hoa")
    description: Optional[str] = Field(None, max_length=255, description="Mô tả ngắn")


class DepartmentCreate(DepartmentBase):
    employee_ids: Optional[List[int]] = Field(None, description="Danh sách ID nhân viên gán vào")


class DepartmentUpdate(DepartmentBase):
    employee_ids: Optional[List[int]] = Field(None, description="Danh sách ID nhân viên gán vào")


class DepartmentResponse(DepartmentBase):
    id: int
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime
    employee_count: int = 0

    class Config:
        from_attributes = True
