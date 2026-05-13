import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.models.attendance import AttendanceLog
from sqlalchemy import select

async def check_logs():
    async with AsyncSessionLocal() as db:
        for code in ["18"]:
            result = await db.execute(select(AttendanceLog).where(AttendanceLog.employee_code == code).limit(5))
            logs = result.scalars().all()
            if logs:
                for l in logs:
                    print(f"Log: {l.employee_code}, Name: {l.employee_name}, Time: {l.event_time}")
            else:
                print(f"Code: {code} LOGS NOT FOUND")

if __name__ == "__main__":
    asyncio.run(check_logs())
