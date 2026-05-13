import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.routers.attendance import get_attendance
from datetime import date

async def check_api_filter():
    async with AsyncSessionLocal() as db:
        # Simulate request for 1-15 May
        res = await get_attendance(
            month_key="2026-05",
            start_date="2026-05-01",
            end_date="2026-05-15",
            db=db,
            current_user=type('User', (), {'username': 'admin', 'role': 'admin'})()
        )
        if res.rows:
            row = res.rows[0]
            print(f"Employee {row.employee_code} has {len(row.days)} days in response.")
            print(f"First day: {row.days[0].work_date}")
            print(f"Last day: {row.days[-1].work_date}")

if __name__ == "__main__":
    asyncio.run(check_api_filter())
