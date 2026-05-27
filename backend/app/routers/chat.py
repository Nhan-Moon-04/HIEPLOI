"""
Chat REST API + WebSocket endpoint
─────────────────────────────────
• Nhân viên (worker/accountant/import_export): chỉ nhắn được với admin
• Admin: nhắn với ai cũng được, tạo group, quản lý group
• Hỗ trợ: gửi file/ảnh, đã xem, đang soạn tin, lịch sử
"""
import os
import uuid
import mimetypes
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import (
    APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect,
    Query, UploadFile, File, Form,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc, update, delete
from sqlalchemy.orm import selectinload

from app.database import get_db, AsyncSessionLocal
from app.models.user import AppUser, UserRole
from app.models.chat import (
    Conversation, ConversationMember, Message, MessageReadReceipt,
    ConversationType, MessageType, MemberRole,
)
from app.schemas.chat import (
    ConversationCreate, ConversationResponse, MessageResponse,
    MessageCreate, GroupUpdate, GroupMembersAdd, MarkReadRequest,
    UserBrief, MemberResponse, MessageReadInfo,
)
from app.middleware.auth import get_current_user, require_roles
from app.utils.security import decode_token
from app.services.chat_manager import manager


router = APIRouter(prefix="/chat", tags=["Chat"])


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── Upload directory ──────────────────────────────────────────────────────────
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "chat")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"}
ALLOWED_FILE_TYPES = ALLOWED_IMAGE_TYPES | {
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "text/csv",
    "application/zip", "application/x-rar-compressed",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


# ── Helper functions ──────────────────────────────────────────────────────────

def _can_message_user(current_user: AppUser, target_user: AppUser) -> bool:
    """Kiểm tra quyền nhắn tin"""
    if current_user.role == UserRole.ADMIN:
        return True  # Admin nhắn với ai cũng được
    # Không phải admin → chỉ được nhắn với admin
    return target_user.role == UserRole.ADMIN


async def _get_conversation_member_ids(db: AsyncSession, conversation_id: int) -> List[int]:
    """Lấy danh sách user_id trong conversation"""
    result = await db.execute(
        select(ConversationMember.user_id)
        .where(ConversationMember.conversation_id == conversation_id)
    )
    return [r[0] for r in result.all()]


async def _build_message_response(msg: Message, db: AsyncSession) -> dict:
    """Build message response dict từ Message model"""
    # Lấy read receipts
    read_result = await db.execute(
        select(MessageReadReceipt, AppUser)
        .join(AppUser, MessageReadReceipt.user_id == AppUser.id)
        .where(MessageReadReceipt.message_id == msg.id)
    )
    read_by = []
    for receipt, user in read_result.all():
        read_by.append({
            "user_id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "read_at": receipt.read_at.isoformat() if receipt.read_at else None,
        })

    # Lấy sender info
    sender_result = await db.execute(select(AppUser).where(AppUser.id == msg.sender_id))
    sender = sender_result.scalar_one_or_none()

    return {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_id": msg.sender_id,
        "sender_name": sender.full_name if sender else None,
        "sender_username": sender.username if sender else None,
        "content": msg.content,
        "message_type": msg.message_type.value if hasattr(msg.message_type, 'value') else msg.message_type,
        "file_url": msg.file_url,
        "file_name": msg.file_name,
        "file_size": msg.file_size,
        "file_mime": msg.file_mime,
        "is_deleted": msg.is_deleted,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "read_by": read_by,
    }


async def _build_conversation_response(
    conv: Conversation, current_user_id: int, db: AsyncSession
) -> dict:
    """Build conversation response dict"""
    # Members
    members_result = await db.execute(
        select(ConversationMember, AppUser)
        .join(AppUser, ConversationMember.user_id == AppUser.id)
        .where(ConversationMember.conversation_id == conv.id)
    )
    members = []
    for cm, user in members_result.all():
        members.append({
            "id": cm.id,
            "user_id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "role": cm.role.value if hasattr(cm.role, 'value') else cm.role,
            "joined_at": cm.joined_at.isoformat() if cm.joined_at else None,
            "last_read_at": cm.last_read_at.isoformat() if cm.last_read_at else None,
        })

    # Last message
    last_msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(desc(Message.created_at))
        .limit(1)
    )
    last_msg = last_msg_result.scalar_one_or_none()
    last_message = None
    if last_msg:
        last_message = await _build_message_response(last_msg, db)

    # Unread count
    my_member_result = await db.execute(
        select(ConversationMember)
        .where(
            ConversationMember.conversation_id == conv.id,
            ConversationMember.user_id == current_user_id,
        )
    )
    my_member = my_member_result.scalar_one_or_none()
    unread_q = select(func.count(Message.id)).where(
        Message.conversation_id == conv.id,
        Message.sender_id != current_user_id,
        Message.is_deleted == False,
    )
    if my_member and my_member.last_read_at:
        unread_q = unread_q.where(Message.created_at > my_member.last_read_at)
    unread_result = await db.execute(unread_q)
    unread_count = unread_result.scalar() or 0

    # Tên hiển thị cho direct conversation
    display_name = conv.name
    if conv.type == ConversationType.DIRECT or (hasattr(conv.type, 'value') and conv.type.value == 'direct'):
        other = [m for m in members if m["user_id"] != current_user_id]
        if other:
            display_name = other[0]["full_name"] or other[0]["username"]

    return {
        "id": conv.id,
        "name": display_name,
        "type": conv.type.value if hasattr(conv.type, 'value') else conv.type,
        "avatar_color": conv.avatar_color,
        "created_by": conv.created_by,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        "members": members,
        "last_message": last_message,
        "unread_count": unread_count,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# REST API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

# ── Lấy danh sách user có thể nhắn tin ────────────────────────────────────────
@router.get("/users")
async def get_chattable_users(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Lấy danh sách user có thể nhắn tin (theo quyền)"""
    if current_user.role == UserRole.ADMIN:
        # Admin thấy tất cả user active (trừ chính mình)
        result = await db.execute(
            select(AppUser)
            .where(AppUser.is_active == True, AppUser.id != current_user.id)
            .order_by(AppUser.full_name)
        )
    else:
        # Worker/accountant/import_export → chỉ thấy admin
        result = await db.execute(
            select(AppUser)
            .where(
                AppUser.is_active == True,
                AppUser.role == UserRole.ADMIN,
                AppUser.id != current_user.id,
            )
            .order_by(AppUser.full_name)
        )

    users = result.scalars().all()
    return {
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "full_name": u.full_name,
                "role": u.role.value if hasattr(u.role, 'value') else u.role,
                "is_active": u.is_active,
            }
            for u in users
        ]
    }


# ── Danh sách conversations ───────────────────────────────────────────────────
@router.get("/conversations")
async def get_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Lấy tất cả conversations của user hiện tại, sắp xếp theo tin nhắn mới nhất"""
    # Tìm tất cả conversation mà user là member
    my_conv_ids = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == current_user.id
    )
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id.in_(my_conv_ids))
        .order_by(desc(Conversation.updated_at))
    )
    conversations = result.scalars().all()

    response = []
    for conv in conversations:
        conv_data = await _build_conversation_response(conv, current_user.id, db)
        response.append(conv_data)

    # Sort by last_message time (newest first)
    response.sort(
        key=lambda c: c["last_message"]["created_at"] if c.get("last_message") else c["created_at"],
        reverse=True,
    )

    return response


