"""
Bảng lưu token reset password và OTP email
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from app.database import Base


class PasswordResetToken(Base):
    """Token gửi qua email để reset mật khẩu — hiệu lực 5 phút, dùng 1 lần"""
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(String(64), unique=True, nullable=False, index=True,
                   default=lambda: uuid.uuid4().hex)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class OtpCode(Base):
    """Mã OTP 6 số gửi qua email — dùng khi login từ IP lạ"""
    __tablename__ = "otp_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(6), nullable=False)          # 6 số
    purpose = Column(String(32), default="login_otp") # login_otp / verify_email
    ip_address = Column(String(45), nullable=True)    # IP đăng nhập để xác nhận
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    attempts = Column(Integer, default=0)             # Số lần nhập sai OTP
    created_at = Column(DateTime, default=datetime.utcnow)
    last_sent_at = Column(DateTime, nullable=True)    # Thời điểm gửi email OTP gần nhất
