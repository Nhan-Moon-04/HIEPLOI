import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.models.employee import Employee
from app.models.attendance import AttendanceDaily
from sqlalchemy import select

async def check_att_dates():
    async with AsyncSessionLocal() as db:
        res_e = await db.execute(select(Employee).where(Employee.employee_code == "18"))
        e = res_e.scalar_one_or_none()
        if e:
            res_a = await db.execute(select(AttendanceDaily).where(AttendanceDaily.employee_id == e.id).order_by(AttendanceDaily.work_date.desc()))
            records = res_a.scalars().all()
            print(f"Code 18 (ID {e.id}) has {len(records)} records.")
            for r in records[:10]:
                print(f"Date: {r.work_date}, In: {r.first_check_in}, Out: {r.last_check_out}")

if __name__ == "__main__":
    asyncio.run(check_att_dates())
