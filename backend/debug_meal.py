import asyncio
import sys
import io
from datetime import datetime, date
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, '.')
from app.database import AsyncSessionLocal
from sqlalchemy import text
from app.routers.attendance import evaluate_attendance, DRIVER_AUTO_OT_SHIFT_CODES, is_nu_dynamic_shift_code
from app.models.shift import ShiftTemplate
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        # Get TX2 shift object
        r = await db.execute(select(ShiftTemplate).where(ShiftTemplate.code == 'TX2'))
        shift = r.scalars().first()
        print(f"TX2: meal_allowance={shift.meal_allowance}, meal_count={shift.meal_count}, start={shift.start_time}, end={shift.end_time}")
        print(f"TX2 in DRIVER_AUTO_OT_SHIFT_CODES: {shift.code.upper() in DRIVER_AUTO_OT_SHIFT_CODES}")
        print(f"is_nu_dynamic: {is_nu_dynamic_shift_code(shift.code)}")

        check_in = datetime(2026, 5, 10, 14, 23, 57)
        check_out = datetime(2026, 5, 10, 18, 25, 38)
        work_date = date(2026, 5, 10)

        print(f"\nEvaluating: check_in={check_in}, check_out={check_out}, is_sunday=True")
        result = evaluate_attendance(shift, check_in, check_out, work_date, is_sunday=True, is_holiday=False, night_allowance_rate=100000)
        print(f"Result: status={result['status']}, meal_allowance={result['meal_allowance']}, meal_count={result['meal_count']}, ot_hours={result['ot_hours']}")

asyncio.run(main())
