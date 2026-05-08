from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Numeric, ForeignKey, Date, UniqueConstraint
from app.database import Base


class AttendanceLog(Base):
    """Raw log chấm công - tất cả check-in/out từ máy chấm công"""
    __tablename__ = "attendance_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_code = Column(String(32), nullable=False, index=True)
    employee_name = Column(String(120))
    department = Column(String(120))
    event_time = Column(DateTime, nullable=False)
    source_file = Column(String(255))
    import_batch = Column(String(36))
    created_at = Column(DateTime, default=datetime.utcnow)


class AttendanceDaily(Base):
    """Tổng hợp chấm công theo ngày"""
    __tablename__ = "attendance_daily"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    work_date = Column(Date, nullable=False)
    first_check_in = Column(DateTime)
    last_check_out = Column(DateTime)
    total_hours = Column(Numeric(6, 2))
    import_batch = Column(String(36))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("employee_id", "work_date", name="uq_attendance_daily_emp_date"),
    )


class AttendanceDetail(Base):
    """Chi tiết chấm công + tính công"""
    __tablename__ = "attendance_details"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    work_date = Column(Date, nullable=False)
    month_key = Column(String(7), nullable=False)  # YYYY-MM
    shift_code = Column(String(16))
    shift_name = Column(String(120))
    check_in = Column(DateTime)
    check_out = Column(DateTime)
    standard_hours = Column(Numeric(6, 2))
    actual_work_hours = Column(Numeric(6, 2))
    deviation_hours = Column(Numeric(6, 2))
    overtime_hours = Column(Numeric(6, 2))
    total_span_hours = Column(Numeric(6, 2))
    status_code = Column(String(16))  # FULL, HALF, LATE, ABSENT...
    paid_hours = Column(Numeric(6, 2))
    daily_wage = Column(Numeric(12, 2))
    meal_allowance_daily = Column(Numeric(12, 2))
    notes = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("employee_id", "work_date", name="uq_attendance_detail_emp_date"),
    )
