from datetime import datetime, timedelta, timezone
from typing import List, Optional
import random
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.database import get_db
from app.models.user import AppUser, UserRole
from app.models.session import UserSession
from app.models.auth_tokens import OtpCode
from app.schemas.user import (
    LoginRequest, TokenResponse, UserResponse, UserCreate,
    UserProfileUpdate, ChangePasswordRequest, SessionResponse,
)
from app.utils.security import (
    verify_password, get_password_hash,
    create_access_token, create_refresh_token, decode_token,
)
from app.middleware.auth import get_current_user, require_roles
from app.config import get_settings
import uuid

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["Authentication"])


def _utcnow() -> datetime:
    """Naive UTC datetime — tương thích TIMESTAMP WITHOUT TIME ZONE của PostgreSQL"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _parse_device_name(user_agent: str) -> str:
    """Tạo tên thiết bị thân thiện từ User-Agent"""
    ua = user_agent or ""
    if "iPhone" in ua or "iPad" in ua:
        os_part = "iOS"
    elif "Android" in ua:
        os_part = "Android"
    elif "Windows" in ua:
        os_part = "Windows"
    elif "Mac" in ua:
        os_part = "macOS"
    elif "Linux" in ua:
        os_part = "Linux"
    else:
        os_part = "Unknown OS"

    if "Chrome" in ua and "Edg" not in ua and "OPR" not in ua:
        browser = "Chrome"
    elif "Firefox" in ua:
        browser = "Firefox"
    elif "Safari" in ua and "Chrome" not in ua:
        browser = "Safari"
    elif "Edg" in ua:
        browser = "Edge"
    elif "OPR" in ua or "Opera" in ua:
        browser = "Opera"
    else:
        browser = "Browser"

    return f"{browser} / {os_part}"


# ─────────────────────────────────────────────────────────────────────────────
# Login
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/login")
async def login(
    request: LoginRequest,
    req: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Đăng nhập — khoá sau 5 lần sai, OTP nếu IP lạ"""
    result = await db.execute(
        select(AppUser).where(AppUser.username == request.username)
    )
    user = result.scalar_one_or_none()

    # ── Kiểm tra khoá tài khoản ──────────────────────────────────────────────
    if user and user.locked_until and user.locked_until > _utcnow():
        remain_secs = int((user.locked_until - _utcnow()).total_seconds())
        remain_mins = max(1, remain_secs // 60)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Tài khoản tạm thời bị khoá do nhập sai quá nhiều lần. Thử lại sau {remain_mins} phút.",
            headers={"X-Lockout-Seconds": str(remain_secs)},
        )

    # ── Xác thực thông tin đăng nhập ─────────────────────────────────────────
    wrong_password = not user or not verify_password(request.password, user.password_hash)
    if wrong_password:
        # Tăng attempt nếu user tồn tại
        if user:
            user.login_attempts = (user.login_attempts or 0) + 1
            if user.login_attempts >= settings.MAX_LOGIN_ATTEMPTS:
                user.locked_until = _utcnow() + timedelta(minutes=settings.LOCKOUT_MINUTES)
                await db.commit()
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Tài khoản bị khoá {settings.LOCKOUT_MINUTES} phút do nhập sai {settings.MAX_LOGIN_ATTEMPTS} lần liên tiếp.",
                    headers={"X-Lockout-Seconds": str(settings.LOCKOUT_MINUTES * 60)},
                )
            remaining = settings.MAX_LOGIN_ATTEMPTS - user.login_attempts
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Mật khẩu không đúng. Còn {remaining} lần thử trước khi bị khoá.",
                headers={"X-Attempts-Remaining": str(remaining)},
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tên đăng nhập hoặc mật khẩu không đúng.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị vô hiệu hóa.",
        )

    # Reset login_attempts sau khi đúng
    user.login_attempts = 0
    user.locked_until = None

    # ── Kiểm tra IP lạ → OTP ─────────────────────────────────────────────────
    ip_address = req.client.host if req.client else None
    user_agent_raw = req.headers.get("user-agent", "")

    if ip_address and user.email:
        # Xem IP này đã từng login thành công chưa
        known_ip_result = await db.execute(
            select(UserSession)
            .where(
                UserSession.user_id == user.id,
                UserSession.ip_address == ip_address,
                UserSession.is_active == True,
            )
            .limit(1)
        )
        known_session = known_ip_result.scalar_one_or_none()

        if not known_session:
            # IP lạ → gửi OTP
            otp_code = str(random.randint(100000, 999999))
            otp_obj = OtpCode(
                user_id=user.id,
                code=otp_code,
                purpose="login_otp",
                ip_address=ip_address,
                expires_at=_utcnow() + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
            )
            db.add(otp_obj)
            await db.commit()
            await db.refresh(otp_obj)

            # Gửi email OTP trong background
            from app.utils.email_service import send_otp_email
            background_tasks.add_task(
                send_otp_email,
                user.email,
                user.full_name or user.username,
                otp_code,
                ip_address,
            )

            return {
                "otp_required": True,
                "otp_session_id": str(otp_obj.id),
                "message": "Phát hiện đăng nhập từ thiết bị mới. Mã OTP đã được gửi về email của bạn.",
                "email_hint": user.email[:3] + "****@" + user.email.split("@")[-1] if user.email else None,
            }

    # ── Login bình thường (IP quen hoặc không có email) ───────────────────────
    session_id = str(uuid.uuid4())
    device_name = request.device_name or _parse_device_name(user_agent_raw)
    expires_at = _utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    session = UserSession(
        id=session_id,
        user_id=user.id,
        device_name=device_name,
        ip_address=ip_address,
        user_agent=user_agent_raw[:500],
        is_active=True,
        expires_at=expires_at,
    )
    db.add(session)
    await db.commit()

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "sid": session_id}
    )
    refresh_token = create_refresh_token(
        data={"sub": str(user.id), "sid": session_id}
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
        session_id=session_id,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Logout (revoke session hiện tại)
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/logout")
async def logout(
    req: Request,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Đăng xuất — vô hiệu hóa session hiện tại"""
    from fastapi.security import HTTPBearer
    auth = req.headers.get("authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    payload = decode_token(token)
    session_id = payload.get("sid") if payload else None

    if session_id:
        await db.execute(
            update(UserSession)
            .where(UserSession.id == session_id)
            .values(is_active=False, revoked_at=_utcnow())
        )
        await db.commit()

    return {"detail": "Đã đăng xuất thành công"}


# ─────────────────────────────────────────────────────────────────────────────
# Lấy danh sách sessions của user hiện tại
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Danh sách tất cả phiên đăng nhập (thiết bị) của tài khoản"""
    result = await db.execute(
        select(UserSession)
        .where(UserSession.user_id == current_user.id)
        .order_by(UserSession.last_active_at.desc())
    )
    sessions = result.scalars().all()
    return [SessionResponse.model_validate(s) for s in sessions]


# ─────────────────────────────────────────────────────────────────────────────
# Revoke một session cụ thể (đăng xuất thiết bị từ xa)
# ─────────────────────────────────────────────────────────────────────────────
@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Đăng xuất thiết bị từ xa — thu hồi session theo ID"""
    result = await db.execute(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên đăng nhập")

    session.is_active = False
    session.revoked_at = _utcnow()
    await db.commit()
    return {"detail": "Đã đăng xuất thiết bị thành công"}


# ─────────────────────────────────────────────────────────────────────────────
# Revoke TẤT CẢ sessions ngoại trừ phiên hiện tại
# ─────────────────────────────────────────────────────────────────────────────
@router.delete("/sessions")
async def revoke_all_sessions(
    req: Request,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Đăng xuất tất cả thiết bị khác (giữ lại phiên hiện tại)"""
    auth = req.headers.get("authorization", "")
    token = auth.removeprefix("Bearer ").strip()
    payload = decode_token(token)
    current_sid = payload.get("sid") if payload else None

    q = update(UserSession).where(
        UserSession.user_id == current_user.id,
        UserSession.is_active == True,
    )
    if current_sid:
        q = q.where(UserSession.id != current_sid)

    await db.execute(q.values(is_active=False, revoked_at=_utcnow()))
    await db.commit()
    return {"detail": "Đã đăng xuất tất cả thiết bị khác"}


# ─────────────────────────────────────────────────────────────────────────────
# Refresh token
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(req: Request, db: AsyncSession = Depends(get_db)):
    """Refresh access token — dùng refresh_token, gia hạn session thêm 30 ngày"""
    auth = req.headers.get("authorization", "")
    # Nhận refresh_token từ body
    from fastapi import Body
    body = await req.json()
    refresh_tok = body.get("refresh_token", "")

    payload = decode_token(refresh_tok)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token không hợp lệ")

    user_id = payload.get("sub")
    session_id = payload.get("sid")

    result = await db.execute(select(AppUser).where(AppUser.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Người dùng không tồn tại")

    # Kiểm tra session còn active
    if session_id:
        sess_result = await db.execute(
            select(UserSession).where(
                UserSession.id == session_id,
                UserSession.is_active == True,
            )
        )
        session = sess_result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Phiên đã hết hạn")
        # Gia hạn session thêm 30 ngày
        new_expires = _utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        session.expires_at = new_expires
        session.last_active_at = _utcnow()
        await db.commit()

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "sid": session_id}
    )
    new_refresh_token = create_refresh_token(
        data={"sub": str(user.id), "sid": session_id}
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=UserResponse.model_validate(user),
        session_id=session_id,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Me endpoints
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/me", response_model=UserResponse)
async def get_me(current_user: AppUser = Depends(get_current_user)):
    """Lấy thông tin user hiện tại"""
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse)
async def update_me(
    request: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Cập nhật thông tin cá nhân (họ tên, email)"""
    if request.full_name is not None:
        current_user.full_name = request.full_name

    if request.email is not None:
        # Validate email cơ bản
        email = request.email.strip()
        if email and "@" not in email:
            raise HTTPException(status_code=400, detail="Email không hợp lệ")
        # Kiểm tra email đã dùng chưa (trừ chính mình)
        if email:
            dup = await db.execute(
                select(AppUser).where(AppUser.email == email, AppUser.id != current_user.id)
            )
            if dup.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Email này đã được sử dụng bởi tài khoản khác")
        current_user.email = email or None

    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.put("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Đổi mật khẩu — yêu cầu mật khẩu cũ đúng"""
    if not verify_password(request.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu hiện tại không đúng",
        )
    if len(request.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới phải có ít nhất 6 ký tự",
        )
    current_user.password_hash = get_password_hash(request.new_password)
    await db.commit()
    return {"detail": "Đổi mật khẩu thành công"}


# ─────────────────────────────────────────────────────────────────────────────
# Admin: tạo user
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/users", response_model=UserResponse)
async def create_user(
    request: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Tạo user mới (chỉ Admin)"""
    result = await db.execute(select(AppUser).where(AppUser.username == request.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username đã tồn tại")

    user = AppUser(
        username=request.username,
        password_hash=get_password_hash(request.password),
        full_name=request.full_name,
        role=request.role,
        employee_id=request.employee_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)
