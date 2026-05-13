import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.models.employee import Employee
from sqlalchemy import select

async def check_specific_employees():
    async with AsyncSessionLocal() as db:
        for code in ["16", "18"]:
            result = await db.execute(select(Employee).where(Employee.employee_code == code))
            e = result.scalar_one_or_none()
            if e:
                # Use encode to avoid print errors in terminal
                print(f"Code: {e.employee_code}, Name: {e.full_name.encode('utf-8')}, Active: {e.is_active}")
            else:
                print(f"Code: {code} NOT FOUND")

if __name__ == "__main__":
    asyncio.run(check_specific_employees())
