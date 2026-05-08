import asyncio
from sqlalchemy import text
from app.database import engine

async def run():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("DROP INDEX IF EXISTS ix_employees_employee_code;"))
            print("Dropped index")
            await conn.execute(text("CREATE INDEX ix_employees_employee_code ON employees(employee_code);"))
            print("Created non-unique index")
        except Exception as e:
            print("Error:", e)

asyncio.run(run())
