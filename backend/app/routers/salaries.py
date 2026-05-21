from typing import List, Optional
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete, update, func
from app.database import get_db
from app.models.salary import MonthlySalary, MonthlyWorkdayConfig, AdvancePayment, AdvanceLoan
from app.models.employee import Employee
from app.models.user import AppUser, UserRole
from app.middleware.auth import require_roles, get_current_user
from pydantic import BaseModel
import openpyxl
from io import BytesIO
from app.utils.audit_helper import log_audit
from app.utils.lock_helper import check_month_locked

router = APIRouter(prefix="/salaries", tags=["Salaries - Lương"])


class BaseSalaryRow(BaseModel):
    employee_id: int
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


class SalaryHistoryRow(BaseModel):
    month_key: str
    base_salary: float
    allowance: float
    base_daily_wage: float
    pay_method: Optional[str] = None
    salary_coefficient: float
    updated_at: Optional[datetime] = None


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
            employee_id=sal.employee_id,
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


@router.get("/history", response_model=List[SalaryHistoryRow])
async def get_salary_history(
    employee_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Lịch sử lương theo tháng của 1 nhân viên"""
    result = await db.execute(
        select(MonthlySalary)
        .where(MonthlySalary.employee_id == employee_id)
        .order_by(MonthlySalary.month_key.desc())
    )
    rows = []
    for sal in result.scalars().all():
        rows.append(SalaryHistoryRow(
            month_key=sal.month_key,
            base_salary=float(sal.base_salary or 0),
            allowance=float(sal.allowance or 0),
            base_daily_wage=float(sal.base_daily_wage or 0),
            pay_method=sal.pay_method,
            salary_coefficient=float(sal.salary_coefficient or 1),
            updated_at=sal.updated_at,
        ))
    return rows


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
    
    ws = None
    if "Bang Luong" in wb.sheetnames:
        ws = wb["Bang Luong"]
    else:
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
    # 1. Thu thap thong tin tu file Excel
    file_emps = {} # code -> {name, base_salary, allowance}
    for r in range(3, ws.max_row + 1):
        c_raw = ws.cell(r, 2).value
        n_raw = ws.cell(r, 3).value
        if c_raw and n_raw:
            code = str(int(c_raw) if isinstance(c_raw, float) else c_raw).strip().lstrip("'")
            file_emps[code] = {
                "name": str(n_raw).strip(),
                "base_salary": float(ws.cell(r, 4).value or 0),
                "allowance": float(ws.cell(r, 5).value or 0)
            }

    # Load lai nhan vien dang hoat dong
    emp_result = await db.execute(select(Employee).where(Employee.is_active == True))
    emp_map = {str(e.employee_code).lstrip("'"): e for e in emp_result.scalars().all()}

    processed = 0
    # Đọc dữ liệu từ dòng 3 (sau header)
    for r in range(3, ws.max_row + 1):
        emp_code = ws.cell(r, 2).value
        if not emp_code:
            continue
        
        emp_code = str(int(emp_code) if isinstance(emp_code, float) else emp_code).strip().lstrip("'")
        if emp_code not in emp_map:
            continue
            
        emp = emp_map[emp_code]
        info = file_emps.get(emp_code, {})
        base_salary = info.get("base_salary", 0)
        allowance = info.get("allowance", 0)

        # Upsert
        sal_result = await db.execute(select(MonthlySalary).where(
            and_(MonthlySalary.employee_id == emp.id, MonthlySalary.month_key == month_key)
        ))
        sal = sal_result.scalar_one_or_none()

        # Dong bo nguoc lai bang Employee (Luong co ban hien tai)
        emp.base_salary = base_salary

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

    # Ghi nhật ký
    await log_audit(
        db, "monthly_salaries", month_key, "IMPORT", current_user.username,
        notes=f"Import luong thang {month_key} tu {file.filename}. {processed} NV. He so: {standard_days}"
    )
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


@router.get("/advances")
async def get_advances_summary(
    month_key: str = Query(..., description="YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Tổng tạm ứng theo nhân viên trong tháng"""
    result = await db.execute(
        select(AdvancePayment, Employee)
        .join(Employee, AdvancePayment.employee_id == Employee.id)
        .where(AdvancePayment.month_key == month_key)
        .order_by(Employee.employee_code)
    )
    rows = result.all()
    from collections import defaultdict
    emp_advances = defaultdict(float)
    emp_info = {}
    for adv, emp in rows:
        emp_advances[emp.id] += float(adv.amount or 0)
        emp_info[emp.id] = {
            "employee_id": emp.id,
            "employee_code": emp.employee_code,
            "full_name": emp.full_name,
        }
    return [{"total_advance": emp_advances[eid], **emp_info[eid]} for eid in emp_advances]


class UpdateDependentsRequest(BaseModel):
    employee_id: int
    dependents: int


@router.put("/dependents")
async def update_dependents(
    req: UpdateDependentsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Cập nhật số người phụ thuộc của nhân viên"""
    emp = await db.get(Employee, req.employee_id)
    if not emp:
        raise HTTPException(404, "Không tìm thấy nhân viên")
    emp.dependents = max(0, req.dependents)
    await db.commit()
    return {"message": f"Đã cập nhật {emp.full_name}: {emp.dependents} người phụ thuộc"}


# ─── Advance Loans ────────────────────────────────────────────────────────────

class CreateLoanRequest(BaseModel):
    employee_id: int
    loan_date: date
    total_amount: float
    advance_type: str = 'cash'          # cash | half_month | full_month | multi_month
    repayment_months: int = 1           # Số tháng trả
    monthly_repayment: Optional[float] = None  # Nếu None → auto = total/months
    start_month: str                    # YYYY-MM tháng đầu tiên bị trừ
    notes: Optional[str] = None


@router.get("/loans")
async def get_loans(
    employee_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Danh sách khoản tạm ứng (có thể lọc theo nhân viên / trạng thái)"""
    q = select(AdvanceLoan, Employee).join(Employee, AdvanceLoan.employee_id == Employee.id)
    if employee_id:
        q = q.where(AdvanceLoan.employee_id == employee_id)
    if status:
        q = q.where(AdvanceLoan.status == status)
    q = q.order_by(AdvanceLoan.loan_date.desc())
    result = await db.execute(q)

    rows = []
    for loan, emp in result.all():
        # Tính tổng đã trả từ advance_payments
        paid_res = await db.execute(
            select(func.sum(AdvancePayment.amount))
            .where(AdvancePayment.loan_id == loan.id)
        )
        paid = float(paid_res.scalar() or 0)
        rows.append({
            "id": loan.id,
            "employee_id": emp.id,
            "employee_code": emp.employee_code,
            "full_name": emp.full_name,
            "department": emp.department,
            "loan_date": loan.loan_date.isoformat(),
            "total_amount": float(loan.total_amount),
            "advance_type": loan.advance_type,
            "repayment_months": loan.repayment_months,
            "monthly_repayment": float(loan.monthly_repayment or 0),
            "start_month": loan.start_month,
            "paid_amount": paid,
            "remaining": max(0, float(loan.total_amount) - paid),
            "status": loan.status,
            "notes": loan.notes,
            "created_at": loan.created_at.isoformat() if loan.created_at else None,
        })
    return rows


@router.post("/loans")
async def create_loan(
    req: CreateLoanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Tạo khoản tạm ứng + tự động sinh advance_payments theo kế hoạch trả"""
    # Kiểm tra khóa tháng cho toàn bộ các kỳ trả sắp tạo
    months = max(1, req.repayment_months)
    def add_months(d: date, n: int) -> date:
        m = d.month - 1 + n
        return d.replace(year=d.year + m // 12, month=m % 12 + 1, day=1)

    start_dt = datetime.strptime(req.start_month, "%Y-%m").date().replace(day=1)
    for i in range(months):
        month_dt = add_months(start_dt, i)
        mk = month_dt.strftime("%Y-%m")
        await check_month_locked(db, mk)

    emp = await db.get(Employee, req.employee_id)
    if not emp:
        raise HTTPException(404, "Không tìm thấy nhân viên")

    months = max(1, req.repayment_months)
    per_month = req.monthly_repayment if req.monthly_repayment else round(req.total_amount / months)

    loan = AdvanceLoan(
        employee_id=req.employee_id,
        loan_date=req.loan_date,
        total_amount=req.total_amount,
        advance_type=req.advance_type,
        repayment_months=months,
        monthly_repayment=per_month,
        start_month=req.start_month,
        paid_amount=0,
        status='active',
        notes=req.notes,
        created_by=current_user.username,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(loan)
    await db.flush()  # để có loan.id

    def add_months(d: date, n: int) -> date:
        m = d.month - 1 + n
        return d.replace(year=d.year + m // 12, month=m % 12 + 1, day=1)

    # Sinh advance_payment cho từng kỳ
    start = datetime.strptime(req.start_month, "%Y-%m").date().replace(day=1)
    remaining = float(req.total_amount)
    for i in range(months):
        month_dt = add_months(start, i)
        mk = month_dt.strftime("%Y-%m")
        # Kỳ cuối trả phần còn lại để tránh sai số làm tròn
        amt = per_month if i < months - 1 else remaining
        remaining -= amt
        pay = AdvancePayment(
            employee_id=req.employee_id,
            loan_id=loan.id,
            advance_date=month_dt,
            month_key=mk,
            amount=round(amt),
            installment_no=i + 1,
            input_mode='amount',
            notes=f"Kỳ {i+1}/{months} — {req.notes or ''}".strip(" —"),
        )
        db.add(pay)

    await db.commit()
    return {"message": f"Tạo thành công khoản ứng {req.total_amount:,.0f}đ cho {emp.full_name} — {months} kỳ", "loan_id": loan.id}


@router.delete("/loans/{loan_id}")
async def cancel_loan(
    loan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Hủy khoản tạm ứng — xóa các kỳ chưa đến hạn"""
    loan = await db.get(AdvanceLoan, loan_id)
    if not loan:
        raise HTTPException(404, "Không tìm thấy khoản ứng")

    today_mk = datetime.utcnow().strftime("%Y-%m")
    
    # Kiểm tra khóa tháng đối với các kỳ trả sắp bị xóa (kỳ ở tương lai)
    result = await db.execute(
        select(AdvancePayment.month_key).where(
            AdvancePayment.loan_id == loan_id,
            AdvancePayment.month_key > today_mk,
        )
    )
    target_mks = result.scalars().all()
    for mk in target_mks:
        await check_month_locked(db, mk)
    # Xóa các kỳ ở tháng tương lai
    await db.execute(
        delete(AdvancePayment).where(
            AdvancePayment.loan_id == loan_id,
            AdvancePayment.month_key > today_mk,
        )
    )
    loan.status = 'cancelled'
    loan.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "Đã hủy các kỳ trả chưa đến hạn"}


@router.get("/loans/{loan_id}/installments")
async def get_loan_installments(
    loan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Danh sách kỳ trả của 1 khoản ứng"""
    result = await db.execute(
        select(AdvancePayment)
        .where(AdvancePayment.loan_id == loan_id)
        .order_by(AdvancePayment.month_key)
    )
    today_mk = datetime.utcnow().strftime("%Y-%m")
    rows = []
    for p in result.scalars().all():
        rows.append({
            "id": p.id,
            "month_key": p.month_key,
            "amount": float(p.amount or 0),
            "installment_no": p.installment_no,
            "paid": p.month_key <= today_mk,
            "notes": p.notes,
        })
    return rows
