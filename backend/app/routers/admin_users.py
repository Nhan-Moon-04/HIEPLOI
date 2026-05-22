"""
Admin User Management Router
- CRUD users, phân quyền, vô hiệu hoá
- Xem sessions (thiết bị đang đăng nhập)
- Revoke session từ xa (đá văng)
- Xem hoạt động: login, thời gian online
"""
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from pydantic import BaseModel

from app.database import get_db
from app.models.user import AppUser, UserRole
from app.models.session import UserSession
from app.schemas.user import UserResponse, SessionResponse
from app.utils.security import get_password_hash
from app.middleware.auth import get_current_user, require_roles

router = APIRouter(prefix="/admin", tags=["Admin - User Management"])

ONLINE_THRESHOLD_MINUTES = 5  # Coi là online nếu last_active_at < 5 phút


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─── Schemas ─────────────────────────────────────────────────────────────────

class AdminUserCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    role: UserRole = UserRole.WORKER
    employee_id: Optional[int] = None


class AdminUserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    employee_id: Optional[int] = None


class AdminSetPassword(BaseModel):
    new_password: str


class UserWithStatus(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    role: UserRole
    employee_id: Optional[int] = None
    is_active: bool
    created_at: Optional[datetime] = None
    # Trạng thái online
    is_online: bool = False
    last_seen: Optional[datetime] = None
    active_sessions: int = 0

    class Config:
        from_attributes = True


class SessionWithUser(BaseModel):
    id: str
    user_id: int
    username: Optional[str] = None
    device_name: Optional[str] = None
    ip_address: Optional[str] = None
    is_active: bool
    created_at: datetime
    last_active_at: datetime
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    is_online: bool = False

    class Config:
        from_attributes = True


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserWithStatus])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Danh sách tất cả user kèm trạng thái online"""
    users_result = await db.execute(select(AppUser).order_by(AppUser.id))
    users = users_result.scalars().all()

    threshold = _utcnow() - timedelta(minutes=ONLINE_THRESHOLD_MINUTES)

    result = []
    for u in users:
        # Đếm session active và lấy last_active_at gần nhất
        sess_result = await db.execute(
            select(UserSession)
            .where(UserSession.user_id == u.id, UserSession.is_active == True)
            .order_by(UserSession.last_active_at.desc())
        )
        sessions = sess_result.scalars().all()
        active_count = len(sessions)
        last_seen = sessions[0].last_active_at if sessions else None
        is_online = bool(last_seen and last_seen >= threshold)

        result.append(UserWithStatus(
            id=u.id,
            username=u.username,
            full_name=u.full_name,
            role=u.role,
            employee_id=u.employee_id,
            is_active=u.is_active,
            created_at=u.created_at,
            is_online=is_online,
            last_seen=last_seen,
            active_sessions=active_count,
        ))
    return result


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    body: AdminUserCreate,
    db: AsyncSession = Depends(get_db),
    _admin: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Tạo user mới"""
    existing = await db.execute(select(AppUser).where(AppUser.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username đã tồn tại")

    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu phải có ít nhất 6 ký tự")

    user = AppUser(
        username=body.username,
        password_hash=get_password_hash(body.password),
        full_name=body.full_name,
        role=body.role,
        employee_id=body.employee_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.get("/users/{user_id}", response_model=UserWithStatus)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Lấy thông tin chi tiết 1 user"""
    result = await db.execute(select(AppUser).where(AppUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy user")

    threshold = _utcnow() - timedelta(minutes=ONLINE_THRESHOLD_MINUTES)
    sess_result = await db.execute(
        select(UserSession)
        .where(UserSession.user_id == user_id, UserSession.is_active == True)
        .order_by(UserSession.last_active_at.desc())
    )
    sessions = sess_result.scalars().all()
    last_seen = sessions[0].last_active_at if sessions else None

    return UserWithStatus(
        id=user.id, username=user.username, full_name=user.full_name,
        role=user.role, employee_id=user.employee_id, is_active=user.is_active,
        created_at=user.created_at,
        is_online=bool(last_seen and last_seen >= threshold),
        last_seen=last_seen,
        active_sessions=len(sessions),
    )


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    body: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Cập nhật thông tin user (họ tên, role, employee_id)"""
    result = await db.execute(select(AppUser).where(AppUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy user")

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        user.role = body.role
    if body.employee_id is not None:
        user.employee_id = body.employee_id

    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.put("/users/{user_id}/password")
async def admin_set_password(
    user_id: int,
    body: AdminSetPassword,
    db: AsyncSession = Depends(get_db),
    _admin: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Admin đặt lại mật khẩu cho user (không cần mật khẩu cũ)"""
    result = await db.execute(select(AppUser).where(AppUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy user")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu phải có ít nhất 6 ký tự")

    user.password_hash = get_password_hash(body.new_password)
    await db.commit()
    return {"detail": f"Đã đặt lại mật khẩu cho {user.username}"}


@router.put("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Vô hiệu hoá / kích hoạt lại tài khoản"""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Không thể vô hiệu hoá chính mình")

    result = await db.execute(select(AppUser).where(AppUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy user")

    user.is_active = not user.is_active

    # Nếu vô hiệu hoá → revoke all sessions
    if not user.is_active:
        await db.execute(
            update(UserSession)
            .where(UserSession.user_id == user_id, UserSession.is_active == True)
            .values(is_active=False, revoked_at=_utcnow())
        )

    await db.commit()
    state = "kích hoạt" if user.is_active else "vô hiệu hoá"
    return {"detail": f"Đã {state} tài khoản {user.username}", "is_active": user.is_active}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Xoá user vĩnh viễn"""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Không thể xoá chính mình")

    result = await db.execute(select(AppUser).where(AppUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy user")

    await db.delete(user)
    await db.commit()
    return {"detail": f"Đã xoá user {user.username}"}


# ─── Session management ───────────────────────────────────────────────────────

@router.get("/users/{user_id}/sessions", response_model=List[SessionWithUser])
async def get_user_sessions(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Xem tất cả sessions của 1 user"""
    user_result = await db.execute(select(AppUser).where(AppUser.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy user")

    threshold = _utcnow() - timedelta(minutes=ONLINE_THRESHOLD_MINUTES)
    sess_result = await db.execute(
        select(UserSession)
        .where(UserSession.user_id == user_id)
        .order_by(UserSession.last_active_at.desc())
    )
    sessions = sess_result.scalars().all()

    return [
        SessionWithUser(
            id=s.id,
            user_id=s.user_id,
            username=user.username,
            device_name=s.device_name,
            ip_address=s.ip_address,
            is_active=s.is_active,
            created_at=s.created_at,
            last_active_at=s.last_active_at,
            expires_at=s.expires_at,
            revoked_at=s.revoked_at,
            is_online=bool(s.is_active and s.last_active_at >= threshold),
        )
        for s in sessions
    ]


@router.delete("/users/{user_id}/sessions/{session_id}")
async def admin_revoke_session(
    user_id: int,
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Đá văng 1 session cụ thể của user"""
    result = await db.execute(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên đăng nhập")

    session.is_active = False
    session.revoked_at = _utcnow()
    await db.commit()
    return {"detail": "Đã đăng xuất thiết bị"}


@router.delete("/users/{user_id}/sessions")
async def admin_revoke_all_sessions(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Đá văng tất cả sessions của user (kick out toàn bộ)"""
    await db.execute(
        update(UserSession)
        .where(UserSession.user_id == user_id, UserSession.is_active == True)
        .values(is_active=False, revoked_at=_utcnow())
    )
    await db.commit()
    return {"detail": "Đã đăng xuất tất cả thiết bị của user"}


# ─── All active sessions (tổng quan) ─────────────────────────────────────────

@router.get("/sessions", response_model=List[SessionWithUser])
async def list_all_active_sessions(
    db: AsyncSession = Depends(get_db),
    _admin: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Tất cả sessions đang active trong hệ thống"""
    threshold = _utcnow() - timedelta(minutes=ONLINE_THRESHOLD_MINUTES)

    result = await db.execute(
        select(UserSession, AppUser.username)
        .join(AppUser, AppUser.id == UserSession.user_id)
        .where(UserSession.is_active == True)
        .order_by(UserSession.last_active_at.desc())
    )
    rows = result.all()

    return [
        SessionWithUser(
            id=s.id,
            user_id=s.user_id,
            username=username,
            device_name=s.device_name,
            ip_address=s.ip_address,
            is_active=s.is_active,
            created_at=s.created_at,
            last_active_at=s.last_active_at,
            expires_at=s.expires_at,
            revoked_at=s.revoked_at,
            is_online=bool(s.last_active_at >= threshold),
        )
        for s, username in rows
    ]
