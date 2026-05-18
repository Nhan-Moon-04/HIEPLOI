import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text

async def main():
    async with AsyncSessionLocal() as db:
        emp_id = 164
        
        # Check X overtime config for day 10
        r = await db.execute(text(f"""
            SELECT * FROM x_overtime_configs 
            WHERE employee_id = {emp_id} AND work_date = '2026-05-10'
        """))
        xot_rows = r.fetchall()
        print("XOT configs for day 10:")
        for row in xot_rows:
            print(dict(row._mapping))
        
        # Check schedule override for all days 
        r2 = await db.execute(text(f"""
            SELECT ws.work_date, s.code as shift_code, s.meal_count, s.meal_allowance
            FROM work_schedules ws 
            JOIN shift_templates s ON ws.shift_id = s.id
            WHERE ws.employee_id = {emp_id} 
            AND ws.work_date >= '2026-05-01' AND ws.work_date <= '2026-05-31'
            ORDER BY ws.work_date
        """))
        print("\nSchedule overrides for May:")
        for row in r2.fetchall():
            print(dict(row._mapping))
        
        # Check attendance for all May
        r3 = await db.execute(text(f"""
            SELECT work_date, first_check_in, last_check_out, total_hours
            FROM attendance_daily 
            WHERE employee_id = {emp_id} 
            AND work_date >= '2026-05-01' AND work_date <= '2026-05-15'
            ORDER BY work_date
        """))
        print("\nAttendance May 1-15:")
        for row in r3.fetchall():
            d = dict(row._mapping)
            ci = d['first_check_in']
            co = d['last_check_out']
            print(f"  {d['work_date']}: in={ci}, out={co}, hours={d['total_hours']}")

asyncio.run(main())
