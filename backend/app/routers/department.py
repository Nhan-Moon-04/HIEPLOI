from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, and_

from app.database import get_db
from app.models.department import Department
from app.models.employee import Employee
from app.models.user import AppUser, UserRole
from app.schemas.department import DepartmentCreate, DepartmentUpdate, DepartmentResponse
from app.schemas.employee import EmployeeResponse
from app.middleware.auth import get_current_user, require_roles
from app.utils.audit_helper import log_audit

router = APIRouter(prefix="/departments", tags=["Departments - Bộ Phận"])


@router.get("", response_model=List[DepartmentResponse])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Lấy danh sách bộ phận kèm số lượng nhân viên thực tế"""
    query = select(
        Department,
        func.count(Employee.id).label("emp_count")
    ).outerjoin(
        Employee, Employee.department == Department.name
    ).group_by(
        Department.id
    ).order_by(
        Department.sort_order,
        Department.name
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    res = []
    for dept, emp_count in rows:
        item = DepartmentResponse.model_validate(dept)
        item.employee_count = emp_count
        res.append(item)
        
    return res


@router.get("/{id}", response_model=dict)
async def get_department(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Lấy chi tiết bộ phận kèm danh sách nhân viên thuộc bộ phận đó"""
    result = await db.execute(select(Department).where(Department.id == id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Bộ phận không tồn tại")
        
    # Lấy danh sách nhân viên thuộc bộ phận (sắp xếp theo sort_order trước)
    emp_q = await db.execute(
        select(Employee)
        .where(Employee.department == dept.name)
        .order_by(Employee.sort_order, Employee.employee_code)
    )
    employees = emp_q.scalars().all()
    
    # Số lượng nhân viên
    emp_count = len(employees)
    
    dept_res = DepartmentResponse.model_validate(dept)
    dept_res.employee_count = emp_count
    
    return {
        "department": dept_res,
        "employees": [EmployeeResponse.model_validate(emp) for emp in employees]
    }


@router.post("", response_model=DepartmentResponse, status_code=201)
async def create_department(
    request: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Tạo bộ phận mới"""
    # Kiểm tra mã bộ phận trùng
    code_check = await db.execute(select(Department).where(Department.code == request.code.strip()))
    if code_check.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Mã bộ phận '{request.code}' đã tồn tại.")
        
    # Kiểm tra tên bộ phận trùng
    name_check = await db.execute(select(Department).where(Department.name == request.name.strip()))
    if name_check.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Tên bộ phận '{request.name}' đã tồn tại.")

    # Tạo bộ phận
    dept = Department(
        code=request.code.strip(),
        name=request.name.strip(),
        name_tw=request.name_tw.strip() if request.name_tw else None,
        description=request.description.strip() if request.description else None
    )
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    
    # Gán nhân viên nếu có
    emp_count = 0
    if request.employee_ids:
        # Cập nhật tên bộ phận cho các nhân viên được chọn
        await db.execute(
            update(Employee)
            .where(Employee.id.in_(request.employee_ids))
            .values(department=dept.name, department_tw=dept.name_tw)
        )
        await db.commit()
        emp_count = len(request.employee_ids)

    # Ghi nhật ký hoạt động
    audit_data = request.model_dump()
    await log_audit(db, "departments", dept.id, "CREATE", current_user.username, None, audit_data)
    await db.commit()

    res = DepartmentResponse.model_validate(dept)
    res.employee_count = emp_count
    return res


@router.put("/reorder", status_code=status.HTTP_200_OK)
async def reorder_departments(
    ids: List[int],
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Cập nhật thứ tự hiển thị của các bộ phận"""
    for idx, dept_id in enumerate(ids):
        await db.execute(
            update(Department).where(Department.id == dept_id).values(sort_order=idx)
        )
    await db.commit()
    return {"message": "Đã cập nhật thứ tự bộ phận thành công."}


@router.put("/{id}/reorder-employees", status_code=status.HTTP_200_OK)
async def reorder_employees(
    id: int,
    employee_ids: List[int],
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Cập nhật thứ tự sắp xếp nhân viên trong bộ phận"""
    # Lấy thông tin bộ phận
    result = await db.execute(select(Department).where(Department.id == id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Bộ phận không tồn tại")

    for idx, emp_id in enumerate(employee_ids):
        await db.execute(
            update(Employee)
            .where(and_(Employee.id == emp_id, Employee.department == dept.name))
            .values(sort_order=idx)
        )
    await db.commit()
    return {"message": "Đã cập nhật thứ tự nhân viên trong bộ phận thành công."}


@router.put("/{id}", response_model=DepartmentResponse)
async def update_department(
    id: int,
    request: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Cập nhật bộ phận + đồng bộ nhân viên"""
    result = await db.execute(select(Department).where(Department.id == id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Bộ phận không tồn tại")
        
    # Kiểm tra trùng mã với bộ phận khác
    code_check = await db.execute(
        select(Department).where(and_(Department.code == request.code.strip(), Department.id != id))
    )
    if code_check.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Mã bộ phận '{request.code}' đã tồn tại ở bộ phận khác.")
        
    # Kiểm tra trùng tên với bộ phận khác
    name_check = await db.execute(
        select(Department).where(and_(Department.name == request.name.strip(), Department.id != id))
    )
    if name_check.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Tên bộ phận '{request.name}' đã tồn tại ở bộ phận khác.")

    before_data = {c.name: getattr(dept, c.name) for c in dept.__table__.columns}
    old_name = dept.name
    new_name = request.name.strip()
    new_name_tw = request.name_tw.strip() if request.name_tw else None

    # Cập nhật bộ phận
    dept.code = request.code.strip()
    dept.name = new_name
    dept.name_tw = new_name_tw
    dept.description = request.description.strip() if request.description else None
    
    await db.commit()
    await db.refresh(dept)
    
    # Đồng bộ nhân viên
    if request.employee_ids is not None:
        # 1. Gỡ bỏ bộ phận cho những nhân viên hiện tại có tên bộ phận cũ nhưng KHÔNG nằm trong danh sách ID mới
        await db.execute(
            update(Employee)
            .where(and_(Employee.department == old_name, Employee.id.notin_(request.employee_ids)))
            .values(department=None, department_tw=None)
        )
        
        # 2. Cập nhật bộ phận mới cho những nhân viên nằm trong danh sách ID mới
        if request.employee_ids:
            await db.execute(
                update(Employee)
                .where(Employee.id.in_(request.employee_ids))
                .values(department=new_name, department_tw=new_name_tw)
            )
        await db.commit()
        emp_count = len(request.employee_ids)
    else:
        # Nếu không truyền danh sách employee_ids, chỉ cập nhật tên bộ phận mới cho các nhân viên cũ của bộ phận này
        if old_name != new_name:
            await db.execute(
                update(Employee)
                .where(Employee.department == old_name)
                .values(department=new_name, department_tw=new_name_tw)
            )
            await db.commit()
            
        # Đếm số lượng nhân viên hiện tại
        count_q = await db.execute(select(func.count(Employee.id)).where(Employee.department == new_name))
        emp_count = count_q.scalar()

    # Ghi nhật ký hoạt động
    after_data = {c.name: getattr(dept, c.name) for c in dept.__table__.columns}
    await log_audit(db, "departments", dept.id, "UPDATE", current_user.username, before_data, after_data)
    await db.commit()

    res = DepartmentResponse.model_validate(dept)
    res.employee_count = emp_count
    return res


@router.delete("/{id}")
async def delete_department(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Xóa bộ phận và đưa tất cả nhân viên thuộc bộ phận đó về trạng thái bộ phận trống"""
    result = await db.execute(select(Department).where(Department.id == id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Bộ phận không tồn tại")
        
    before_data = {c.name: getattr(dept, c.name) for c in dept.__table__.columns}
    
    # 1. Cập nhật nhân viên thuộc bộ phận bị xóa về trống
    await db.execute(
        update(Employee)
        .where(Employee.department == dept.name)
        .values(department=None, department_tw=None)
    )
    
    # 2. Xóa bộ phận
    await db.delete(dept)
    
    # Ghi nhật ký hoạt động
    await log_audit(db, "departments", id, "DELETE", current_user.username, before_data, None)
    await db.commit()
    
    return {"message": f"Đã xóa bộ phận '{dept.name}' thành công."}

