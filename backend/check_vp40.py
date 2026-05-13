import asyncio
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.models.shift import ShiftTemplate
from sqlalchemy import select

async def check_vp40():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ShiftTemplate).where(ShiftTemplate.code == "VP40"))
        s = result.scalar_one_or_none()
        if s:
            print(f"Found: {s.code}, ID: {s.id}")
        else:
            print("VP40 NOT FOUND")

if __name__ == "__main__":
    asyncio.run(check_vp40())
