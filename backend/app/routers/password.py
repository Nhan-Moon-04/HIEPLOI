"""
Password reset & OTP verification endpoints
POST /auth/forgot-password      — gửi email reset link
GET  /auth/reset-password/check — kiểm tra token còn hiệu lực
POST /auth/reset-password       — đặt lại mật khẩu mới
POST /auth/otp/verify           — xác nhận mã OTP đăng nhập
"""
import uuid
import secrets
import random
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.user import AppUser
from app.models.auth_tokens import PasswordResetToken, OtpCode
from app.models.session import UserSession
from app.utils.security import get_password_hash, create_access_token, create_refresh_token
from app.utils.email_service import send_reset_password_email, send_otp_email
from app.utils.rate_limiter import check_email_rate_limit, record_email_sent
from app.config import get_settings
from app.schemas.user import TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["Auth - Password & OTP"])
settings = get_settings()


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str                     # Có thể nhập email hoặc username


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class OtpVerifyRequest(BaseModel):
    otp_session_id: str            # ID phiên OTP tạm thời
    code: str                      # 6 số OTP


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _gen_otp() -> str:
    return str(random.randint(100000, 999999))


async def _find_user_by_email_or_username(db: AsyncSession, identifier: str) -> Optional[AppUser]:
    """Tìm user theo email hoặc username"""
    # Thử theo email trước
    r = await db.execute(select(AppUser).where(AppUser.email == identifier))
    user = r.scalar_one_or_none()
    if user:
        return user
    # Thử theo username
    r = await db.execute(select(AppUser).where(AppUser.username == identifier))
    return r.scalar_one_or_none()


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    req: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Gửi email reset password.
    Rate limit: 5 lần / 15 phút per IP.
    Luôn trả về 200 kể cả khi email không tồn tại (tránh lộ thông tin).
    """
    client_ip = req.client.host if req.client else "unknown"

    # Rate limit theo IP
    allowed, remaining, retry_after = check_email_rate_limit(client_ip)
    if not allowed:
        minutes = retry_after // 60
        raise HTTPException(
            status_code=429,
            detail=f"Gửi quá nhiều lần. Vui lòng thử lại sau {minutes} phút.",
            headers={"Retry-After": str(retry_after)},
        )

    user = await _find_user_by_email_or_username(db, body.email.strip())

    if user and user.email and user.is_active:
        # Xoá token cũ chưa dùng của user này
        await db.execute(
            delete(PasswordResetToken).where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used == False,
            )
        )

        # Tạo token mới
        token = secrets.token_urlsafe(48)
        reset_obj = PasswordResetToken(
            token=token,
            user_id=user.id,
            expires_at=_utcnow() + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES),
        )
        db.add(reset_obj)
        await db.commit()

        # Ghi rate limit TRƯỚC khi gửi mail
        record_email_sent(client_ip)

        # Gửi email trong background (không block response)
        background_tasks.add_task(
            send_reset_password_email,
            user.email,
            user.full_name or user.username,
            token,
        )
    else:
        # Vẫn ghi rate limit dù không tìm thấy user (chống brute force enumerate)
        record_email_sent(client_ip)
        # Delay ngẫu nhiên để tránh timing attack
        await asyncio.sleep(0.3)

    return {
        "detail": "Nếu email tồn tại trong hệ thống, link đặt lại mật khẩu đã được gửi.",
        "remaining": remaining,
    }


@router.get("/reset-password/check")
async def check_reset_token(token: str, db: AsyncSession = Depends(get_db)):
    """Kiểm tra token còn hiệu lực không (dùng khi user mở trang reset)"""
    r = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == token)
    )
    obj = r.scalar_one_or_none()

    if not obj or obj.used or obj.expires_at < _utcnow():
        raise HTTPException(
            status_code=400,
            detail="Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
        )

    # Lấy tên user để hiển thị
    user_r = await db.execute(select(AppUser).where(AppUser.id == obj.user_id))
    user = user_r.scalar_one_or_none()

    return {
        "valid": True,
        "username": user.username if user else None,
        "expires_at": obj.expires_at.isoformat(),
    }


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Đặt lại mật khẩu mới bằng token từ email"""
    r = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == body.token)
    )
    obj = r.scalar_one_or_none()

    if not obj or obj.used or obj.expires_at < _utcnow():
        raise HTTPException(
            status_code=400,
            detail="Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
        )

    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Mật khẩu phải có ít nhất 6 ký tự.")

    # Lấy user
    user_r = await db.execute(select(AppUser).where(AppUser.id == obj.user_id))
    user = user_r.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Tài khoản không hợp lệ.")

    # Cập nhật mật khẩu
    user.password_hash = get_password_hash(body.new_password)
    user.login_attempts = 0
    user.locked_until = None

    # Đánh dấu token đã dùng
    obj.used = True

    # Thu hồi toàn bộ sessions cũ (bảo mật — ai đang đăng nhập sẽ bị kick)
    from sqlalchemy import update
    await db.execute(
        update(UserSession)
        .where(UserSession.user_id == user.id, UserSession.is_active == True)
        .values(is_active=False, revoked_at=_utcnow())
    )

    await db.commit()
    return {"detail": "Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại."}


# ─── OTP Verify ──────────────────────────────────────────────────────────────

@router.post("/otp/verify", response_model=TokenResponse)
async def verify_otp(
    body: OtpVerifyRequest,
    req: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Xác nhận mã OTP 6 số → trả về access token (hoàn tất đăng nhập).
    otp_session_id là ID của record OtpCode trong DB.
    """
    r = await db.execute(select(OtpCode).where(OtpCode.id == int(body.otp_session_id)))
    otp_obj = r.scalar_one_or_none()

    if not otp_obj or otp_obj.used or otp_obj.expires_at < _utcnow():
        raise HTTPException(status_code=400, detail="Mã OTP không hợp lệ hoặc đã hết hạn.")

    if otp_obj.attempts >= settings.OTP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=400,
            detail="Đã nhập sai quá nhiều lần. Vui lòng đăng nhập lại.",
        )

    if otp_obj.code != body.code.strip():
        otp_obj.attempts += 1
        remaining = settings.OTP_MAX_ATTEMPTS - otp_obj.attempts
        await db.commit()
        raise HTTPException(
            status_code=400,
            detail=f"Mã OTP sai. Còn {remaining} lần thử.",
        )

    # OTP đúng → lấy user và tạo session
    user_r = await db.execute(select(AppUser).where(AppUser.id == otp_obj.user_id))
    user = user_r.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Tài khoản không hợp lệ.")

    otp_obj.used = True

    # Tạo session (tương tự flow login bình thường)
    session_id = str(uuid.uuid4())
    ip_address = req.client.host if req.client else None
    user_agent_raw = req.headers.get("user-agent", "")

    from app.routers.auth import _parse_device_name
    device_name = _parse_device_name(user_agent_raw)
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

    # Reset login attempts sau khi login thành công
    user.login_attempts = 0
    user.locked_until = None

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
