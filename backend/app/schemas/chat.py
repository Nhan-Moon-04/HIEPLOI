"""
Pydantic schemas cho Chat API
"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Request schemas ────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    """Tạo conversation mới"""
    type: str = "direct"  # 'direct' hoặc 'group'
    name: Optional[str] = None  # Tên group (bắt buộc nếu type=group)
    member_ids: List[int]  # Danh sách user_id thêm vào
    avatar_color: Optional[str] = "#276EF1"


class GroupUpdate(BaseModel):
    """Cập nhật thông tin group"""
    name: Optional[str] = None
    avatar_color: Optional[str] = None


class GroupMembersAdd(BaseModel):
    """Thêm members vào group"""
    user_ids: List[int]


class MessageCreate(BaseModel):
    """Gửi tin nhắn text"""
    content: str


class MarkReadRequest(BaseModel):
    """Đánh dấu đã đọc đến message_id"""
    message_id: Optional[int] = None  # None = đọc hết


# ── Response schemas ───────────────────────────────────────────────────────────

class UserBrief(BaseModel):
    """Thông tin user ngắn gọn cho chat"""
    id: int
    username: str
    full_name: Optional[str] = None
    role: str
    is_active: bool = True

    class Config:
        from_attributes = True


class MessageReadInfo(BaseModel):
    user_id: int
    username: str
    full_name: Optional[str] = None
    read_at: datetime

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    sender_name: Optional[str] = None
    sender_username: Optional[str] = None
    content: Optional[str] = None
    message_type: str
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_mime: Optional[str] = None
    is_deleted: bool = False
    created_at: datetime
    read_by: List[MessageReadInfo] = []

    class Config:
        from_attributes = True


class MemberResponse(BaseModel):
    id: int
    user_id: int
    username: str
    full_name: Optional[str] = None
    role: str  # admin / member
    joined_at: datetime
    last_read_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    id: int
    name: Optional[str] = None
    type: str
    avatar_color: Optional[str] = None
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    members: List[MemberResponse] = []
    last_message: Optional[MessageResponse] = None
    unread_count: int = 0

    class Config:
        from_attributes = True


class ChatUserListResponse(BaseModel):
    """Danh sách user có thể nhắn tin"""
    users: List[UserBrief]
