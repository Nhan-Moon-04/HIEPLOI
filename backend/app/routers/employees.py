from typing import List, Optional
from datetime import date
import calendar
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, cast, Integer
from app.database import get_db
from app.models.employee import Employee
from app.models.user import AppUser, UserRole
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse
from app.middleware.auth import get_current_user, require_roles

router = APIRouter(prefix="/employees", tags=["Employees - Nhân Viên"])


@router.get("", response_model=dict)
async def list_employees(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = None,
    department: Optional[str] = None,
    is_active: Optional[bool] = None,
    month_key: Optional[str] = Query(None, description="Filter by month YYYY-MM: show employees active in that month"),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Danh sach nhan vien co phan trang + tim kiem + loc theo thang"""
    query = select(Employee)

    if search:
        query = query.where(
            or_(
                Employee.full_name.ilike(f"%{search}%"),
                Employee.employee_code.ilike(f"%{search}%"),
            )
        )
    if department:
        query = query.where(Employee.department == department)
    if is_active is not None:
        query = query.where(Employee.is_active == is_active)

    # Filter by month: employee active if join_date <= end_of_month AND (leave_date is null OR leave_date >= start_of_month)
    if month_key:
        try:
            year, month = map(int, month_key.split("-"))
            first_day = date(year, month, 1)
            last_day = date(year, month, calendar.monthrange(year, month)[1])
            query = query.where(
                and_(
                    or_(Employee.join_date.is_(None), Employee.join_date <= last_day),
                    or_(Employee.leave_date.is_(None), Employee.leave_date >= first_day),
                )
            )
        except (ValueError, IndexError):
            pass

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Paginate - sort employee_code as integer
    query = query.order_by(cast(Employee.employee_code, Integer)).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    employees = result.scalars().all()

    return {
        "items": [EmployeeResponse.model_validate(e) for e in employees],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "month_key": month_key,
    }


@router.get("/departments", response_model=List[str])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Danh sách bộ phận"""
    result = await db.execute(
        select(Employee.department).where(Employee.department.isnot(None)).distinct().order_by(Employee.department)
    )
    return [row[0] for row in result.all() if row[0]]


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Chi tiết nhân viên"""
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Nhân viên không tồn tại")
    return EmployeeResponse.model_validate(emp)


@router.post("", response_model=EmployeeResponse, status_code=201)
async def create_employee(
    request: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Tạo nhân viên mới"""
    result = await db.execute(select(Employee).where(Employee.employee_code == request.employee_code))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Mã NV '{request.employee_code}' đã tồn tại")

    emp = Employee(**request.model_dump())
    db.add(emp)
    await db.commit()
    await db.refresh(emp)
    return EmployeeResponse.model_validate(emp)


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: int,
    request: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Cập nhật nhân viên"""
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Nhân viên không tồn tại")

    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(emp, key, value)

    await db.commit()
    await db.refresh(emp)
    return EmployeeResponse.model_validate(emp)


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Xóa nhân viên"""
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Nhân viên không tồn tại")

    await db.delete(emp)
    await db.commit()
    return {"message": f"Đã xóa nhân viên '{emp.full_name}'"}
