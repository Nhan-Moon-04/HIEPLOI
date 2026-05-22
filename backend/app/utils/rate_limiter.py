"""
In-memory rate limiter — không cần Redis
Dùng cho: gửi email reset password (5 lần / 15 phút)
"""
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List
from app.config import get_settings

settings = get_settings()


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class InMemoryRateLimiter:
    """Rate limiter đơn giản dựa trên sliding window"""

    def __init__(self):
        # key → list[datetime] các lần gửi gần nhất
        self._records: Dict[str, List[datetime]] = defaultdict(list)

    def check(self, key: str, max_count: int, window_minutes: int) -> tuple[bool, int, int]:
        """
        Returns: (allowed, remaining_count, retry_after_seconds)
        - allowed: True nếu cho phép
        - remaining: Số lần còn lại
        - retry_after: Giây phải chờ (0 nếu allowed)
        """
        now = _utcnow()
        cutoff = now.__class__(
            now.year, now.month, now.day,
            now.hour, now.minute, now.second
        ) - __import__('datetime').timedelta(minutes=window_minutes)

        # Xoá các record cũ ngoài window
        self._records[key] = [t for t in self._records[key] if t > cutoff]
        count = len(self._records[key])

        if count >= max_count:
            # Tìm thời điểm record cũ nhất trong window → khi nào nó expire
            oldest = min(self._records[key])
            import datetime as dt
            expire_at = oldest + dt.timedelta(minutes=window_minutes)
            retry_after = max(0, int((expire_at - now).total_seconds()))
            return False, 0, retry_after

        return True, max_count - count - 1, 0

    def record(self, key: str):
        """Ghi nhận 1 lần thực hiện"""
        self._records[key].append(_utcnow())


# Singleton
email_rate_limiter = InMemoryRateLimiter()


def check_email_rate_limit(identifier: str) -> tuple[bool, int, int]:
    """
    Kiểm tra rate limit gửi email reset password
    identifier: email hoặc username hoặc IP
    Returns: (allowed, remaining, retry_after_seconds)
    """
    return email_rate_limiter.check(
        key=f"email:{identifier}",
        max_count=settings.EMAIL_RATE_LIMIT_MAX,
        window_minutes=settings.EMAIL_RATE_LIMIT_WINDOW_MINUTES,
    )


def record_email_sent(identifier: str):
    """Ghi nhận đã gửi email"""
    email_rate_limiter.record(f"email:{identifier}")
