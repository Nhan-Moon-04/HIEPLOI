from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, extract, outerjoin
from app.database import get_db
from app.models.employee import Employee
from app.models.schedule import WorkSchedule
from app.models.shift import ShiftTemplate
from app.models.attendance import AttendanceDaily
from app.models.holiday import CompanyHoliday
from app.models.user import AppUser, UserRole
from app.middleware.auth import get_current_user, require_roles
from datetime import datetime, date, timedelta
from typing import List, Optional
from decimal import Decimal

router = APIRouter(prefix="/leave", tags=["Leave - Phep nam"])

@router.get("/summary")
async def get_leave_summary(
    year: int = Query(default=datetime.now().year),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Tong hop phep nam va nghi ko phep - Tinh toan chinh xac theo mac dinh va lich lam"""
    # 1. Lay tat ca nhan vien dang hoat dong
    emp_result = await db.execute(select(Employee).where(Employee.is_active == True).order_by(Employee.employee_code))
    employees = emp_result.scalars().all()
    
    # 2. Load ma ca
    shift_res = await db.execute(select(ShiftTemplate))
    all_shifts = shift_res.scalars().all()
    shifts_by_id = {s.id: s for s in all_shifts}
    shifts_by_code = {s.code: s for s in all_shifts}
    
    # 3. Load lich lam thu cong (overrides) trong nam
    sched_q = select(WorkSchedule).where(extract("year", WorkSchedule.work_date) == year)
    sched_res = await db.execute(sched_q)
    override_map = {(s.employee_id, s.work_date): s.shift_id for s in sched_res.scalars().all()}
    
    # 4. Load du lieu cham cong thuc te
    att_q = select(AttendanceDaily).where(extract("year", AttendanceDaily.work_date) == year)
    att_res = await db.execute(att_q)
    att_map = {(a.employee_id, a.work_date): a for a in att_res.scalars().all()}
    
    # 5. Load ngay le
    holiday_q = select(CompanyHoliday.holiday_date).where(
        and_(extract("year", CompanyHoliday.holiday_date) == year, CompanyHoliday.is_active == True)
    )
    holiday_res = await db.execute(holiday_q)
    holiday_dates = set(holiday_res.scalars().all())
    
    results = []
    today = date.today()
    if today.year > year:
        last_date = date(year, 12, 31)
    elif today.year < year:
        last_date = date(year, 1, 1) # Chua den nam nay
    else:
        last_date = today

    for emp in employees:
        used = 0.0
        absent = 0
        forgot = 0
        
        default_shift = shifts_by_code.get(emp.default_shift_code)
        
        # Duyet qua tung ngay tu dau nam den nay (hoac het nam)
        curr = date(year, 1, 1)
        while curr <= last_date:
            if curr.year > year: break
            
            is_sunday = curr.weekday() == 6
            is_holiday = curr in holiday_dates
            
            # Xac dinh ca lam viec
            sid = override_map.get((emp.id, curr))
            shift = shifts_by_id.get(sid) if sid else (None if (is_sunday or is_holiday) else default_shift)
            
            if shift:
                if shift.is_leave_code and shift.is_paid_leave:
                    # Nghi phep co luong (P, S, C)
                    if shift.code == "P": used += 1.0
                    elif shift.code in ["S", "C"]: used += 0.5
                elif not shift.is_leave_code:
                    # Ca lam viec binh thuong -> Check cham cong
                    att = att_map.get((emp.id, curr))
                    if not att or (not att.first_check_in and not att.last_check_out):
                        # Vang mat (khong tu tru phep)
                        absent += 1
                    elif not att.first_check_in or not att.last_check_out:
                        forgot += 1
            
            curr += timedelta(days=1)
            
        entitlement = 12.0
        results.append({
            "id": emp.id,
            "employee_code": emp.employee_code,
            "full_name": emp.full_name,
            "department": emp.department,
            "entitlement": entitlement,
            "used": used,
            "remaining": entitlement - used,
            "absent_days": absent,
            "forgot_scan_days": forgot
        })
        
    return results

@router.get("/details/{employee_id}")
async def get_leave_details(
    employee_id: int,
    year: int = Query(default=datetime.now().year),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Chi tiet cac ngay nghi phep va vang mat cua 1 nhan vien"""
    # 1. Load data
    shift_res = await db.execute(select(ShiftTemplate))
    all_shifts = shift_res.scalars().all()
    shifts_by_id = {s.id: s for s in all_shifts}
    shifts_by_code = {s.code: s for s in all_shifts}
    
    emp = await db.get(Employee, employee_id)
    if not emp: return []
    
    sched_q = select(WorkSchedule).where(
        and_(WorkSchedule.employee_id == employee_id, extract("year", WorkSchedule.work_date) == year)
    )
    sched_res = await db.execute(sched_q)
    override_map = {s.work_date: s.shift_id for s in sched_res.scalars().all()}
    
    att_q = select(AttendanceDaily).where(
        and_(AttendanceDaily.employee_id == employee_id, extract("year", AttendanceDaily.work_date) == year)
    )
    att_res = await db.execute(att_q)
    att_map = {a.work_date: a for a in att_res.scalars().all()}
    
    holiday_q = select(CompanyHoliday.holiday_date).where(
        and_(extract("year", CompanyHoliday.holiday_date) == year, CompanyHoliday.is_active == True)
    )
    holiday_res = await db.execute(holiday_q)
    holiday_dates = set(holiday_res.scalars().all())
    
    default_shift = shifts_by_code.get(emp.default_shift_code)
    
    records = []
    today = date.today()
    last_date = date(year, 12, 31) if today.year > year else today
    
    curr = date(year, 1, 1)
    while curr <= last_date:
        if curr.year > year: break
        
        is_sunday = curr.weekday() == 6
        is_holiday = curr in holiday_dates
        
        sid = override_map.get(curr)
        shift = shifts_by_id.get(sid) if sid else (None if (is_sunday or is_holiday) else default_shift)
        
        if shift:
            if shift.is_leave_code and shift.is_paid_leave:
                records.append({
                    "work_date": curr,
                    "shift_code": shift.code,
                    "notes": shift.name
                })
            elif not shift.is_leave_code:
                att = att_map.get(curr)
                if not att or (not att.first_check_in and not att.last_check_out):
                    records.append({
                        "work_date": curr,
                        "shift_code": "N",
                        "notes": "Vang mat (Khong phep)"
                    })
        
        curr += timedelta(days=1)
        
    return sorted(records, key=lambda x: x["work_date"], reverse=True)
