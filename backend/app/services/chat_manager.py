"""
WebSocket Connection Manager — quản lý kết nối real-time cho chat
Hỗ trợ: multi-tab (nhiều connection cùng 1 user), broadcast theo conversation
"""
import json
from typing import Dict, List, Optional
from fastapi import WebSocket
from datetime import datetime, timezone


def _utcnow_iso():
    return datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


class ConnectionManager:
    """Quản lý tất cả WebSocket connections"""

    def __init__(self):
        # user_id → list[WebSocket] (hỗ trợ nhiều tab/thiết bị)
        self.active_connections: Dict[int, List[WebSocket]] = {}
        # conversation_id → set[user_id] (tracking ai đang trong conversation nào)
        self.conversation_users: Dict[int, set] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        """Thêm connection mới"""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        """Xóa connection"""
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    def is_online(self, user_id: int) -> bool:
        """Kiểm tra user có đang online không"""
        return user_id in self.active_connections and len(self.active_connections[user_id]) > 0

    def get_online_user_ids(self) -> List[int]:
        """Lấy danh sách user_id đang online"""
        return list(self.active_connections.keys())

    async def send_to_user(self, user_id: int, message: dict):
        """Gửi message đến tất cả connections của 1 user"""
        if user_id in self.active_connections:
            dead_connections = []
            for ws in self.active_connections[user_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    dead_connections.append(ws)
            # Dọn dẹp connections đã chết
            for ws in dead_connections:
                self.active_connections[user_id].remove(ws)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast_to_conversation(
        self,
        member_ids: List[int],
        message: dict,
        exclude_user_id: Optional[int] = None,
    ):
        """Broadcast message đến tất cả members của conversation (trừ exclude)"""
        for uid in member_ids:
            if exclude_user_id and uid == exclude_user_id:
                continue
            await self.send_to_user(uid, message)

    async def send_typing(
        self,
        member_ids: List[int],
        conversation_id: int,
        user_id: int,
        username: str,
        full_name: Optional[str],
        is_typing: bool,
    ):
        """Gửi typing indicator"""
        msg = {
            "type": "typing",
            "conversation_id": conversation_id,
            "user_id": user_id,
            "username": username,
            "full_name": full_name,
            "is_typing": is_typing,
            "timestamp": _utcnow_iso(),
        }
        await self.broadcast_to_conversation(member_ids, msg, exclude_user_id=user_id)

    async def send_read_receipt(
        self,
        member_ids: List[int],
        conversation_id: int,
        user_id: int,
        username: str,
        full_name: Optional[str],
        message_id: int,
    ):
        """Gửi read receipt event"""
        msg = {
            "type": "read",
            "conversation_id": conversation_id,
            "user_id": user_id,
            "username": username,
            "full_name": full_name,
            "message_id": message_id,
            "timestamp": _utcnow_iso(),
        }
        await self.broadcast_to_conversation(member_ids, msg, exclude_user_id=user_id)

    async def send_online_status(self, member_ids: List[int], user_id: int, is_online: bool):
        """Thông báo trạng thái online/offline"""
        msg = {
            "type": "online_status",
            "user_id": user_id,
            "is_online": is_online,
            "timestamp": _utcnow_iso(),
        }
        await self.broadcast_to_conversation(member_ids, msg, exclude_user_id=user_id)


# Singleton instance
manager = ConnectionManager()
