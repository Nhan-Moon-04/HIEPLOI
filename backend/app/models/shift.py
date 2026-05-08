from datetime import datetime, time
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Time, Numeric, Text
from app.database import Base


class ShiftTemplate(Base):
    __tablename__ = "shift_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(16), unique=True, nullable=False, index=True)
    name = Column(String(120), nullable=False)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    break_minutes = Column(Integer, default=60)
    standard_hours = Column(Numeric(5, 2), default=8)
    default_overtime_hours = Column(Numeric(5, 2), default=0)
    meal_allowance = Column(Numeric(12, 2), default=0)  # Tiền ăn ca
    meal_count = Column(Integer, default=0)  # Số bữa ăn
    is_night_shift = Column(Boolean, default=False)
    is_leave_code = Column(Boolean, default=False)  # Là mã nghỉ
    is_paid_leave = Column(Boolean, default=False)  # Nghỉ có lương
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
