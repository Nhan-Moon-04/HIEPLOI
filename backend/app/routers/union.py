from typing import List, Optional
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete, func, case
from app.database import get_db
from app.models.union import UnionTransaction, UnionEvent, UnionEventMember, UnionMember
from app.models.employee import Employee
from app.models.user import AppUser, UserRole
from app.middleware.auth import require_roles, get_current_user
from pydantic import BaseModel
import xlrd
from io import BytesIO
import re
from unicodedata import normalize

router = APIRouter(prefix="/union", tags=["Union - Công đoàn"])


# ─── Helpers ───────────────────────────────────────────────────────────────────

def normalize_name(name: str) -> str:
    """Chuẩn hóa tên để so sánh fuzzy"""
    if not name:
        return ""
    name = normalize("NFC", name.strip().upper())
    name = re.sub(r'\s+', ' ', name)
    return name


def xldate_to_date(xldate, datemode=0):
    """Chuyển số Excel serial date sang Python date"""
    try:
        if isinstance(xldate, float) or isinstance(xldate, int):
            return xlrd.xldate_as_datetime(xldate, datemode).date()
        if isinstance(xldate, str):
            # Try parsing common formats
            for fmt in ['%d/%m/%y', '%d/%m/%Y', '%Y-%m-%d']:
                try:
                    return datetime.strptime(xldate, fmt).date()
                except ValueError:
                    continue
    except Exception:
        pass
    return None


def categorize_description(desc: str) -> str:
    """Phân loại giao dịch theo nội dung"""
    desc_lower = desc.lower() if desc else ""
    if 'đoàn phí' in desc_lower or 'doan phi' in desc_lower:
        if 'nộp' in desc_lower or '30%' in desc_lower:
            return 'nop_cap_tren'
        return 'doan_phi'
    if 'kinh phí' in desc_lower or 'kinh phi' in desc_lower:
        return 'kinh_phi'
    if 'lương bch' in desc_lower or 'luong bch' in desc_lower or 'tiền lương bch' in desc_lower:
        return 'luong_bch'
    if 'phí quản lý' in desc_lower or 'phi ql' in desc_lower or 'phí ck' in desc_lower or 'phi ck' in desc_lower:
        return 'phi_ql'
    if 'vat' in desc_lower:
        return 'phi_ql'
    if 'tiền lãi' in desc_lower or 'tien lai' in desc_lower:
        return 'lai'
    if 'rút sec' in desc_lower or 'rut sec' in desc_lower:
        return 'rut_sec'
    if 'thưởng' in desc_lower or 'thuong' in desc_lower or 'quà' in desc_lower:
        return 'thuong_le'
    if 'thăm hỏi' in desc_lower or 'tham hoi' in desc_lower:
        return 'tham_hoi'
    if 'làm dấu' in desc_lower or 'sms' in desc_lower:
        return 'phi_ql'
    return 'other'


def determine_quarter(d: date) -> str:
    if not d:
        return 'Q1'
    m = d.month
    if m <= 3:
        return 'Q1'
    elif m <= 6:
        return 'Q2'
    elif m <= 9:
        return 'Q3'
    return 'Q4'


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class TransactionOut(BaseModel):
    id: int
    transaction_date: Optional[date] = None
    description: str
    deposit: float
    withdrawal: float
    balance: float
    transaction_type: str
    category: str
    quarter: Optional[str] = None
    year: int
    receipt_no: Optional[str] = None
    notes: Optional[str] = None


class TransactionCreate(BaseModel):
    transaction_date: date
    description: str
    deposit: float = 0
    withdrawal: float = 0
    transaction_type: str = 'bank'
    category: str = 'other'
    receipt_no: Optional[str] = None
    notes: Optional[str] = None


class EventOut(BaseModel):
    id: int
    event_name: str
    event_date: Optional[date] = None
    event_type: str
    year: int
    amount_per_person: float
    total_amount: float
    total_male: int
    total_female: int
    total_members: int
    notes: Optional[str] = None


class EventCreate(BaseModel):
    event_name: str
    event_date: Optional[date] = None
    event_type: str = 'other'
    year: int
    amount_per_person: float = 0
    notes: Optional[str] = None


class MemberOut(BaseModel):
    id: int
    event_id: int
    employee_id: Optional[int] = None
    full_name: str
    gender: Optional[str] = None
    amount: float
    notes: Optional[str] = None


