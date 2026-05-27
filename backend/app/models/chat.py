"""
Chat models — Conversations, Members, Messages
Hỗ trợ: 1-1 chat, group chat, file/image, read receipts
"""
import enum
from datetime import datetime, timezone, timedelta
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, Enum,
    ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from app.database import Base

_VN_TZ = timezone(timedelta(hours=7))


def _vn_now():
    return datetime.now(_VN_TZ).replace(tzinfo=None)


class ConversationType(str, enum.Enum):
    DIRECT = "direct"
    GROUP = "group"


class MessageType(str, enum.Enum):
    TEXT = "text"
    IMAGE = "image"
    FILE = "file"
    SYSTEM = "system"


class MemberRole(str, enum.Enum):
    ADMIN = "admin"
    MEMBER = "member"


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=True)  # NULL cho direct, tên group cho group
    type = Column(Enum(ConversationType), default=ConversationType.DIRECT, nullable=False)
    avatar_color = Column(String(20), default="#276EF1")
    created_by = Column(Integer, ForeignKey("app_users.id"), nullable=False)
    created_at = Column(DateTime, default=_vn_now)
    updated_at = Column(DateTime, default=_vn_now, onupdate=_vn_now)

    # Relationships
    members = relationship("ConversationMember", back_populates="conversation", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")
    creator = relationship("AppUser", foreign_keys=[created_by])


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_conv_member"),
        Index("ix_conv_member_user", "user_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("app_users.id"), nullable=False)
    role = Column(Enum(MemberRole), default=MemberRole.MEMBER, nullable=False)
    joined_at = Column(DateTime, default=_vn_now)
    last_read_at = Column(DateTime, nullable=True)  # Thời điểm đọc cuối cùng

    # Relationships
    conversation = relationship("Conversation", back_populates="members")
    user = relationship("AppUser")


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_msg_conv_created", "conversation_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(Integer, ForeignKey("app_users.id"), nullable=False)
    content = Column(Text, nullable=True)  # Text content hoặc caption cho file
    message_type = Column(Enum(MessageType), default=MessageType.TEXT, nullable=False)

    # File/Image fields
    file_url = Column(String(500), nullable=True)
    file_name = Column(String(300), nullable=True)
    file_size = Column(Integer, nullable=True)  # bytes
    file_mime = Column(String(100), nullable=True)

    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=_vn_now)

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship("AppUser")

    # Read receipts
    read_by = relationship("MessageReadReceipt", back_populates="message", cascade="all, delete-orphan")


class MessageReadReceipt(Base):
    """Đánh dấu tin nhắn đã được đọc bởi ai, lúc nào"""
    __tablename__ = "message_read_receipts"
    __table_args__ = (
        UniqueConstraint("message_id", "user_id", name="uq_msg_read"),
        Index("ix_read_receipt_user", "user_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("app_users.id"), nullable=False)
    read_at = Column(DateTime, default=_vn_now)

    message = relationship("Message", back_populates="read_by")
    user = relationship("AppUser")
