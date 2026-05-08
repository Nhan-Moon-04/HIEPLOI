from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog
from datetime import datetime, date
from decimal import Decimal

def json_serializable(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: json_serializable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [json_serializable(v) for v in obj]
    return obj

async def log_audit(
    db: AsyncSession,
    table_name: str,
    record_id: str,
    action: str,
    changed_by: str,
    before_data: dict = None,
    after_data: dict = None,
    notes: str = None
):
    """
    Ghi nhật ký thay đổi vào bảng audit_logs.
    action: CREATE, UPDATE, DELETE, IMPORT, v.v.
    """
    log = AuditLog(
        table_name=table_name,
        record_id=str(record_id),
        action=action,
        changed_by=changed_by,
        before_data=json_serializable(before_data) if before_data else None,
        after_data=json_serializable(after_data) if after_data else None,
        notes=notes,
        changed_at=datetime.utcnow()
    )
    db.add(log)
    # Không gọi commit ở đây, để nó đi cùng transaction của action chính
