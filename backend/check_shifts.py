import asyncio
import sys
sys.path.insert(0, '.')
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.shift import ShiftTemplate

async def get_shifts():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(ShiftTemplate.code))
        print("Shifts in DB:", res.scalars().all())

asyncio.run(get_shifts())
