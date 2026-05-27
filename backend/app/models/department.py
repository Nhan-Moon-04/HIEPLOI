from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(32), unique=True, nullable=False, index=True)  # Mã bộ phận
    name = Column(String(120), unique=True, nullable=False)             # Tên bộ phận VN
    name_tw = Column(String(120), nullable=True)                        # Tên bộ phận tiếng Hoa
    description = Column(String(255), nullable=True)                    # Mô tả ngắn
    sort_order = Column(Integer, default=0)                             # Thứ tự sắp xếp bộ phận
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
