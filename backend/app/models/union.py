from datetime import datetime, date
from sqlalchemy import Column, Integer, String, DateTime, Numeric, ForeignKey, Date, Boolean
from app.database import Base


class UnionTransaction(Base):
    """Giao dịch tài chính công đoàn (Sổ ngân hàng + Sổ quỹ tiền mặt)"""
    __tablename__ = "union_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    transaction_date = Column(Date, nullable=False)
    description = Column(String(500), nullable=False)
    deposit = Column(Numeric(14, 2), default=0)       # Thu / Gửi vào
    withdrawal = Column(Numeric(14, 2), default=0)    # Chi / Rút ra
    balance = Column(Numeric(14, 2), default=0)        # Số dư sau giao dịch
    transaction_type = Column(String(10), nullable=False)  # 'bank' | 'cash'
    category = Column(String(32), default='other')
    # doan_phi, kinh_phi, luong_bch, phi_ql, lai, rut_sec, thuong_le, tham_hoi, nop_cap_tren, phi_ck, other
    quarter = Column(String(5))   # Q1, Q2, Q3, Q4
    year = Column(Integer, nullable=False)
    receipt_no = Column(String(32))  # Số phiếu thu/chi (PT, PC)
    notes = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UnionEvent(Base):
    """Sự kiện phát thưởng/quà công đoàn"""
    __tablename__ = "union_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_name = Column(String(255), nullable=False)
    event_date = Column(Date)
    event_type = Column(String(32), default='other')
    # tet_duong, quocte_phunu, le_304_105, quoc_khanh, trung_thu, ngay_nam, tat_nien, gio_to, phunu_vn, other
    year = Column(Integer, nullable=False)
    amount_per_person = Column(Numeric(12, 2), default=0)
    total_amount = Column(Numeric(14, 2), default=0)
    total_male = Column(Integer, default=0)
    total_female = Column(Integer, default=0)
    total_members = Column(Integer, default=0)
    notes = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UnionEventMember(Base):
    """Chi tiết đoàn viên nhận thưởng từng sự kiện"""
    __tablename__ = "union_event_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("union_events.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)  # Nullable vì có thể không match
    full_name = Column(String(255), nullable=False)
    gender = Column(String(10))  # male | female
    amount = Column(Numeric(12, 2), default=0)
    notes = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)


class UnionMember(Base):
    """Danh sách đoàn viên chính thức"""
    __tablename__ = "union_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    full_name = Column(String(255), nullable=False)
    gender = Column(String(10))            # male | female
    # doan_vien | uy_vien_bch | chu_tich | pho_chu_tich | thu_quy
    position = Column(String(32), default='doan_vien')
    bch_monthly_salary = Column(Numeric(12, 2), default=0)  # Phụ cấp BCH (0 nếu không thuộc BCH)
    join_date = Column(Date)
    is_active = Column(Boolean, default=True)
    notes = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
