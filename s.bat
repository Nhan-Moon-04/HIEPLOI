@echo off

:: Kill process dang chay tren port 8000 (backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 "') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Kill process dang chay tren port 5173 (frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 "') do (
    taskkill /F /PID %%a >nul 2>&1
)

start cmd /k "cd /d D:\CODE\HIEPLOI\backend && .\venv\Scripts\activate && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

start cmd /k "cd /d D:\CODE\HIEPLOI\frontend && npm run dev -- --host"
