from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, UniqueConstraint, ForeignKey
from app.database import Base


class CompanyHoliday(Base):
    """Ngay le / ngay nghi toan cong ty"""
    __tablename__ = "company_holidays"

    id = Column(Integer, primary_key=True, autoincrement=True)
    holiday_date = Column(Date, nullable=False)
    name = Column(String(120), nullable=False)
    holiday_type = Column(String(32), nullable=False)  # national, company, custom
    is_active = Column(Boolean, default=True)  # True = nghi, False = di lam binh thuong
    notes = Column(String(255))
    scope = Column(String(32), default="all")  # all, department, employee
    departments = Column(String(512))  # Comma-separated departments
    duration = Column(String(16), default="full")  # full, half
    created_by = Column(String(64))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("holiday_date", name="uq_company_holiday_date"),
    )


class HolidayException(Base):
    """Nhân viên ngoại lệ đi làm vào ngày nghỉ toàn công ty"""
    __tablename__ = "holiday_exceptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    holiday_id = Column(Integer, ForeignKey("company_holidays.id", ondelete="CASCADE"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (
        UniqueConstraint("holiday_id", "employee_id", name="uq_holiday_exception_emp"),
    )


class HolidayTargetEmployee(Base):
    """Nhân viên được áp dụng ngày nghỉ (nếu scope == 'employee')"""
    __tablename__ = "holiday_target_employees"

    id = Column(Integer, primary_key=True, autoincrement=True)
    holiday_id = Column(Integer, ForeignKey("company_holidays.id", ondelete="CASCADE"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (
        UniqueConstraint("holiday_id", "employee_id", name="uq_holiday_target_emp"),
    )

