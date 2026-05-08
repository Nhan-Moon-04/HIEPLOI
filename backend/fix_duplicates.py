import asyncio
from sqlalchemy import select, delete, update
from app.database import engine
from app.models.employee import Employee
from app.models.salary import MonthlySalary
from app.models.attendance import AttendanceDaily
from app.models.schedule import WorkSchedule
from datetime import date

async def run():
    async with engine.begin() as conn:
        target_date = date(2026, 5, 1)
        
        # 1. Tìm các bản ghi "giả"
        res = await conn.execute(
            select(Employee.id, Employee.employee_code)
            .where(Employee.join_date == target_date)
            .where(Employee.department == None)
        )
        fake_emps = res.fetchall()
        print(f"Found {len(fake_emps)} fake records.")
        
        for f_id, code in fake_emps:
            res_orig = await conn.execute(
                select(Employee.id)
                .where(Employee.employee_code == code)
                .where(Employee.id != f_id)
                .order_by(Employee.id)
            )
            orig_ids = [r[0] for r in res_orig.fetchall()]
            
            if orig_ids:
                orig_id = orig_ids[0]
                print(f"Code {code}: Merging Fake {f_id} -> Original {orig_id}")
                
                # Xử lý MonthlySalary (Xóa trùng ở Fake trước khi update)
                # Lấy danh sách tháng đã có ở Original
                res_months = await conn.execute(select(MonthlySalary.month_key).where(MonthlySalary.employee_id == orig_id))
                existing_months = [r[0] for r in res_months.fetchall()]
                if existing_months:
                    await conn.execute(delete(MonthlySalary).where(MonthlySalary.employee_id == f_id).where(MonthlySalary.month_key.in_(existing_months)))
                await conn.execute(update(MonthlySalary).where(MonthlySalary.employee_id == f_id).values(employee_id=orig_id))
                
                # Xử lý AttendanceDaily (Xóa trùng ở Fake trước khi update)
                res_dates = await conn.execute(select(AttendanceDaily.work_date).where(AttendanceDaily.employee_id == orig_id))
                existing_dates = [r[0] for r in res_dates.fetchall()]
                if existing_dates:
                    await conn.execute(delete(AttendanceDaily).where(AttendanceDaily.employee_id == f_id).where(AttendanceDaily.work_date.in_(existing_dates)))
                await conn.execute(update(AttendanceDaily).where(AttendanceDaily.employee_id == f_id).values(employee_id=orig_id))

                # Xử lý WorkSchedule (Xóa trùng ở Fake trước khi update)
                res_sch = await conn.execute(select(WorkSchedule.work_date).where(WorkSchedule.employee_id == orig_id))
                existing_sch_dates = [r[0] for r in res_sch.fetchall()]
                if existing_sch_dates:
                    await conn.execute(delete(WorkSchedule).where(WorkSchedule.employee_id == f_id).where(WorkSchedule.work_date.in_(existing_sch_dates)))
                await conn.execute(update(WorkSchedule).where(WorkSchedule.employee_id == f_id).values(employee_id=orig_id))
                
                # Xóa bản ghi giả
                await conn.execute(delete(Employee).where(Employee.id == f_id))
                
                # Kích hoạt lại bản ghi gốc
                await conn.execute(update(Employee).where(Employee.id == orig_id).values(is_active=True, leave_date=None))
            else:
                # Không có bản ghi gốc, giữ lại nhưng xóa dấu nháy nếu còn
                pass
                
    print("Done cleaning.")

if __name__ == "__main__":
    asyncio.run(run())
