import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from app.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    ACCOUNTANT = "accountant"
    IMPORT_EXPORT = "import_export"
    WORKER = "worker"


class AppUser(Base):
    __tablename__ = "app_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(120))
    email = Column(String(255), nullable=True, index=True)        # Email để reset password / OTP
    role = Column(Enum(UserRole), default=UserRole.WORKER, nullable=False)
    employee_id = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)
    is_setup_completed = Column(Boolean, default=False, nullable=False, server_default="false")

    # Bảo mật login
    login_attempts = Column(Integer, default=0)                   # Số lần sai liên tiếp
    locked_until = Column(DateTime, nullable=True)                # Khoá đến lúc này (None = không khoá)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
