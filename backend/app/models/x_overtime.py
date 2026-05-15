from datetime import datetime, date
from sqlalchemy import Column, Integer, Date, Numeric, DateTime, Time, ForeignKey, UniqueConstraint
from app.database import Base


class XOvertimeConfig(Base):
    """Config tăng ca X theo nhân viên và ngày cụ thể"""
    __tablename__ = "x_overtime_configs"
    __table_args__ = (
        UniqueConstraint("employee_id", "work_date", name="uq_x_ot_emp_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    work_date = Column(Date, nullable=False, index=True)  # Ngày cụ thể

    ot_end_time = Column(Time, nullable=True)        # Giờ ra (VD: 20:00)
    ot_hours = Column(Numeric(4, 1), default=0)      # Số giờ OT
    meal_count = Column(Integer, default=0)          # Số bữa ăn OT

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
