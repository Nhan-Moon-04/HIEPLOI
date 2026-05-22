from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.user import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str
    device_name: Optional[str] = None   # Tên thiết bị tùy chỉnh (tùy chọn)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserResponse"
    session_id: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    role: UserRole
    employee_id: Optional[int] = None
    is_active: bool

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    role: UserRole = UserRole.WORKER
    employee_id: Optional[int] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    employee_id: Optional[int] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str


class SessionResponse(BaseModel):
    """Thông tin một phiên đăng nhập / thiết bị"""
    id: str
    device_name: Optional[str] = None
    ip_address: Optional[str] = None
    is_active: bool
    created_at: datetime
    last_active_at: datetime
    expires_at: datetime
    revoked_at: Optional[datetime] = None

    class Config:
        from_attributes = True
