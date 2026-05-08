from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete
from app.database import get_db
from app.models.salary import MonthlySalary, MonthlyWorkdayConfig
from app.models.employee import Employee
from app.models.user import AppUser, UserRole
from app.middleware.auth import require_roles, get_current_user
from pydantic import BaseModel
import openpyxl
from io import BytesIO

router = APIRouter(prefix="/salaries", tags=["Salaries - Lương"])


class BaseSalaryRow(BaseModel):
    employee_code: str
    full_name: str
    department: Optional[str] = None
    base_salary: float
    allowance: float

class BaseSalaryResponse(BaseModel):
    month_key: str
    standard_days: float
    is_locked: bool
    rows: List[BaseSalaryRow]


@router.get("/base", response_model=BaseSalaryResponse)
async def get_base_salaries(
    month_key: str = Query(..., description="YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Lấy danh sách lương cơ bản và phụ cấp của tất cả nhân viên trong tháng"""
    # Lấy config tháng
    config_result = await db.execute(select(MonthlyWorkdayConfig).where(MonthlyWorkdayConfig.month_key == month_key))
    config = config_result.scalar_one_or_none()
    standard_days = float(config.company_work_days) if config else 26.0
    is_locked = bool(config.is_locked) if config else False

    # Lấy lương
    query = select(MonthlySalary, Employee).join(Employee, MonthlySalary.employee_id == Employee.id)\
        .where(MonthlySalary.month_key == month_key).order_by(Employee.employee_code)
    
    result = await db.execute(query)
    records = result.all()

    rows = []
    for sal, emp in records:
        rows.append(BaseSalaryRow(
            employee_code=emp.employee_code,
            full_name=emp.full_name,
            department=emp.department,
            base_salary=float(sal.base_salary or 0),
            allowance=float(sal.allowance or 0),
        ))

    return BaseSalaryResponse(
        month_key=month_key,
        standard_days=standard_days,
        is_locked=is_locked,
        rows=rows,
    )


@router.post("/import-base")
async def import_base_salaries(
    month_key: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Import file lương cố định (Lương cơ bản + Phụ cấp) cho toàn bộ nhân viên. Chỉ admin."""
    # Kiểm tra khóa tháng
    config_result = await db.execute(select(MonthlyWorkdayConfig).where(MonthlyWorkdayConfig.month_key == month_key))
    config = config_result.scalar_one_or_none()
    
    if config and config.is_locked:
        raise HTTPException(400, "Tháng này đã bị khóa (chốt dữ liệu), không thể import lại lương.")

    content = await file.read()
    try:
        wb = openpyxl.load_workbook(BytesIO(content), data_only=True)
    except Exception:
        raise HTTPException(400, "File không hợp lệ. Vui lòng upload file Excel (.xlsx)")
    
    ws = wb[wb.sheetnames[0]]

    # Tìm hệ số lương
    standard_days = 26.0
    for r in range(1, min(10, ws.max_row + 1)):
        for c in range(1, min(15, ws.max_column + 1)):
            v = ws.cell(r, c).value
            if isinstance(v, str) and "he so luong" in v.lower().replace("ệ", "e").replace("ố", "o").replace("ươ", "uo"):
                val = ws.cell(r, c + 1).value
                if val is not None:
                    try:
                        standard_days = float(val)
                    except ValueError:
                        pass
                break

    # Lưu cấu hình tháng
    if not config:
        config = MonthlyWorkdayConfig(month_key=month_key, company_work_days=standard_days)
        db.add(config)
    else:
        config.company_work_days = standard_days

    # Load nhân viên
    emp_result = await db.execute(select(Employee))
    emp_map = {e.employee_code: e for e in emp_result.scalars().all()}

    processed = 0
    # Đọc dữ liệu từ dòng 3 (sau header)
    for r in range(3, ws.max_row + 1):
        emp_code = ws.cell(r, 2).value
        if not emp_code:
            continue
        
        emp_code = str(int(emp_code) if isinstance(emp_code, float) else emp_code).strip()
        if emp_code not in emp_map:
            continue
            
        emp = emp_map[emp_code]
        base_salary = float(ws.cell(r, 4).value or 0)
        allowance = float(ws.cell(r, 5).value or 0)

        # Upsert
        sal_result = await db.execute(select(MonthlySalary).where(
            and_(MonthlySalary.employee_id == emp.id, MonthlySalary.month_key == month_key)
        ))
        sal = sal_result.scalar_one_or_none()

        if sal:
            sal.base_salary = base_salary
            sal.allowance = allowance
            sal.base_daily_wage = base_salary / standard_days if standard_days > 0 else 0
        else:
            sal = MonthlySalary(
                employee_id=emp.id,
                month_key=month_key,
                base_salary=base_salary,
                allowance=allowance,
                base_daily_wage=base_salary / standard_days if standard_days > 0 else 0
            )
            db.add(sal)
        processed += 1

    await db.commit()
    return {"message": f"Import thành công lương cho {processed} nhân viên (Hệ số: {standard_days} ngày)", "processed": processed}


@router.post("/lock-month")
async def lock_month(
    month_key: str = Form(...),
    action: str = Form(...),  # 'lock' or 'unlock'
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Khóa/Mở khóa dữ liệu tháng. Chỉ admin."""
    config_result = await db.execute(select(MonthlyWorkdayConfig).where(MonthlyWorkdayConfig.month_key == month_key))
    config = config_result.scalar_one_or_none()
    
    if not config:
        config = MonthlyWorkdayConfig(month_key=month_key)
        db.add(config)
        
    config.is_locked = (action == 'lock')
    await db.commit()
    return {"message": "Đã chốt (khóa) dữ liệu tháng" if config.is_locked else "Đã mở khóa dữ liệu tháng"}
