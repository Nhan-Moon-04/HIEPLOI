from typing import List, Optional
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete
from pydantic import BaseModel
from app.database import get_db
from app.models.meal_approval import MealApproval
from app.models.employee import Employee
from app.models.user import AppUser, UserRole
from app.middleware.auth import get_current_user, require_roles

router = APIRouter(prefix="/meal-approvals", tags=["Meal Approvals - Duyet Tien An"])


class MealApprovalOut(BaseModel):
    id: int
    employee_id: int
    employee_code: Optional[str] = None
    full_name: Optional[str] = None
    department: Optional[str] = None
    work_date: date
    shift_code: Optional[str] = None
    detected_mode: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    status: str
    approved_meal_count: int
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    reason: Optional[str] = None


class MealApprovalListResponse(BaseModel):
    items: List[MealApprovalOut]
    total: int


class ApproveRequest(BaseModel):
    ids: List[int]
    meal_count: int = 1
    reason: Optional[str] = None


class RejectRequest(BaseModel):
    ids: List[int]
    reason: Optional[str] = None


class CreateApprovalRequest(BaseModel):
    employee_id: int
    work_date: date
    shift_code: Optional[str] = None
    detected_mode: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None


@router.get("", response_model=MealApprovalListResponse)
async def get_meal_approvals(
    start_date: date = Query(...),
    end_date: date = Query(...),
    status: Optional[str] = Query(None, description="pending|approved|rejected"),
    department: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Lấy danh sách duyệt tiền ăn"""
    q = select(MealApproval, Employee).join(
        Employee, MealApproval.employee_id == Employee.id
    ).where(
        and_(
            MealApproval.work_date >= start_date,
            MealApproval.work_date <= end_date,
        )
    )
    if status:
        q = q.where(MealApproval.status == status)
    if department:
        q = q.where(Employee.department == department)

    result = await db.execute(q)
    rows = result.all()

    items = []
    for approval, emp in rows:
        items.append(MealApprovalOut(
            id=approval.id,
            employee_id=approval.employee_id,
            employee_code=emp.employee_code,
            full_name=emp.full_name,
            department=emp.department,
            work_date=approval.work_date,
            shift_code=approval.shift_code,
            detected_mode=approval.detected_mode,
            check_in=approval.check_in.strftime("%Y-%m-%d %H:%M") if approval.check_in else None,
            check_out=approval.check_out.strftime("%Y-%m-%d %H:%M") if approval.check_out else None,
            status=approval.status,
            approved_meal_count=approval.approved_meal_count or 1,
            approved_by=approval.approved_by,
            approved_at=approval.approved_at,
            reason=approval.reason,
        ))

    return MealApprovalListResponse(items=items, total=len(items))


@router.put("/approve")
async def approve_meals(
    request: ApproveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Duyệt tiền ăn cho các bản ghi"""
    if not request.ids:
        raise HTTPException(400, "Cần ít nhất 1 ID")

    q = select(MealApproval).where(MealApproval.id.in_(request.ids))
    result = await db.execute(q)
    approvals = list(result.scalars().all())

    if not approvals:
        raise HTTPException(404, "Không tìm thấy bản ghi")

    now = datetime.utcnow()
    for a in approvals:
        a.status = "approved"
        a.approved_meal_count = request.meal_count
        a.approved_by = current_user.id
        a.approved_at = now
        a.reason = request.reason or a.reason

    await db.commit()
    return {"message": f"Đã duyệt {len(approvals)} bản ghi", "count": len(approvals)}


@router.put("/reject")
async def reject_meals(
    request: RejectRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Từ chối tiền ăn"""
    if not request.ids:
        raise HTTPException(400, "Cần ít nhất 1 ID")

    q = select(MealApproval).where(MealApproval.id.in_(request.ids))
    result = await db.execute(q)
    approvals = list(result.scalars().all())

    for a in approvals:
        a.status = "rejected"
        a.approved_by = current_user.id
        a.approved_at = datetime.utcnow()
        a.reason = request.reason or a.reason

    await db.commit()
    return {"message": f"Đã từ chối {len(approvals)} bản ghi", "count": len(approvals)}


@router.delete("/{approval_id}")
async def delete_meal_approval(
    approval_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Xóa bản ghi duyệt"""
    q = select(MealApproval).where(MealApproval.id == approval_id)
    result = await db.execute(q)
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(404, "Không tìm thấy")

    await db.delete(approval)
    await db.commit()
    return {"message": "Đã xóa"}


@router.post("")
async def create_meal_approval(
    request: CreateApprovalRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Tạo bản ghi duyệt tiền ăn thủ công"""
    # Check if already exists
    existing = await db.execute(
        select(MealApproval).where(
            and_(
                MealApproval.employee_id == request.employee_id,
                MealApproval.work_date == request.work_date,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Bản ghi đã tồn tại cho nhân viên này vào ngày này")

    check_in_dt = None
    check_out_dt = None
    if request.check_in:
        try:
            check_in_dt = datetime.strptime(request.check_in, "%Y-%m-%d %H:%M")
        except ValueError:
            pass
    if request.check_out:
        try:
            check_out_dt = datetime.strptime(request.check_out, "%Y-%m-%d %H:%M")
        except ValueError:
            pass

    approval = MealApproval(
        employee_id=request.employee_id,
        work_date=request.work_date,
        shift_code=request.shift_code,
        detected_mode=request.detected_mode,
        check_in=check_in_dt,
        check_out=check_out_dt,
        status="pending",
        approved_meal_count=1,
    )
    db.add(approval)
    await db.commit()
    await db.refresh(approval)
    return {"message": "Đã tạo bản ghi", "id": approval.id}
