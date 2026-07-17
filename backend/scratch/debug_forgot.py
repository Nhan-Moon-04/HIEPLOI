import asyncio
import sys
import os
from datetime import date, datetime, time

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.database import AsyncSessionLocal
from app.models.employee import Employee
from app.models.attendance import AttendanceDaily, AttendanceLog
from sqlalchemy import select, and_, or_, func

async def main():
    async with AsyncSessionLocal() as db:
        from app.models.audit import AuditLog
        res = await db.execute(
            select(AuditLog)
            .where(AuditLog.table_name == "attendance")
            .order_by(AuditLog.created_at.desc())
        )
        print("Audit Logs for attendance table:")
        for a in res.scalars().all():
            print(f"  RecordID: {a.record_id}, Action: {a.action}, User: {a.changed_by}, Notes: {a.notes}, Time: {a.created_at}")




if __name__ == "__main__":
    asyncio.run(main())
