import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.models.employee import Employee
from sqlalchemy import select

async def check_code(code):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Employee).where(Employee.employee_code == code))
        e = result.scalar_one_or_none()
        if e:
            print(f"Code: {e.employee_code}, Name: {e.full_name}, ID: {e.id}")
        else:
            print(f"Code: {code} NOT FOUND")

if __name__ == "__main__":
    asyncio.run(check_code("50"))
