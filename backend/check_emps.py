import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.models.employee import Employee
from sqlalchemy import select

async def check_employees():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Employee))
        employees = result.scalars().all()
        print(f"Total employees: {len(employees)}")
        for e in employees[:20]: # Print first 20
            print(f"Code: {e.employee_code}, Name: {e.full_name}, Active: {e.is_active}")

if __name__ == "__main__":
    asyncio.run(check_employees())
