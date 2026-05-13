import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.models.employee import Employee
from sqlalchemy import select

async def check_quotes():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Employee).where(Employee.employee_code.like("'%")))
        employees = result.scalars().all()
        print(f"Employees with leading quotes in code: {len(employees)}")
        for e in employees:
            print(f"Code: {e.employee_code}")

if __name__ == "__main__":
    asyncio.run(check_quotes())
