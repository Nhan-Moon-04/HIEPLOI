@echo off

start cmd /k "cd /d D:\CODE\HIEPLOI\backend && .\venv\Scripts\activate && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

start cmd /k "cd /d D:\CODE\HIEPLOI\frontend && npm run dev -- --host"