# ── Tạo conversation mới ──────────────────────────────────────────────────────
@router.post("/conversations")
async def create_conversation(
    req: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Tạo conversation mới (direct 1-1 hoặc group)"""

    if req.type == "direct":
        # Direct chat: chỉ 1 người khác
        if len(req.member_ids) != 1:
            raise HTTPException(400, "Direct chat chỉ được 1 người")

        target_id = req.member_ids[0]
        # Lấy target user
        target_result = await db.execute(select(AppUser).where(AppUser.id == target_id))
        target_user = target_result.scalar_one_or_none()
        if not target_user:
            raise HTTPException(404, "Không tìm thấy người dùng")

        # Kiểm tra quyền
        if not _can_message_user(current_user, target_user):
            raise HTTPException(403, "Bạn chỉ được nhắn tin với admin")

        # Kiểm tra đã có conversation direct chưa (tránh duplicate)
        existing = await db.execute(
            select(Conversation)
            .join(ConversationMember, Conversation.id == ConversationMember.conversation_id)
            .where(
                Conversation.type == ConversationType.DIRECT,
                ConversationMember.user_id == current_user.id,
            )
        )
        existing_convs = existing.scalars().all()

        for conv in existing_convs:
            members_result = await db.execute(
                select(ConversationMember.user_id)
                .where(ConversationMember.conversation_id == conv.id)
            )
            member_ids = [r[0] for r in members_result.all()]
            if set(member_ids) == {current_user.id, target_id}:
                # Đã có conversation → trả về luôn
                return await _build_conversation_response(conv, current_user.id, db)

        # Tạo mới
        conv = Conversation(
            type=ConversationType.DIRECT,
            created_by=current_user.id,
        )
        db.add(conv)
        await db.flush()

        # Thêm 2 members
        db.add(ConversationMember(
            conversation_id=conv.id, user_id=current_user.id, role=MemberRole.ADMIN
        ))
        db.add(ConversationMember(
            conversation_id=conv.id, user_id=target_id, role=MemberRole.MEMBER
        ))
        await db.commit()
        await db.refresh(conv)

        return await _build_conversation_response(conv, current_user.id, db)

    elif req.type == "group":
        # Group chat: chỉ admin tạo
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(403, "Chỉ admin mới được tạo group chat")
        if not req.name or not req.name.strip():
            raise HTTPException(400, "Group phải có tên")
        if len(req.member_ids) < 1:
            raise HTTPException(400, "Group phải có ít nhất 1 thành viên khác")

        # Kiểm tra tất cả member tồn tại
        users_result = await db.execute(
            select(AppUser).where(AppUser.id.in_(req.member_ids), AppUser.is_active == True)
        )
        valid_users = users_result.scalars().all()
        valid_ids = {u.id for u in valid_users}

        conv = Conversation(
            name=req.name.strip(),
            type=ConversationType.GROUP,
            avatar_color=req.avatar_color or "#276EF1",
            created_by=current_user.id,
        )
        db.add(conv)
        await db.flush()

        # Thêm admin (creator)
        db.add(ConversationMember(
            conversation_id=conv.id, user_id=current_user.id, role=MemberRole.ADMIN
        ))
        # Thêm members
        for uid in valid_ids:
            if uid != current_user.id:
                db.add(ConversationMember(
                    conversation_id=conv.id, user_id=uid, role=MemberRole.MEMBER
                ))

        # System message
        member_names = [u.full_name or u.username for u in valid_users if u.id != current_user.id]
        sys_msg = Message(
            conversation_id=conv.id,
            sender_id=current_user.id,
            content=f"{current_user.full_name or current_user.username} đã tạo nhóm \"{req.name.strip()}\" với {', '.join(member_names)}",
            message_type=MessageType.SYSTEM,
        )
        db.add(sys_msg)

        await db.commit()
        await db.refresh(conv)

        return await _build_conversation_response(conv, current_user.id, db)

    else:
        raise HTTPException(400, "type phải là 'direct' hoặc 'group'")


# ── Lấy tin nhắn (pagination) ─────────────────────────────────────────────────
@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: int,
    before_id: Optional[int] = Query(None, description="Lấy tin nhắn trước message_id này"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Lấy tin nhắn trong conversation (phân trang cursor-based)"""
    # Kiểm tra quyền
    member_check = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == current_user.id,
        )
    )
    if not member_check.scalar_one_or_none():
        raise HTTPException(403, "Bạn không phải thành viên cuộc trò chuyện này")

    q = select(Message).where(
        Message.conversation_id == conversation_id,
    )
    if before_id:
        q = q.where(Message.id < before_id)
    q = q.order_by(desc(Message.id)).limit(limit)

    result = await db.execute(q)
    messages = result.scalars().all()

    # Build responses
    response = []
    for msg in reversed(messages):  # Đảo lại thứ tự (cũ → mới)
        response.append(await _build_message_response(msg, db))

    return {
        "messages": response,
        "has_more": len(messages) == limit,
    }


