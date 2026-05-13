import asyncio
import sys
import os
from datetime import date

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.models.employee import Employee
from app.models.attendance import AttendanceDaily
from sqlalchemy import select

async def check_att_for_codes():
    async with AsyncSessionLocal() as db:
        for code in ["16", "18"]:
            res_e = await db.execute(select(Employee).where(Employee.employee_code == code))
            e = res_e.scalar_one_or_none()
            if not e:
                print(f"Code {code} NOT FOUND in employees")
                continue
            
            res_a = await db.execute(select(AttendanceDaily).where(AttendanceDaily.employee_id == e.id))
            records = res_a.scalars().all()
            print(f"Code {code} (ID {e.id}): {len(records)} daily records found")

if __name__ == "__main__":
    asyncio.run(check_att_for_codes())
