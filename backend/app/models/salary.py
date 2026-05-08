from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Numeric, ForeignKey, Date, Boolean, UniqueConstraint
from app.database import Base


class MonthlySalary(Base):
    """Mức lương tháng cho từng nhân viên"""
    __tablename__ = "monthly_salaries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    month_key = Column(String(7), nullable=False)  # YYYY-MM
    base_salary = Column(Numeric(12, 2))  # Lương cơ bản
    allowance = Column(Numeric(12, 2), default=0)  # Phụ cấp
    base_daily_wage = Column(Numeric(12, 2))
    pay_method = Column(String(32))  # cash, bank
    salary_coefficient = Column(Numeric(10, 4), default=1.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("employee_id", "month_key", name="uq_monthly_salary_emp_month"),
    )


class MonthlyWorkdayConfig(Base):
    """Config hệ số ngày làm việc tháng - CHUNG toàn công ty"""
    __tablename__ = "monthly_workday_configs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    month_key = Column(String(7), unique=True, nullable=False)  # YYYY-MM
    company_work_days = Column(Numeric(6, 2), default=26)  # Hệ số ngày công
    is_locked = Column(Boolean, default=False)  # Chốt tháng
    notes = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PayrollPaymentStatus(Base):
    """Trạng thái thanh toán lương/tiền ăn"""
    __tablename__ = "payroll_payment_statuses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    month_key = Column(String(7), nullable=False)
    salary_received = Column(Boolean, default=False)
    meal_period_1_received = Column(Boolean, default=False)
    meal_period_2_received = Column(Boolean, default=False)
    updated_by = Column(String(64))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("employee_id", "month_key", name="uq_payroll_status_emp_month"),
    )


class AdvancePayment(Base):
    """Tạm ứng"""
    __tablename__ = "advance_payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    advance_date = Column(Date, nullable=False)
    month_key = Column(String(7), nullable=False)
    amount = Column(Numeric(12, 2))
    input_mode = Column(String(16))  # amount, days
    payment_method = Column(String(32))  # cash, bank
    advance_days = Column(Numeric(6, 2))
    notes = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