# ── Gửi tin nhắn text ─────────────────────────────────────────────────────────
@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: int,
    req: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Gửi tin nhắn text"""
    # Kiểm tra quyền
    member_check = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == current_user.id,
        )
    )
    if not member_check.scalar_one_or_none():
        raise HTTPException(403, "Bạn không phải thành viên cuộc trò chuyện này")

    if not req.content or not req.content.strip():
        raise HTTPException(400, "Tin nhắn không được để trống")

    msg = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=req.content.strip(),
        message_type=MessageType.TEXT,
    )
    db.add(msg)

    # Cập nhật updated_at của conversation
    await db.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(updated_at=_utcnow())
    )

    await db.commit()
    await db.refresh(msg)

    msg_data = await _build_message_response(msg, db)

    # Broadcast qua WebSocket
    member_ids = await _get_conversation_member_ids(db, conversation_id)
    await manager.broadcast_to_conversation(
        member_ids,
        {"type": "new_message", "message": msg_data},
    )

    return msg_data


# ── Upload file/ảnh ───────────────────────────────────────────────────────────
@router.post("/conversations/{conversation_id}/upload")
async def upload_file(
    conversation_id: int,
    file: UploadFile = File(...),
    caption: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Upload file/ảnh trong chat"""
    # Kiểm tra quyền
    member_check = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == current_user.id,
        )
    )
    if not member_check.scalar_one_or_none():
        raise HTTPException(403, "Bạn không phải thành viên cuộc trò chuyện này")

    # Đọc file
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"File quá lớn (tối đa {MAX_FILE_SIZE // 1024 // 1024}MB)")

    # Detect MIME type
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    if mime not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Loại file không được hỗ trợ: {mime}")

    # Determine message type
    msg_type = MessageType.IMAGE if mime in ALLOWED_IMAGE_TYPES else MessageType.FILE

    # Save file
    ext = os.path.splitext(file.filename or "file")[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)
    with open(file_path, "wb") as f:
        f.write(content)

    file_url = f"/api/chat/files/{unique_name}"

    msg = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=caption,
        message_type=msg_type,
        file_url=file_url,
        file_name=file.filename,
        file_size=len(content),
        file_mime=mime,
    )
    db.add(msg)

    await db.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(updated_at=_utcnow())
    )

    await db.commit()
    await db.refresh(msg)

    msg_data = await _build_message_response(msg, db)

    # Broadcast
    member_ids = await _get_conversation_member_ids(db, conversation_id)
    await manager.broadcast_to_conversation(
        member_ids,
        {"type": "new_message", "message": msg_data},
    )

    return msg_data