class MemberCreate(BaseModel):
    employee_id: Optional[int] = None
    full_name: str
    gender: Optional[str] = None
    amount: float = 0
    notes: Optional[str] = None


class SummaryOut(BaseModel):
    year: int
    bank_deposit: float
    bank_withdrawal: float
    bank_balance: float
    cash_deposit: float
    cash_withdrawal: float
    cash_balance: float
    total_events: int
    total_event_amount: float
    total_members: int


# ─── Transaction Endpoints ────────────────────────────────────────────────────

@router.get("/transactions", response_model=List[TransactionOut])
async def get_transactions(
    year: int = Query(2025),
    transaction_type: Optional[str] = Query(None),
    quarter: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    q = select(UnionTransaction).where(UnionTransaction.year == year)
    if transaction_type:
        q = q.where(UnionTransaction.transaction_type == transaction_type)
    if quarter:
        q = q.where(UnionTransaction.quarter == quarter)
    q = q.order_by(UnionTransaction.transaction_date, UnionTransaction.id)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [TransactionOut(
        id=r.id, transaction_date=r.transaction_date, description=r.description,
        deposit=float(r.deposit or 0), withdrawal=float(r.withdrawal or 0),
        balance=float(r.balance or 0), transaction_type=r.transaction_type,
        category=r.category or 'other', quarter=r.quarter, year=r.year,
        receipt_no=r.receipt_no, notes=r.notes,
    ) for r in rows]


@router.post("/transactions", response_model=TransactionOut)
async def create_transaction(
    req: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    t = UnionTransaction(
        transaction_date=req.transaction_date,
        description=req.description,
        deposit=req.deposit,
        withdrawal=req.withdrawal,
        balance=0,
        transaction_type=req.transaction_type,
        category=req.category,
        quarter=determine_quarter(req.transaction_date),
        year=req.transaction_date.year,
        receipt_no=req.receipt_no,
        notes=req.notes,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    # Recalculate balances
    await recalc_balances(db, t.year, t.transaction_type)
    await db.refresh(t)
    return TransactionOut(
        id=t.id, transaction_date=t.transaction_date, description=t.description,
        deposit=float(t.deposit or 0), withdrawal=float(t.withdrawal or 0),
        balance=float(t.balance or 0), transaction_type=t.transaction_type,
        category=t.category or 'other', quarter=t.quarter, year=t.year,
        receipt_no=t.receipt_no, notes=t.notes,
    )


@router.put("/transactions/{tid}")
async def update_transaction(
    tid: int,
    req: TransactionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    t = await db.get(UnionTransaction, tid)
    if not t:
        raise HTTPException(404, "Giao dich khong ton tai")
    t.transaction_date = req.transaction_date
    t.description = req.description
    t.deposit = req.deposit
    t.withdrawal = req.withdrawal
    t.transaction_type = req.transaction_type
    t.category = req.category
    t.quarter = determine_quarter(req.transaction_date)
    t.year = req.transaction_date.year
    t.receipt_no = req.receipt_no
    t.notes = req.notes
    await db.commit()
    await recalc_balances(db, t.year, t.transaction_type)
    return {"message": "Da cap nhat giao dich"}


@router.delete("/transactions/{tid}")
async def delete_transaction(
    tid: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    t = await db.get(UnionTransaction, tid)
    if not t:
        raise HTTPException(404, "Giao dich khong ton tai")
    year, ttype = t.year, t.transaction_type
    await db.delete(t)
    await db.commit()
    await recalc_balances(db, year, ttype)
    return {"message": "Da xoa giao dich"}


async def recalc_balances(db: AsyncSession, year: int, transaction_type: str):
    """Recalculate running balance for all transactions of a given year and type"""
    result = await db.execute(
        select(UnionTransaction)
        .where(and_(UnionTransaction.year == year, UnionTransaction.transaction_type == transaction_type))
        .order_by(UnionTransaction.transaction_date, UnionTransaction.id)
    )
    rows = result.scalars().all()
    balance = 0.0
    for r in rows:
        balance += float(r.deposit or 0) - float(r.withdrawal or 0)
        r.balance = balance
    await db.commit()


# ─── Summary ──────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=SummaryOut)
async def get_summary(
    year: int = Query(2025),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    # Bank totals
    bank_q = await db.execute(
        select(
            func.coalesce(func.sum(UnionTransaction.deposit), 0),
            func.coalesce(func.sum(UnionTransaction.withdrawal), 0),
        ).where(and_(UnionTransaction.year == year, UnionTransaction.transaction_type == 'bank'))
    )
    bank_row = bank_q.one()
    bank_dep, bank_wd = float(bank_row[0]), float(bank_row[1])

    # Cash totals
    cash_q = await db.execute(
        select(
            func.coalesce(func.sum(UnionTransaction.deposit), 0),
            func.coalesce(func.sum(UnionTransaction.withdrawal), 0),
        ).where(and_(UnionTransaction.year == year, UnionTransaction.transaction_type == 'cash'))
    )
    cash_row = cash_q.one()
    cash_dep, cash_wd = float(cash_row[0]), float(cash_row[1])

    # Events
    ev_q = await db.execute(
        select(
            func.count(UnionEvent.id),
            func.coalesce(func.sum(UnionEvent.total_amount), 0),
            func.coalesce(func.sum(UnionEvent.total_members), 0),
        ).where(UnionEvent.year == year)
    )
    ev_row = ev_q.one()

    # Get last balance for bank
    last_bank = await db.execute(
        select(UnionTransaction.balance)
        .where(and_(UnionTransaction.year == year, UnionTransaction.transaction_type == 'bank'))
        .order_by(UnionTransaction.transaction_date.desc(), UnionTransaction.id.desc())
        .limit(1)
    )
    bank_balance = float(last_bank.scalar() or 0)

    last_cash = await db.execute(
        select(UnionTransaction.balance)
        .where(and_(UnionTransaction.year == year, UnionTransaction.transaction_type == 'cash'))
        .order_by(UnionTransaction.transaction_date.desc(), UnionTransaction.id.desc())
        .limit(1)
    )
    cash_balance = float(last_cash.scalar() or 0)

    return SummaryOut(
        year=year,
        bank_deposit=bank_dep, bank_withdrawal=bank_wd, bank_balance=bank_balance,
        cash_deposit=cash_dep, cash_withdrawal=cash_wd, cash_balance=cash_balance,
        total_events=int(ev_row[0]), total_event_amount=float(ev_row[1]),
        total_members=int(ev_row[2]),
    )


# ─── Event Endpoints ──────────────────────────────────────────────────────────

@router.get("/events", response_model=List[EventOut])
async def get_events(
    year: int = Query(2025),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    result = await db.execute(
        select(UnionEvent).where(UnionEvent.year == year).order_by(UnionEvent.event_date)
    )
    rows = result.scalars().all()
    return [EventOut(
        id=r.id, event_name=r.event_name, event_date=r.event_date,
        event_type=r.event_type or 'other', year=r.year,
        amount_per_person=float(r.amount_per_person or 0),
        total_amount=float(r.total_amount or 0),
        total_male=r.total_male or 0, total_female=r.total_female or 0,
        total_members=r.total_members or 0, notes=r.notes,
    ) for r in rows]


@router.post("/events", response_model=EventOut)
async def create_event(
    req: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    ev = UnionEvent(
        event_name=req.event_name, event_date=req.event_date,
        event_type=req.event_type, year=req.year,
        amount_per_person=req.amount_per_person, notes=req.notes,
    )
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return EventOut(
        id=ev.id, event_name=ev.event_name, event_date=ev.event_date,
        event_type=ev.event_type or 'other', year=ev.year,
        amount_per_person=float(ev.amount_per_person or 0),
        total_amount=float(ev.total_amount or 0),
        total_male=ev.total_male or 0, total_female=ev.total_female or 0,
        total_members=ev.total_members or 0, notes=ev.notes,
    )


@router.put("/events/{eid}")
async def update_event(
    eid: int,
    req: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    ev = await db.get(UnionEvent, eid)
    if not ev:
        raise HTTPException(404, "Su kien khong ton tai")
    ev.event_name = req.event_name
    ev.event_date = req.event_date
    ev.event_type = req.event_type
    ev.year = req.year
    ev.amount_per_person = req.amount_per_person
    ev.notes = req.notes
    await db.commit()
    return {"message": "Da cap nhat su kien"}


@router.delete("/events/{eid}")
async def delete_event(
    eid: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    ev = await db.get(UnionEvent, eid)
    if not ev:
        raise HTTPException(404, "Su kien khong ton tai")
    # Delete members first
    await db.execute(delete(UnionEventMember).where(UnionEventMember.event_id == eid))
    await db.delete(ev)
    await db.commit()
    return {"message": "Da xoa su kien"}


# ─── Event Members ────────────────────────────────────────────────────────────

@router.get("/events/{eid}/members", response_model=List[MemberOut])
async def get_event_members(
    eid: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    result = await db.execute(
        select(UnionEventMember).where(UnionEventMember.event_id == eid).order_by(UnionEventMember.id)
    )
    rows = result.scalars().all()
    return [MemberOut(
        id=r.id, event_id=r.event_id, employee_id=r.employee_id,
        full_name=r.full_name, gender=r.gender,
        amount=float(r.amount or 0), notes=r.notes,
    ) for r in rows]


@router.post("/events/{eid}/members")
async def add_event_member(
    eid: int,
    req: MemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    ev = await db.get(UnionEvent, eid)
    if not ev:
        raise HTTPException(404, "Su kien khong ton tai")
    m = UnionEventMember(
        event_id=eid, employee_id=req.employee_id,
        full_name=req.full_name, gender=req.gender,
        amount=req.amount, notes=req.notes,
    )
    db.add(m)
    # Update event totals
    ev.total_members = (ev.total_members or 0) + 1
    ev.total_amount = float(ev.total_amount or 0) + req.amount
    if req.gender == 'male':
        ev.total_male = (ev.total_male or 0) + 1
    elif req.gender == 'female':
        ev.total_female = (ev.total_female or 0) + 1
    await db.commit()
    return {"message": "Da them doan vien"}


@router.delete("/events/{eid}/members/{mid}")
async def remove_event_member(
    eid: int, mid: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    m = await db.get(UnionEventMember, mid)
    if not m or m.event_id != eid:
        raise HTTPException(404, "Khong tim thay")
    ev = await db.get(UnionEvent, eid)
    if ev:
        ev.total_members = max(0, (ev.total_members or 0) - 1)
        ev.total_amount = max(0, float(ev.total_amount or 0) - float(m.amount or 0))
        if m.gender == 'male':
            ev.total_male = max(0, (ev.total_male or 0) - 1)
        elif m.gender == 'female':
            ev.total_female = max(0, (ev.total_female or 0) - 1)
    await db.delete(m)
    await db.commit()
    return {"message": "Da xoa doan vien"}


# ─── Import Excel ─────────────────────────────────────────────────────────────

EVENT_SHEET_MAP = {
    'TET 1 1': {'name': 'Tết Dương lịch 01/01/2025', 'type': 'tet_duong', 'year': 2025},
    'TET am': {'name': 'Tất niên 2024', 'type': 'tat_nien', 'year': 2025},
    '8 3': {'name': 'Quốc tế Phụ nữ 08/03/2025', 'type': 'quocte_phunu', 'year': 2025},
    '10 03 al': {'name': 'Giỗ Tổ Hùng Vương 10/03 AL', 'type': 'gio_to', 'year': 2025},
    '30 04': {'name': 'Lễ 30/04 & 01/05/2025', 'type': 'le_304_105', 'year': 2026},
    '10-3 va 30-4-1-5': {'name': 'Giỗ Tổ Hùng Vương & 30/4-1/5', 'type': 'le_304_105', 'year': 2026},
    '02.09 (2)': {'name': 'Quốc khánh 02/09/2025', 'type': 'quoc_khanh', 'year': 2025},
    'TRUNG THU 25 (2)': {'name': 'Tết Trung thu 2025', 'type': 'trung_thu', 'year': 2025},
    '20 10': {'name': 'Phụ nữ Việt Nam 20/10/2025', 'type': 'phunu_vn', 'year': 2025},
    'NGAY NAM 19 11': {'name': 'Quốc tế Nam giới 19/11/2025', 'type': 'ngay_nam', 'year': 2025},
    'TET 1-1': {'name': 'Tết Dương lịch 01/01/2026', 'type': 'tet_duong', 'year': 2026},
    '19-11 nam giới (2)': {'name': 'Quốc tế Nam giới 19/11/2024', 'type': 'ngay_nam', 'year': 2024},
}


@router.post("/import")
async def import_union_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Import toàn bộ dữ liệu công đoàn từ file .xls"""
    content = await file.read()
    try:
        wb = xlrd.open_workbook(file_contents=content)
    except Exception:
        raise HTTPException(400, "File khong hop le. Vui long upload file Excel (.xls)")

    # Load employees for name matching
    emp_result = await db.execute(select(Employee).where(Employee.is_active == True))
    employees = emp_result.scalars().all()
    emp_name_map = {}
    for e in employees:
        emp_name_map[normalize_name(e.full_name)] = e.id

    stats = {"bank_transactions": 0, "cash_transactions": 0, "events": 0, "members": 0}

    # ─── Import NGAN HANG 2025 ─────────────────────────────────────────────────
    if 'NGAN HANG 2025' in wb.sheet_names():
        ws = wb.sheet_by_name('NGAN HANG 2025')
        # Clear old bank data
        await db.execute(delete(UnionTransaction).where(
            and_(UnionTransaction.transaction_type == 'bank', UnionTransaction.year == 2025)
        ))

        # Row 5 = Số dư đầu kỳ
        opening_balance = float(ws.cell_value(5, 3) or 0)
        current_quarter = 'Q1'

        # Add opening balance as first transaction
        t0 = UnionTransaction(
            transaction_date=date(2025, 1, 1),
            description="Số dư đầu kỳ",
            deposit=opening_balance, withdrawal=0, balance=opening_balance,
            transaction_type='bank', category='other',
            quarter='Q1', year=2025,
        )
        db.add(t0)
        stats["bank_transactions"] += 1

        for r in range(7, ws.nrows):
            desc = str(ws.cell_value(r, 2) or '').strip()
            if not desc:
                continue

            # Detect quarter headers
            desc_upper = desc.upper()
            if desc_upper.startswith('QU') or desc_upper.startswith('QÚY') or desc_upper.startswith('QUÝ'):
                if 'I' in desc_upper and 'II' not in desc_upper and 'III' not in desc_upper and 'IV' not in desc_upper:
                    current_quarter = 'Q1'
                elif 'IV' in desc_upper:
                    current_quarter = 'Q4'
                elif 'III' in desc_upper:
                    current_quarter = 'Q3'
                elif 'II' in desc_upper:
                    current_quarter = 'Q2'
                continue

            # Skip summary/footer rows
            if 'Kế toán' in desc or 'TM.BAN' in desc or 'ký tên' in desc:
                continue

            t_date = xldate_to_date(ws.cell_value(r, 1), wb.datemode)
            deposit = float(ws.cell_value(r, 3) or 0)
            withdrawal = float(ws.cell_value(r, 4) or 0)
            balance = float(ws.cell_value(r, 5) or 0)

            if deposit == 0 and withdrawal == 0:
                continue

            txn = UnionTransaction(
                transaction_date=t_date or date(2025, 1, 1),
                description=desc,
                deposit=deposit, withdrawal=withdrawal, balance=balance,
                transaction_type='bank',
                category=categorize_description(desc),
                quarter=current_quarter, year=2025,
            )
            db.add(txn)
            stats["bank_transactions"] += 1

    # ─── Import TIEN MAT 2025 ─────────────────────────────────────────────────
    if 'TIEN MAT 2025' in wb.sheet_names():
        ws = wb.sheet_by_name('TIEN MAT 2025')
        await db.execute(delete(UnionTransaction).where(
            and_(UnionTransaction.transaction_type == 'cash', UnionTransaction.year == 2025)
        ))

        current_quarter = 'Q1'
        for r in range(4, ws.nrows):
            desc = str(ws.cell_value(r, 3) or '').strip()
            if not desc:
                continue

            desc_upper = desc.upper()
            if desc_upper.startswith('QU') or desc_upper.startswith('QÚY') or desc_upper.startswith('QUÝ'):
                if 'I' in desc_upper and 'II' not in desc_upper and 'III' not in desc_upper and 'IV' not in desc_upper:
                    current_quarter = 'Q1'
                elif 'IV' in desc_upper:
                    current_quarter = 'Q4'
                elif 'III' in desc_upper:
                    current_quarter = 'Q3'
                elif 'II' in desc_upper:
                    current_quarter = 'Q2'
                continue

            if 'Số dư đầu kỳ' in desc or 'TM.BAN' in desc or 'ký tên' in desc:
                continue

            t_date = xldate_to_date(ws.cell_value(r, 0), wb.datemode)
            deposit = float(ws.cell_value(r, 4) or 0)
            withdrawal = float(ws.cell_value(r, 5) or 0)
            balance = float(ws.cell_value(r, 6) or 0)
            receipt_pt = str(ws.cell_value(r, 1) or '').strip()
            receipt_pc = str(ws.cell_value(r, 2) or '').strip()
            receipt_no = receipt_pt or receipt_pc or None

            if deposit == 0 and withdrawal == 0:
                continue

            txn = UnionTransaction(
                transaction_date=t_date or date(2025, 1, 1),
                description=desc,
                deposit=deposit, withdrawal=withdrawal, balance=balance,
                transaction_type='cash',
                category=categorize_description(desc),
                quarter=current_quarter, year=2025,
                receipt_no=receipt_no,
            )
            db.add(txn)
            stats["cash_transactions"] += 1

    # ─── Import Event sheets ──────────────────────────────────────────────────
    sheet_name_lookup = {s.strip(): s for s in wb.sheet_names()}
    for sheet_name, meta in EVENT_SHEET_MAP.items():
        actual_name = sheet_name_lookup.get(sheet_name.strip())
        if not actual_name:
            continue
        ws = wb.sheet_by_name(actual_name)

        # Clear old event data for this event
        old_events = await db.execute(
            select(UnionEvent).where(and_(
                UnionEvent.event_name == meta['name'],
                UnionEvent.year == meta['year']
            ))
        )
        for old_ev in old_events.scalars().all():
            await db.execute(delete(UnionEventMember).where(UnionEventMember.event_id == old_ev.id))
            await db.delete(old_ev)

        # Parse event date from sheet header row 2
        event_date_val = str(ws.cell_value(2, 1) if ws.ncols > 1 else '').strip()

        # Create event
        ev = UnionEvent(
            event_name=meta['name'],
            event_type=meta['type'],
            year=meta['year'],
        )
        db.add(ev)
        await db.flush()

        total_amount = 0.0
        total_male = 0
        total_female = 0
        total_members = 0
        first_amount = 0.0

        # Row 3 = header, rows 4+ = data
        for r in range(4, ws.nrows):
            name = str(ws.cell_value(r, 1) or '').strip()
            if not name or name.upper().startswith('TỔNG CỘNG') or name.upper().startswith('TONG CONG'):
                break

            is_male = bool(ws.cell_value(r, 2))
            is_female = bool(ws.cell_value(r, 3))
            amount = float(ws.cell_value(r, 4) or 0)
            notes = str(ws.cell_value(r, 5) or '').strip() or None

            gender = 'male' if is_male else ('female' if is_female else None)

            # Try to match employee
            matched_emp_id = emp_name_map.get(normalize_name(name))

            m = UnionEventMember(
                event_id=ev.id,
                employee_id=matched_emp_id,
                full_name=name,
                gender=gender,
                amount=amount,
                notes=notes,
            )
            db.add(m)

            total_amount += amount
            if gender == 'male':
                total_male += 1
            elif gender == 'female':
                total_female += 1
            total_members += 1
            if first_amount == 0:
                first_amount = amount

        ev.total_amount = total_amount
        ev.total_male = total_male
        ev.total_female = total_female
        ev.total_members = total_members
        ev.amount_per_person = first_amount
        stats["events"] += 1
        stats["members"] += total_members

    await db.commit()
    return {
        "message": f"Import thanh cong: {stats['bank_transactions']} giao dich NH, "
                   f"{stats['cash_transactions']} giao dich TM, "
                   f"{stats['events']} su kien, {stats['members']} doan vien",
        **stats,
    }


# ─── Union Members (Danh sách đoàn viên) ─────────────────────────────────────

POSITION_LABELS = {
    'doan_vien': 'Đoàn viên',
    'uy_vien_bch': 'Ủy viên BCH',
    'chu_tich': 'Chủ tịch CĐ',
    'pho_chu_tich': 'Phó chủ tịch CĐ',
    'thu_quy': 'Thủ quỹ',
}


class UnionMemberOut(BaseModel):
    id: int
    employee_id: Optional[int] = None
    full_name: str
    gender: Optional[str] = None
    position: str = 'doan_vien'
    bch_monthly_salary: float = 0
    join_date: Optional[date] = None
    is_active: bool = True
    notes: Optional[str] = None


class UnionMemberCreate(BaseModel):
    employee_id: Optional[int] = None
    full_name: str
    gender: Optional[str] = None
    position: str = 'doan_vien'
    bch_monthly_salary: float = 0
    join_date: Optional[date] = None
    notes: Optional[str] = None


@router.get("/members", response_model=List[UnionMemberOut])
async def get_union_members(
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    q = select(UnionMember)
    if is_active is not None:
        q = q.where(UnionMember.is_active == is_active)
    q = q.order_by(UnionMember.position, UnionMember.full_name)
    result = await db.execute(q)
    rows = result.scalars().all()
    return [UnionMemberOut(
        id=r.id, employee_id=r.employee_id, full_name=r.full_name,
        gender=r.gender, position=r.position or 'doan_vien',
        bch_monthly_salary=float(r.bch_monthly_salary or 0),
        join_date=r.join_date, is_active=bool(r.is_active), notes=r.notes,
    ) for r in rows]


@router.post("/members", response_model=UnionMemberOut)
async def create_union_member(
    req: UnionMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    m = UnionMember(
        employee_id=req.employee_id, full_name=req.full_name,
        gender=req.gender, position=req.position,
        bch_monthly_salary=req.bch_monthly_salary,
        join_date=req.join_date, is_active=True, notes=req.notes,
    )
    db.add(m)
    await db.commit()
    await db.refresh(m)
    return UnionMemberOut(
        id=m.id, employee_id=m.employee_id, full_name=m.full_name,
        gender=m.gender, position=m.position or 'doan_vien',
        bch_monthly_salary=float(m.bch_monthly_salary or 0),
        join_date=m.join_date, is_active=bool(m.is_active), notes=m.notes,
    )


@router.put("/members/{mid}")
async def update_union_member(
    mid: int,
    req: UnionMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    m = await db.get(UnionMember, mid)
    if not m:
        raise HTTPException(404, "Khong tim thay doan vien")
    m.employee_id = req.employee_id
    m.full_name = req.full_name
    m.gender = req.gender
    m.position = req.position
    m.bch_monthly_salary = req.bch_monthly_salary
    m.join_date = req.join_date
    m.notes = req.notes
    m.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "Da cap nhat"}


@router.patch("/members/{mid}/toggle-active")
async def toggle_member_active(
    mid: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    m = await db.get(UnionMember, mid)
    if not m:
        raise HTTPException(404, "Khong tim thay doan vien")
    m.is_active = not m.is_active
    m.updated_at = datetime.utcnow()
    await db.commit()
    return {"is_active": m.is_active}


@router.delete("/members/{mid}")
async def delete_union_member(
    mid: int,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    m = await db.get(UnionMember, mid)
    if not m:
        raise HTTPException(404, "Khong tim thay doan vien")
    await db.delete(m)
    await db.commit()
    return {"message": "Da xoa"}


@router.post("/events/{eid}/members/bulk-from-list")
async def bulk_add_from_member_list(
    eid: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Thêm hàng loạt đoàn viên vào sự kiện từ danh sách đoàn viên chính thức"""
    ev = await db.get(UnionEvent, eid)
    if not ev:
        raise HTTPException(404, "Su kien khong ton tai")
    amount_per_person = float(body.get("amount_per_person", 0))
    gender_filter = body.get("gender")  # None | male | female
    # Clear existing members
    await db.execute(delete(UnionEventMember).where(UnionEventMember.event_id == eid))
    # Get active members
    q = select(UnionMember).where(UnionMember.is_active == True)
    if gender_filter:
        q = q.where(UnionMember.gender == gender_filter)
    result = await db.execute(q)
    members = result.scalars().all()
    total_amount = 0.0
    total_male = 0
    total_female = 0
    for mem in members:
        m = UnionEventMember(
            event_id=eid, employee_id=mem.employee_id,
            full_name=mem.full_name, gender=mem.gender,
            amount=amount_per_person,
        )
        db.add(m)
        total_amount += amount_per_person
        if mem.gender == 'male':
            total_male += 1
        elif mem.gender == 'female':
            total_female += 1
    ev.total_members = len(members)
    ev.total_amount = total_amount
    ev.total_male = total_male
    ev.total_female = total_female
    ev.amount_per_person = amount_per_person
    await db.commit()
    return {"message": f"Da them {len(members)} doan vien", "count": len(members)}
