import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.models.shift import ShiftTemplate
from sqlalchemy import select

async def check_shifts():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ShiftTemplate))
        shifts = result.scalars().all()
        for s in shifts:
            print(f"Code: {s.code}, Start: {s.start_time}, End: {s.end_time}")

if __name__ == "__main__":
    asyncio.run(check_shifts())
