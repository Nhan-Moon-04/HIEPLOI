import asyncio
import sys
import os
from datetime import date

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.models.attendance import AttendanceDaily, AttendanceLog
from sqlalchemy import select

async def check_attendance():
    async with AsyncSessionLocal() as db:
        # Check for May 2026
        result = await db.execute(select(AttendanceDaily).where(AttendanceDaily.work_date >= date(2026, 5, 1)))
        records = result.scalars().all()
        print(f"Total attendance records for May+: {len(records)}")
        for r in records[:10]:
            print(f"ID: {r.id}, EmpID: {r.employee_id}, Date: {r.work_date}, In: {r.first_check_in}, Out: {r.last_check_out}")

        # Check logs
        log_result = await db.execute(select(AttendanceLog).limit(5))
        logs = log_result.scalars().all()
        print(f"Sample logs: {len(logs)}")
        for l in logs:
            print(f"Log: {l.employee_code}, {l.employee_name}, {l.event_time}")

if __name__ == "__main__":
    asyncio.run(check_attendance())
