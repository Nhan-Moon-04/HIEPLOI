from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, UniqueConstraint
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
    created_by = Column(String(64))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("holiday_date", name="uq_company_holiday_date"),
    )
