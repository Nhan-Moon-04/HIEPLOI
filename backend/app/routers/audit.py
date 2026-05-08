from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, or_
from app.database import get_db
from app.models.audit import AuditLog
from app.models.user import AppUser, UserRole
from app.middleware.auth import require_roles

router = APIRouter(prefix="/audit", tags=["Audit - Nhật ký"])

@router.get("")
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    table_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Lấy danh sách nhật ký thay đổi"""
    query = select(AuditLog)
    
    if table_name:
        query = query.where(AuditLog.table_name == table_name)
    
    if search:
        query = query.where(
            or_(
                AuditLog.changed_by.ilike(f"%{search}%"),
                AuditLog.notes.ilike(f"%{search}%"),
                AuditLog.record_id.ilike(f"%{search}%"),
            )
        )
    
    # Count total
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()
    
    # Paginate
    query = query.order_by(desc(AuditLog.changed_at)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    logs = result.scalars().all()
    
    return {
        "items": logs,
        "total": total,
        "page": page,
        "page_size": page_size
    }
