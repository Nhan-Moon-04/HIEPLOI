from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.database import engine, Base
from app.models import *  # noqa: F401, F403 - Import all models so they register with Base
from app.routers import auth, shifts, employees, dashboard, holidays, schedules, overtime, attendance, import_export, meal_allowance, salaries, audit, leave, union
from app.services.seed import seed_database


async def run_migration():
    """Chạy migration thủ công — thêm cột nếu chưa tồn tại"""
    async with engine.begin() as conn:
        for stmt in [
            "ALTER TABLE employees ADD COLUMN dependents INTEGER DEFAULT 0",
            "ALTER TABLE advance_payments ADD COLUMN loan_id INTEGER",
            "ALTER TABLE advance_payments ADD COLUMN installment_no INTEGER DEFAULT 1",
            """CREATE TABLE IF NOT EXISTS advance_loans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                loan_date DATE NOT NULL,
                total_amount NUMERIC(12,2) NOT NULL,
                advance_type VARCHAR(16) DEFAULT 'cash',
                repayment_months INTEGER DEFAULT 1,
                monthly_repayment NUMERIC(12,2),
                start_month VARCHAR(7) NOT NULL,
                paid_amount NUMERIC(12,2) DEFAULT 0,
                status VARCHAR(16) DEFAULT 'active',
                notes VARCHAR(255),
                created_by VARCHAR(64),
                created_at DATETIME,
                updated_at DATETIME
            )""",
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables + seed data"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await run_migration()
    # await seed_database()  # Dừng tự động seed dữ liệu theo yêu cầu
    yield
    await engine.dispose()


app = FastAPI(
    title="Hiệp Lợi HR System",
    description="Hệ thống quản lý chấm công & lương - Cty TNHH Hiệp Lợi",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router, prefix="/api")
app.include_router(shifts.router, prefix="/api")
app.include_router(employees.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(holidays.router, prefix="/api")
app.include_router(schedules.router, prefix="/api")
app.include_router(overtime.router, prefix="/api")
app.include_router(attendance.router, prefix="/api")
app.include_router(import_export.router, prefix="/api")
app.include_router(salaries.router, prefix="/api")
app.include_router(meal_allowance.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(leave.router, prefix="/api")
app.include_router(union.router, prefix="/api")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": "Hiệp Lợi HR System"}
