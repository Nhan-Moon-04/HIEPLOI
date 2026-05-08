from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.models import *  # noqa: F401, F403 - Import all models so they register with Base
from app.routers import auth, shifts, employees, dashboard, holidays, schedules
from app.services.seed import seed_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables + seed data"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_database()
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


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": "Hiệp Lợi HR System"}
