from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, UniqueConstraint, Numeric
from app.database import Base


class MealApproval(Base):
    """Duyệt tiền ăn cho giờ làm không hợp lệ (về sớm, vào dị, ...)"""
    __tablename__ = "meal_approvals"
    __table_args__ = (
        UniqueConstraint("employee_id", "work_date", name="uq_meal_approval_emp_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    work_date = Column(Date, nullable=False, index=True)

    shift_code = Column(String(16))          # Mã ca (XNU, NU, ...)
    detected_mode = Column(String(32))       # Ca detect (xnu_shift1, xnu_shift2, xnu_shift3)
    check_in = Column(DateTime)              # Giờ vào thực tế
    check_out = Column(DateTime)             # Giờ ra thực tế

    status = Column(String(16), default="pending", nullable=False)  # pending | approved | rejected
    approved_meal_count = Column(Integer, default=1)   # Số bữa ăn được duyệt
    approved_by = Column(Integer, ForeignKey("app_users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    reason = Column(String(255), nullable=True)        # Lý do (VD: "Sếp cho về sớm, hết hàng")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
