import asyncio
import sys
import os
from datetime import date, datetime, time, timedelta
from collections import defaultdict

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.database import AsyncSessionLocal
from app.models.employee import Employee
from app.models.attendance import AttendanceDaily, AttendanceLog
from app.models.schedule import WorkSchedule
from app.models.shift import ShiftTemplate
from sqlalchemy import select, and_, or_
from app.services.nu_shift import is_nu_dynamic_shift_code, build_nu_shift_day_results

async def main():
    async with AsyncSessionLocal() as db:
        # Load employee code='5'
        emp_code = "5"
        res_e = await db.execute(select(Employee).where(Employee.employee_code == emp_code))
        emp = res_e.scalar_one_or_none()
        if not emp:
            print("Employee 5 not found")
            return
            
        print(f"Employee: {emp.full_name} (ID: {emp.id})")
        
        # Load raw scans from AttendanceLog for batch fc644bb3
        res_logs = await db.execute(
            select(AttendanceLog).where(
                and_(
                    AttendanceLog.employee_code == emp_code,
                    AttendanceLog.import_batch == "fc644bb3"
                )
            )
        )
        logs = res_logs.scalars().all()
        print(f"Logs for batch fc644bb3: {len(logs)}")
        for l in logs:
            print(f"  {l.event_time}")
            
        raw_scans = {emp_code: set(l.event_time for l in logs)}
        
        # Now simulate import grouping logic
        shift_result = await db.execute(select(ShiftTemplate))
        shifts_by_code = {s.code: s for s in shift_result.scalars().all()}
        shifts_by_id = {s.id: s for s in shift_result.scalars().all()}
        
        schedule_result = await db.execute(select(WorkSchedule))
        schedule_map = {}
        for ws_rec in schedule_result.scalars().all():
            schedule_map[(ws_rec.employee_id, ws_rec.work_date)] = ws_rec.shift_id
            
        nu_emp_ids = []
        if is_nu_dynamic_shift_code(emp.default_shift_code):
            nu_emp_ids.append(emp.id)
            
        NIGHT_SHIFT_CUTOFF = time(6, 0)
        
        # Grouping scans
        for ec, scans in raw_scans.items():
            daily_data = {}
            if emp.id in nu_emp_ids:
                print("Employee is NU")
            else:
                daily_scans = defaultdict(list)
                for scan_dt in scans:
                    work_date = scan_dt.date()
                    if scan_dt.time() < NIGHT_SHIFT_CUTOFF:
                        prev_date = work_date - timedelta(days=1)
                        sid = schedule_map.get((emp.id, prev_date))
                        shift = shifts_by_id.get(sid) if sid else shifts_by_code.get(emp.default_shift_code)
                        if shift and shift.is_night_shift:
                            work_date = prev_date
                    daily_scans[work_date].append(scan_dt)
                
                print("\nGrouped daily scans:")
                for w_date, d_scans in daily_scans.items():
                    d_scans.sort()
                    daily_data[w_date] = (d_scans[0], d_scans[-1] if len(d_scans) > 1 else None)
                    print(f"  Date: {w_date}, Scans: {d_scans}, daily_data: {daily_data[w_date]}")

if __name__ == "__main__":
    asyncio.run(main())
