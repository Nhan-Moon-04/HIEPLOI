import asyncio
from sqlalchemy import select, update
from app.database import engine
from app.models.employee import Employee

async def run():
    async with engine.begin() as conn:
        res = await conn.execute(select(Employee.id, Employee.employee_code))
        rows = res.fetchall()
        print(f"Total employees: {len(rows)}")
        for row in rows:
            id_val, code_val = row
            if code_val and code_val.startswith("'"):
                new_code = code_val.lstrip("'")
                print(f"Updating ID {id_val}: {code_val} -> {new_code}")
                await conn.execute(update(Employee).where(Employee.id == id_val).values(employee_code=new_code))
    print("Done")

if __name__ == "__main__":
    asyncio.run(run())