# ── Serve uploaded files ───────────────────────────────────────────────────────
@router.get("/files/{filename}")
async def get_file(filename: str):
    """Serve uploaded file"""
    from fastapi.responses import FileResponse
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(404, "File không tồn tại")
    return FileResponse(file_path)


# ── Đánh dấu đã đọc ──────────────────────────────────────────────────────────
@router.put("/conversations/{conversation_id}/read")
async def mark_as_read(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Đánh dấu đã đọc tất cả tin nhắn trong conversation"""
    member_check = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == current_user.id,
        )
    )
    my_member = member_check.scalar_one_or_none()
    if not my_member:
        raise HTTPException(403, "Bạn không phải thành viên cuộc trò chuyện này")

    now = _utcnow()
    my_member.last_read_at = now

    # Tạo read receipts cho tất cả tin nhắn chưa đọc
    unread_msgs = await db.execute(
        select(Message)
        .where(
            Message.conversation_id == conversation_id,
            Message.sender_id != current_user.id,
            Message.is_deleted == False,
        )
        .order_by(desc(Message.id))
        .limit(100)
    )
    unread_messages = unread_msgs.scalars().all()

    last_msg_id = None
    for msg in unread_messages:
        # Check if receipt exists
        existing = await db.execute(
            select(MessageReadReceipt).where(
                MessageReadReceipt.message_id == msg.id,
                MessageReadReceipt.user_id == current_user.id,
            )
        )
        if not existing.scalar_one_or_none():
            db.add(MessageReadReceipt(
                message_id=msg.id,
                user_id=current_user.id,
                read_at=now,
            ))
        if not last_msg_id or msg.id > last_msg_id:
            last_msg_id = msg.id

    await db.commit()

    # Broadcast read receipt
    if last_msg_id:
        member_ids = await _get_conversation_member_ids(db, conversation_id)
        await manager.send_read_receipt(
            member_ids, conversation_id,
            current_user.id, current_user.username, current_user.full_name,
            last_msg_id,
        )

    return {"status": "ok"}


# ── Cập nhật group ────────────────────────────────────────────────────────────
@router.put("/conversations/{conversation_id}")
async def update_conversation(
    conversation_id: int,
    req: GroupUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Cập nhật thông tin group (chỉ admin)"""
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.type == ConversationType.GROUP,
        )
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, "Group không tồn tại")

    if req.name is not None:
        conv.name = req.name.strip()
    if req.avatar_color is not None:
        conv.avatar_color = req.avatar_color
    conv.updated_at = _utcnow()

    # System message
    if req.name:
        sys_msg = Message(
            conversation_id=conversation_id,
            sender_id=current_user.id,
            content=f"{current_user.full_name or current_user.username} đã đổi tên nhóm thành \"{req.name.strip()}\"",
            message_type=MessageType.SYSTEM,
        )
        db.add(sys_msg)

    await db.commit()
    await db.refresh(conv)

    # Broadcast
    member_ids = await _get_conversation_member_ids(db, conversation_id)
    conv_data = await _build_conversation_response(conv, current_user.id, db)
    await manager.broadcast_to_conversation(
        member_ids,
        {"type": "conversation_updated", "conversation": conv_data},
    )

    return conv_data


