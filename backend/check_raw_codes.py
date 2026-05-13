import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.models.employee import Employee
from sqlalchemy import select

async def check_raw_codes():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Employee))
        employees = result.scalars().all()
        for e in employees:
            print(f"Code: {repr(e.employee_code)}, Name: {repr(e.full_name)}")

if __name__ == "__main__":
    asyncio.run(check_raw_codes())
