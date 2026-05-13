from typing import List, Optional
from datetime import date
import calendar
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select, func, or_, and_, cast, Integer, Numeric, delete
from app.database import get_db
from app.models.employee import Employee
from app.models.salary import MonthlySalary
from app.models.attendance import AttendanceDaily, AttendanceDetail
from app.models.schedule import WorkSchedule
from app.models.user import AppUser, UserRole
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse
from app.middleware.auth import get_current_user, require_roles
from app.utils.audit_helper import log_audit

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
    # Base query
    if month_key:
        query = select(Employee, MonthlySalary.base_salary.label("month_salary")).outerjoin(
            MonthlySalary, and_(MonthlySalary.employee_id == Employee.id, MonthlySalary.month_key == month_key)
        )
    else:
        query = select(Employee, cast(None, Numeric).label("month_salary"))

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

    # Paginate
    query = query.order_by(Employee.employee_code).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.all()
    
    employees_res = []
    for emp, m_sal in rows:
        item = EmployeeResponse.model_validate(emp)
        item.month_salary = m_sal
        employees_res.append(item)

    return {
        "items": employees_res,
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
    # Cho phep trung ma neu nguoi cu da nghi (is_active = False)
    result = await db.execute(
        select(Employee).where(and_(Employee.employee_code == request.employee_code, Employee.is_active == True))
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Mã NV '{request.employee_code}' đang được sử dụng bởi một nhân viên đang làm việc.")

    emp = Employee(**request.model_dump())
    db.add(emp)
    await db.commit()
    await db.refresh(emp)

    # Ghi nhật ký
    await log_audit(db, "employees", emp.id, "CREATE", current_user.username, None, request.model_dump())
    await db.commit()

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

    # Lưu bản cũ để ghi log
    before_data = {c.name: getattr(emp, c.name) for c in emp.__table__.columns}
    
    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(emp, key, value)

    await db.commit()
    await db.refresh(emp)
    
    # Ghi nhật ký
    after_data = {c.name: getattr(emp, c.name) for c in emp.__table__.columns}
    await log_audit(db, "employees", emp.id, "UPDATE", current_user.username, before_data, after_data)
    await db.commit()

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

    before_data = {c.name: getattr(emp, c.name) for c in emp.__table__.columns}
    
    # Ghi nhật ký (chuẩn bị sẵn trong session)
    await log_audit(db, "employees", employee_id, "DELETE", current_user.username, before_data, None)

    try:
        # Xóa dữ liệu liên quan trước
        await db.execute(delete(AttendanceDaily).where(AttendanceDaily.employee_id == employee_id))
        await db.execute(delete(AttendanceDetail).where(AttendanceDetail.employee_id == employee_id))
        await db.execute(delete(WorkSchedule).where(WorkSchedule.employee_id == employee_id))
        await db.execute(delete(MonthlySalary).where(MonthlySalary.employee_id == employee_id))
        
        # Xóa nhân viên
        await db.delete(emp)
        await db.commit() # Commit cả việc xóa và việc ghi log
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=500, 
            detail=f"Lỗi khi xóa nhân viên: {str(e)}"
        )

    return {"message": f"Đã xóa nhân viên '{emp.full_name}'"}