# ── Thêm members vào group ────────────────────────────────────────────────────
@router.post("/conversations/{conversation_id}/members")
async def add_members(
    conversation_id: int,
    req: GroupMembersAdd,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Thêm thành viên vào group (chỉ admin)"""
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.type == ConversationType.GROUP,
        )
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, "Group không tồn tại")

    # Lấy danh sách user hợp lệ
    users_result = await db.execute(
        select(AppUser).where(AppUser.id.in_(req.user_ids), AppUser.is_active == True)
    )
    valid_users = users_result.scalars().all()

    added_names = []
    for user in valid_users:
        # Kiểm tra đã là member chưa
        existing = await db.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.user_id == user.id,
            )
        )
        if not existing.scalar_one_or_none():
            db.add(ConversationMember(
                conversation_id=conversation_id,
                user_id=user.id,
                role=MemberRole.MEMBER,
            ))
            added_names.append(user.full_name or user.username)

    if added_names:
        sys_msg = Message(
            conversation_id=conversation_id,
            sender_id=current_user.id,
            content=f"{current_user.full_name or current_user.username} đã thêm {', '.join(added_names)} vào nhóm",
            message_type=MessageType.SYSTEM,
        )
        db.add(sys_msg)
        conv.updated_at = _utcnow()

    await db.commit()

    # Broadcast
    member_ids = await _get_conversation_member_ids(db, conversation_id)
    conv_data = await _build_conversation_response(conv, current_user.id, db)
    await manager.broadcast_to_conversation(
        member_ids,
        {"type": "conversation_updated", "conversation": conv_data},
    )

    return conv_data


# ── Xóa member khỏi group ─────────────────────────────────────────────────────
@router.delete("/conversations/{conversation_id}/members/{user_id}")
async def remove_member(
    conversation_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Xóa thành viên khỏi group (chỉ admin)"""
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.type == ConversationType.GROUP,
        )
    )
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, "Group không tồn tại")

    # Không cho xóa chính mình nếu là creator
    if user_id == conv.created_by:
        raise HTTPException(400, "Không thể xóa người tạo nhóm")

    member_result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    member = member_result.scalar_one_or_none()
    if not member:
        raise HTTPException(404, "Thành viên không tồn tại trong nhóm")

    # Lấy tên user bị xóa
    removed_user_result = await db.execute(select(AppUser).where(AppUser.id == user_id))
    removed_user = removed_user_result.scalar_one_or_none()
    removed_name = removed_user.full_name or removed_user.username if removed_user else "Unknown"

    await db.delete(member)

    sys_msg = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=f"{current_user.full_name or current_user.username} đã xóa {removed_name} khỏi nhóm",
        message_type=MessageType.SYSTEM,
    )
    db.add(sys_msg)
    conv.updated_at = _utcnow()

    await db.commit()

    # Broadcast to remaining members + removed user
    member_ids = await _get_conversation_member_ids(db, conversation_id)
    member_ids.append(user_id)  # Cũng thông báo cho user bị xóa
    await manager.broadcast_to_conversation(
        member_ids,
        {"type": "member_removed", "conversation_id": conversation_id, "user_id": user_id},
    )

    return {"status": "ok", "message": f"Đã xóa {removed_name} khỏi nhóm"}


