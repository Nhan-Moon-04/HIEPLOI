from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Date, Numeric, ForeignKey
from app.database import Base


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_code = Column(String(32), nullable=False, index=True)
    full_name = Column(String(120), nullable=False)
    full_name_tw = Column(String(120))  # Tên tiếng Hoa
    gender = Column(String(16))
    hometown = Column(String(120))
    birth_year = Column(Integer)
    department = Column(String(120))  # Bộ phận VN
    department_tw = Column(String(120))  # Bộ phận tiếng Hoa
    position = Column(String(120))  # Chức vụ
    default_shift_code = Column(String(16), ForeignKey("shift_templates.code"), nullable=True)
    base_salary = Column(Numeric(12, 2), default=0)  # Lương cơ bản
    join_date = Column(Date)  # Ngày vào
    leave_date = Column(Date)  # Ngày nghỉ
    is_active = Column(Boolean, default=True)
    notes = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
