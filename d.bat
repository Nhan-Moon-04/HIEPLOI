@echo off
title HIEPLOI - KHOI DONG HE THONG

echo ===================================================
echo   HIEPLOI - KHOI DONG HE THONG
echo ===================================================

echo.
echo [1] Tat PostgreSQL XNK neu dang chay...
docker stop xnk_postgres >nul 2>&1

echo [2] Kiem tra PostgreSQL HIEPLOI...

docker inspect hieploi_db >nul 2>&1

if errorlevel 1 (
    echo     HIEPLOI container chua ton tai - tao lai...
    cd /d D:\CODE\HIEPLOI
    docker compose up -d
) else (
    echo     Bat hieploi_db...
    docker start hieploi_db >nul 2>&1
)

echo.
echo [3] Cho PostgreSQL HIEPLOI san sang...

:WAIT_DB
docker exec hieploi_db pg_isready -U hieploi -d hieploi_hr >nul 2>&1

if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto WAIT_DB
)

echo     PostgreSQL HIEPLOI da san sang!

echo.
echo [4] Tat backend cu tren port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 "') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [5] Tat frontend cu tren port 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 "') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [6] Khoi dong Backend HIEPLOI...
start cmd /k "title HIEPLOI_BACKEND && cd /d D:\CODE\HIEPLOI\backend && call .\venv\Scripts\activate && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [7] Khoi dong Frontend HIEPLOI...
start cmd /k "title HIEPLOI_FRONTEND && cd /d D:\CODE\HIEPLOI\frontend && npm run dev -- --host"

echo.
echo ===================================================
echo   HIEPLOI DA KHOI DONG
echo.
echo   Database : hieploi_db
echo   Backend  : http://localhost:8000
echo   Frontend : http://localhost:5173
echo ===================================================

pause