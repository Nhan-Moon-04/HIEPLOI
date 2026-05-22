from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://hieploi:hieploi2026@localhost:5432/hieploi_hr"
    DATABASE_URL_SYNC: str = "postgresql://hieploi:hieploi2026@localhost:5432/hieploi_hr"

    # JWT
    SECRET_KEY: str = "Nguyennhan2004.@"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200   # 30 ngày
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # App
    APP_NAME: str = "Hiệp Lợi HR System"
    DEBUG: bool = True
    FRONTEND_URL: str = "http://192.168.1.156:5173"   # URL frontend để tạo reset link

    # SMTP Email (Gmail)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "nthiennhan1611@gmail.com"
    SMTP_PASSWORD: str = "kpjktdjrgimwurpe"           # App password (không có dấu cách)
    EMAIL_FROM_NAME: str = "Hiệp Lợi HR"

    # Security — Login lockout
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_MINUTES: int = 15

    # Security — Password reset
    RESET_TOKEN_EXPIRE_MINUTES: int = 5

    # Security — OTP
    OTP_EXPIRE_MINUTES: int = 5
    OTP_MAX_ATTEMPTS: int = 3

    # Security — Email rate limit (forgot password)
    EMAIL_RATE_LIMIT_MAX: int = 5
    EMAIL_RATE_LIMIT_WINDOW_MINUTES: int = 15

    class Config:
        env_file = "../../.env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings():
    return Settings()