# ── Lấy thông tin conversation ─────────────────────────────────────────────────
@router.get("/conversations/{conversation_id}")
async def get_conversation_detail(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Lấy chi tiết conversation"""
    member_check = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == current_user.id,
        )
    )
    if not member_check.scalar_one_or_none():
        raise HTTPException(403, "Bạn không phải thành viên cuộc trò chuyện này")

    conv_result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
    conv = conv_result.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, "Cuộc trò chuyện không tồn tại")

    return await _build_conversation_response(conv, current_user.id, db)


# ── Tổng unread ────────────────────────────────────────────────────────────────
@router.get("/unread-count")
async def get_total_unread(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Lấy tổng số tin nhắn chưa đọc ở tất cả conversations"""
    my_memberships = await db.execute(
        select(ConversationMember)
        .where(ConversationMember.user_id == current_user.id)
    )
    memberships = my_memberships.scalars().all()

    total = 0
    for m in memberships:
        unread_q = select(func.count(Message.id)).where(
            Message.conversation_id == m.conversation_id,
            Message.sender_id != current_user.id,
            Message.is_deleted == False,
        )
        if m.last_read_at:
            unread_q = unread_q.where(Message.created_at > m.last_read_at)
        result = await db.execute(unread_q)
        total += result.scalar() or 0

    return {"unread_count": total}


# ═══════════════════════════════════════════════════════════════════════════════
# WEBSOCKET ENDPOINT
# ═══════════════════════════════════════════════════════════════════════════════

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    """
    WebSocket endpoint cho chat real-time.
    Kết nối: ws://host/api/chat/ws?token=JWT_ACCESS_TOKEN

    Client gửi JSON messages:
    - {"action": "typing", "conversation_id": 1, "is_typing": true}
    - {"action": "read", "conversation_id": 1}
    - {"action": "ping"}
    """
    # Xác thực JWT
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        await websocket.close(code=4001, reason="Token không hợp lệ")
        return

    user_id = int(payload.get("sub", 0))
    if not user_id:
        await websocket.close(code=4001, reason="Token không hợp lệ")
        return

    # Lấy thông tin user
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AppUser).where(AppUser.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            await websocket.close(code=4003, reason="User không hợp lệ")
            return
        username = user.username
        full_name = user.full_name

        # Lấy tất cả conversation mà user thuộc (để broadcast online status)
        memberships_result = await db.execute(
            select(ConversationMember.conversation_id).where(ConversationMember.user_id == user_id)
        )
        my_conv_ids = [r[0] for r in memberships_result.all()]

    # Connect
    await manager.connect(user_id, websocket)

    # Broadcast online status
    all_related_members = set()
    async with AsyncSessionLocal() as db:
        for conv_id in my_conv_ids:
            ids = await _get_conversation_member_ids(db, conv_id)
            all_related_members.update(ids)
    all_related_members.discard(user_id)
    await manager.send_online_status(list(all_related_members), user_id, True)

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            if action == "typing":
                conv_id = data.get("conversation_id")
                is_typing = data.get("is_typing", True)
                if conv_id:
                    async with AsyncSessionLocal() as db:
                        member_ids = await _get_conversation_member_ids(db, conv_id)
                    await manager.send_typing(
                        member_ids, conv_id, user_id, username, full_name, is_typing
                    )

            elif action == "read":
                conv_id = data.get("conversation_id")
                if conv_id:
                    async with AsyncSessionLocal() as db:
                        # Update last_read_at
                        await db.execute(
                            update(ConversationMember)
                            .where(
                                ConversationMember.conversation_id == conv_id,
                                ConversationMember.user_id == user_id,
                            )
                            .values(last_read_at=_utcnow())
                        )

                        # Tạo read receipts
                        unread_msgs = await db.execute(
                            select(Message)
                            .where(
                                Message.conversation_id == conv_id,
                                Message.sender_id != user_id,
                                Message.is_deleted == False,
                            )
                            .order_by(desc(Message.id))
                            .limit(50)
                        )
                        last_msg_id = None
                        for msg in unread_msgs.scalars().all():
                            existing = await db.execute(
                                select(MessageReadReceipt).where(
                                    MessageReadReceipt.message_id == msg.id,
                                    MessageReadReceipt.user_id == user_id,
                                )
                            )
                            if not existing.scalar_one_or_none():
                                db.add(MessageReadReceipt(
                                    message_id=msg.id,
                                    user_id=user_id,
                                    read_at=_utcnow(),
                                ))
                            if not last_msg_id or msg.id > last_msg_id:
                                last_msg_id = msg.id

                        await db.commit()

                        if last_msg_id:
                            member_ids = await _get_conversation_member_ids(db, conv_id)
                            await manager.send_read_receipt(
                                member_ids, conv_id, user_id, username, full_name, last_msg_id
                            )

            elif action == "ping":
                await websocket.send_json({"type": "pong", "timestamp": _utcnow().isoformat()})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[WS Error] user={user_id}: {e}")
    finally:
        manager.disconnect(user_id, websocket)
        # Broadcast offline status
        await manager.send_online_status(list(all_related_members), user_id, False)
