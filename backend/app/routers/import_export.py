from typing import Optional
from datetime import datetime, date, time, timedelta
import calendar
import json
import uuid
from io import BytesIO
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, text, delete
from app.database import get_db
from app.models.attendance import AttendanceLog, AttendanceDaily
from app.models.employee import Employee
from app.models.shift import ShiftTemplate
from app.models.schedule import WorkSchedule
from app.models.user import AppUser, UserRole
from app.middleware.auth import require_roles

router = APIRouter(prefix="/import-export", tags=["Import/Export"])

NIGHT_SHIFT_CUTOFF = time(6, 0)  # Gio truoc 6h sang tinh la ca dem hom truoc


@router.post("/attendance")
async def import_attendance(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN, UserRole.ACCOUNTANT)),
):
    """Import file cham cong tu may cham cong.
    Format: C1=Ma NV, C2=Ten, C3=Bo phan, C4=Thoi gian (datetime)
    Bo phan trong file se bo qua, lay theo nhan vien trong DB.
    Se xu ly: loai trung, nhom theo ngay, tinh first_check_in/last_check_out, luu vao attendance_daily.
    Ca dem: scan truoc 6h sang => tinh la ca hom truoc."""
    import openpyxl

    content = await file.read()
    wb = openpyxl.load_workbook(BytesIO(content), data_only=True)
    ws = wb[wb.sheetnames[0]]  # Sheet dau tien

    batch_id = str(uuid.uuid4())[:8]

    # Load employee code -> id mapping
    emp_result = await db.execute(select(Employee))
    emp_map = {}
    for e in emp_result.scalars().all():
        emp_map[str(e.employee_code)] = e

    # Load shifts
    shift_result = await db.execute(select(ShiftTemplate))
    shifts_by_code = {}
    shifts_by_id = {}
    for s in shift_result.scalars().all():
        shifts_by_code[s.code] = s
        shifts_by_id[s.id] = s

    # Parse raw scans: (emp_code, datetime) -> deduplicate
    raw_scans = {}  # emp_code -> set of datetimes
    skipped_employees = set()
    total_rows = 0

    for r in range(2, ws.max_row + 1):
        emp_code_raw = ws.cell(r, 1).value
        if emp_code_raw is None:
            continue

        emp_code = str(int(emp_code_raw) if isinstance(emp_code_raw, float) else emp_code_raw).strip()
        scan_time = ws.cell(r, 4).value
        emp_name = ws.cell(r, 2).value

        if emp_code not in emp_map:
            skipped_employees.add(emp_code)
            continue

        emp = emp_map[emp_code]

        if scan_time is None:
            continue

        if isinstance(scan_time, str):
            try:
                scan_time = datetime.strptime(scan_time, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                try:
                    scan_time = datetime.strptime(scan_time, "%Y-%m-%d %H:%M")
                except ValueError:
                    continue

        if not isinstance(scan_time, datetime):
            continue

        total_rows += 1
        if emp_code not in raw_scans:
            raw_scans[emp_code] = set()
        raw_scans[emp_code].add(scan_time)

        # Also save to AttendanceLog (raw)
        log = AttendanceLog(
            employee_code=emp_code,
            employee_name=str(emp_name or ""),
            department=emp.department,
            event_time=scan_time,
            source_file=file.filename,
            import_batch=batch_id,
        )
        db.add(log)

    # Process: group by employee + work_date
    # For night shifts: if scan is before NIGHT_SHIFT_CUTOFF (6am), it belongs to previous day
    processed = 0
    updated = 0

    # Load schedule data for night shift detection
    schedule_result = await db.execute(select(WorkSchedule))
    schedule_map = {}
    for ws_rec in schedule_result.scalars().all():
        schedule_map[(ws_rec.employee_id, ws_rec.work_date)] = ws_rec.shift_id

    for emp_code, scans in raw_scans.items():
        emp = emp_map[emp_code]
        default_shift = shifts_by_code.get(emp.default_shift_code)

        # Group scans by work_date
        daily_scans = {}  # work_date -> list of datetimes
        for scan_dt in sorted(scans):
            scan_date = scan_dt.date()
            scan_t = scan_dt.time()

            # Night shift: if before 6am, assign to previous day
            work_date = scan_date
            if scan_t < NIGHT_SHIFT_CUTOFF:
                # Check if previous day has a night shift
                prev_date = scan_date - timedelta(days=1)
                prev_shift_id = schedule_map.get((emp.id, prev_date))
                prev_shift = shifts_by_id.get(prev_shift_id) if prev_shift_id else default_shift
                if prev_shift and prev_shift.is_night_shift:
                    work_date = prev_date

            if work_date not in daily_scans:
                daily_scans[work_date] = []
            daily_scans[work_date].append(scan_dt)

        # Save to AttendanceDaily
        for work_date, day_scans in daily_scans.items():
            day_scans.sort()
            first_in = day_scans[0]
            last_out = day_scans[-1] if len(day_scans) > 1 else None
            total_hours = 0.0
            if first_in and last_out and last_out > first_in:
                total_hours = round((last_out - first_in).total_seconds() / 3600.0, 2)

            # Upsert
            existing = await db.execute(
                select(AttendanceDaily).where(
                    and_(AttendanceDaily.employee_id == emp.id, AttendanceDaily.work_date == work_date)
                )
            )
            att = existing.scalar_one_or_none()
            if att:
                att.first_check_in = first_in
                att.last_check_out = last_out
                att.total_hours = total_hours
                att.import_batch = batch_id
                updated += 1
            else:
                att = AttendanceDaily(
                    employee_id=emp.id,
                    work_date=work_date,
                    first_check_in=first_in,
                    last_check_out=last_out,
                    total_hours=total_hours,
                    import_batch=batch_id,
                )
                db.add(att)
                processed += 1

    await db.commit()

    return {
        "message": f"Import thanh cong! {processed} moi, {updated} cap nhat",
        "batch_id": batch_id,
        "total_raw_rows": total_rows,
        "employees_processed": len(raw_scans),
        "days_created": processed,
        "days_updated": updated,
        "skipped_employees": list(skipped_employees)[:10] if skipped_employees else [],
        "filename": file.filename,
    }


@router.get("/backup")
async def backup_database(
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Backup toan bo du lieu cac bang chinh thanh JSON"""
    tables = [
        ("employees", "SELECT * FROM employees"),
        ("shift_templates", "SELECT * FROM shift_templates"),
        ("work_schedules", "SELECT * FROM work_schedules"),
        ("attendance_daily", "SELECT * FROM attendance_daily"),
        ("attendance_logs", "SELECT * FROM attendance_logs"),
        ("company_holidays", "SELECT * FROM company_holidays"),
        ("app_users", "SELECT id, username, role, full_name, is_active FROM app_users"),
    ]

    backup_data = {
        "version": "1.0",
        "created_at": datetime.utcnow().isoformat(),
        "created_by": current_user.username,
        "tables": {},
    }

    for table_name, query in tables:
        try:
            result = await db.execute(text(query))
            rows = result.fetchall()
            columns = result.keys()
            data = []
            for row in rows:
                row_dict = {}
                for i, col in enumerate(columns):
                    val = row[i]
                    if isinstance(val, (datetime, date)):
                        val = val.isoformat()
                    elif hasattr(val, '__str__') and not isinstance(val, (str, int, float, bool, type(None))):
                        val = str(val)
                    row_dict[col] = val
                data.append(row_dict)
            backup_data["tables"][table_name] = data
        except Exception as e:
            backup_data["tables"][table_name] = {"error": str(e)}

    json_bytes = json.dumps(backup_data, ensure_ascii=False, indent=2).encode("utf-8")
    filename = f"hieploi_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"

    return StreamingResponse(
        BytesIO(json_bytes),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/restore")
async def restore_database(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: AppUser = Depends(require_roles(UserRole.ADMIN)),
):
    """Restore du lieu tu file backup JSON. Chi restore employees, shifts, schedules, holidays."""
    content = await file.read()
    try:
        backup = json.loads(content.decode("utf-8"))
    except Exception:
        raise HTTPException(400, "File khong hop le. Phai la JSON backup.")

    if "tables" not in backup:
        raise HTTPException(400, "File backup khong co du lieu tables")

    restored = {}

    # Restore order matters (foreign keys)
    # 1. shift_templates
    if "shift_templates" in backup["tables"]:
        data = backup["tables"]["shift_templates"]
        if isinstance(data, list):
            count = 0
            for row in data:
                existing = await db.execute(
                    select(ShiftTemplate).where(ShiftTemplate.code == row.get("code"))
                )
                if not existing.scalar_one_or_none():
                    shift = ShiftTemplate(
                        code=row["code"],
                        name=row.get("name"),
                        start_time=row.get("start_time"),
                        end_time=row.get("end_time"),
                        standard_hours=row.get("standard_hours"),
                        break_minutes=row.get("break_minutes"),
                        default_overtime_hours=row.get("default_overtime_hours"),
                        meal_allowance=row.get("meal_allowance", 0),
                        meal_count=row.get("meal_count", 0),
                        is_night_shift=row.get("is_night_shift", False),
                        is_leave_code=row.get("is_leave_code", False),
                        is_paid_leave=row.get("is_paid_leave", False),
                    )
                    db.add(shift)
                    count += 1
            restored["shift_templates"] = count

    # 2. company_holidays
    from app.models.holiday import CompanyHoliday
    if "company_holidays" in backup["tables"]:
        data = backup["tables"]["company_holidays"]
        if isinstance(data, list):
            count = 0
            for row in data:
                h_date = date.fromisoformat(row["holiday_date"]) if row.get("holiday_date") else None
                if h_date:
                    existing = await db.execute(
                        select(CompanyHoliday).where(CompanyHoliday.holiday_date == h_date)
                    )
                    if not existing.scalar_one_or_none():
                        h = CompanyHoliday(
                            holiday_date=h_date,
                            name=row.get("name", ""),
                            holiday_type=row.get("holiday_type", "company"),
                            is_active=row.get("is_active", True),
                            notes=row.get("notes"),
                        )
                        db.add(h)
                        count += 1
            restored["company_holidays"] = count

    await db.commit()

    return {
        "message": "Restore thanh cong!",
        "restored": restored,
        "backup_version": backup.get("version"),
        "backup_date": backup.get("created_at"),
    }
