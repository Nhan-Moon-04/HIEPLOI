from datetime import datetime, timezone
from typing import Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.database import get_db
from app.models.user import AppUser, UserRole
from app.models.session import UserSession
from app.utils.security import decode_token

security = HTTPBearer()


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> AppUser:
    token = credentials.credentials
    payload = decode_token(token)

    if payload is None or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token không hợp lệ hoặc đã hết hạn",
        )

    user_id = payload.get("sub")
    session_id = payload.get("sid")

    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token không hợp lệ")

    # Kiểm tra session trong DB nếu token có session_id
    if session_id:
        sess_result = await db.execute(
            select(UserSession).where(
                UserSession.id == session_id,
                UserSession.user_id == int(user_id),
                UserSession.is_active == True,
            )
        )
        session = sess_result.scalar_one_or_none()
        if session is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Phiên đăng nhập đã hết hạn hoặc bị thu hồi",
            )
        # Cập nhật last_active_at (không await để không block response)
        await db.execute(
            update(UserSession)
            .where(UserSession.id == session_id)
            .values(last_active_at=datetime.now(timezone.utc).replace(tzinfo=None))
        )
        await db.commit()

    result = await db.execute(select(AppUser).where(AppUser.id == int(user_id)))
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Người dùng không tồn tại hoặc bị vô hiệu",
        )

    return user


def require_roles(*roles: UserRole):
    """Decorator yêu cầu role cụ thể"""
    async def role_checker(current_user: AppUser = Depends(get_current_user)) -> AppUser:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Bạn không có quyền truy cập. Yêu cầu role: {[r.value for r in roles]}",
            )
        return current_user
    return role_checker
