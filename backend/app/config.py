from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://hieploi:hieploi2026@localhost:5432/hieploi_hr"
    DATABASE_URL_SYNC: str = "postgresql://hieploi:hieploi2026@localhost:5432/hieploi_hr"

    # JWT
    SECRET_KEY: str = "hieploi-super-secret-key-2026-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # App
    APP_NAME: str = "Hiệp Lợi HR System"
    DEBUG: bool = True

    class Config:
        env_file = "../../.env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings():
    return Settings()
