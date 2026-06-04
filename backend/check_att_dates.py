import asyncio
import sys
import os
from datetime import date, timedelta

sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import AsyncSessionLocal
from app.models.employee import Employee
from app.models.attendance import AttendanceDaily, AttendanceLog
from sqlalchemy import select, and_

SUNDAYS_MAY = [date(2026, 5, 3), date(2026, 5, 10), date(2026, 5, 17), date(2026, 5, 24), date(2026, 5, 31)]

async def check():
    async with AsyncSessionLocal() as db:
        print("=== KIỂM TRA CHỦ NHẬT THÁNG 5/2026 ===\n")

        # Check a few key employees
        for code in ["8", "3", "31", "35", "39"]:
            res_e = await db.execute(select(Employee).where(Employee.employee_code == code))
            e = res_e.scalar_one_or_none()
            if not e:
                continue

            print(f"\n[{e.employee_code}] {e.full_name} ({e.default_shift_code})")

            # Check AttendanceDaily for each Sunday
            print("  AttendanceDaily (Sundays):")
            for sun in SUNDAYS_MAY:
                res_a = await db.execute(
                    select(AttendanceDaily).where(
                        and_(AttendanceDaily.employee_id == e.id,
                             AttendanceDaily.work_date == sun)
                    )
                )
                att = res_a.scalar_one_or_none()
                if att:
                    ci = att.first_check_in.strftime('%H:%M') if att.first_check_in else "❌None"
                    co = att.last_check_out.strftime('%H:%M') if att.last_check_out else "❌None"
                    print(f"    {sun} CN: in={ci}, out={co}, h={att.total_hours}")
                else:
                    print(f"    {sun} CN: ❌ KHÔNG CÓ RECORD")

            # Check raw AttendanceLog for Sunday 24 and 31
            print("  Raw logs (Ngày 24 và 31):")
            for sun in [date(2026, 5, 24), date(2026, 5, 31)]:
                nxt = sun + timedelta(days=1)
                res_l = await db.execute(
                    select(AttendanceLog).where(
                        and_(
                            AttendanceLog.employee_code == e.employee_code,
                            AttendanceLog.event_time >= sun,
                            AttendanceLog.event_time < nxt,
                        )
                    ).order_by(AttendanceLog.event_time)
                )
                logs = res_l.scalars().all()
                if logs:
                    times = [l.event_time.strftime('%H:%M') for l in logs]
                    print(f"    {sun}: {', '.join(times)}")
                else:
                    print(f"    {sun}: ❌ Không có raw log")

if __name__ == "__main__":
    asyncio.run(check())
