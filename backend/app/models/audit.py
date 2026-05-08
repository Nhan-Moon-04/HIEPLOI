from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, JSON
from app.database import Base


class AuditLog(Base):
    """Ghi nhật ký thay đổi"""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    table_name = Column(String(64), nullable=False)
    record_id = Column(String(64), nullable=False)
    action = Column(String(32), nullable=False)  # CREATE, UPDATE, DELETE
    changed_by = Column(String(64))
    changed_at = Column(DateTime, default=datetime.utcnow)
    before_data = Column(JSON)
    after_data = Column(JSON)
    notes = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
