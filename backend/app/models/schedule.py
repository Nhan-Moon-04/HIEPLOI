from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Numeric, ForeignKey, Date, UniqueConstraint
from app.database import Base


class WorkSchedule(Base):
    """Lịch làm việc cụ thể"""
    __tablename__ = "work_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    work_date = Column(Date, nullable=False)
    month_key = Column(String(7), nullable=False)
    shift_id = Column(Integer, ForeignKey("shift_templates.id"), nullable=False)
    absence_hours = Column(Numeric(5, 2))
    notes = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("employee_id", "work_date", name="uq_work_schedule_emp_date"),
    )
