# HIỆP LỢI GROUP - Hệ Thống Quản Lý Nhân Sự & Chấm Công

> Hệ thống quản lý chấm công, lương, tiền ăn cho Cty TNHH Hiệp Lợi

## Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| **Frontend** | React 19 + Vite + Ant Design 5 |
| **Backend** | Python 3.12 + FastAPI + SQLAlchemy 2.0 |
| **Database** | PostgreSQL 16 (Docker) |
| **Auth** | JWT (python-jose + bcrypt) |

---

## Yêu Cầu Hệ Thống

- **Docker Desktop** (đã cài và đang chạy)
- **Python 3.12+**
- **Node.js 18+** và **npm**

---

## Hướng Dẫn Chạy Dự Án

### Bước 1: Khởi động Database (PostgreSQL)

```bash
# Tại thư mục gốc D:\CODE\HIEPLOI
docker compose up -d
```

Kiểm tra database đã chạy:
```bash
docker ps
# Phải thấy container "hieploi_db" đang chạy

# Test kết nối
docker exec hieploi_db psql -U hieploi -d hieploi_hr -c "SELECT 1"
```

**Thông tin kết nối:**
| Key | Value |
|-----|-------|
| Host | `localhost` |
| Port | `5432` |
| Database | `hieploi_hr` |
| User | `hieploi` |
| Password | `hieploi2026` |

---

### Bước 2: Chạy Backend (FastAPI)

```bash
# Vào thư mục backend
cd D:\CODE\HIEPLOI\backend

# Tạo virtual environment (chỉ lần đầu)
python -m venv venv

# Kích hoạt venv
.\venv\Scripts\activate

# Cài đặt packages (chỉ lần đầu)
pip install -r requirements.txt

# Chạy server
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Backend sẽ chạy tại:** http://localhost:8000

**Swagger API docs:** http://localhost:8000/docs

**Health check:** http://localhost:8000/api/health

> Khi khởi động lần đầu, hệ thống tự động:
> - Tạo tất cả bảng trong database
> - Seed dữ liệu mặc định: 2 users, 11 mã ca, 37 nhân viên

---

### Bước 3: Chạy Frontend (React + Vite)

```bash
# Mở terminal mới, vào thư mục frontend
cd D:\CODE\HIEPLOI\frontend

# Cài đặt packages (chỉ lần đầu)
npm install

# Chạy dev server
npm run dev
```

**Frontend sẽ chạy tại:** http://localhost:5173

---

## Tài Khoản Đăng Nhập Mặc Định

| Username | Password | Vai trò |
|----------|----------|---------|
| `admin` | `admin123` | Admin (toàn quyền) |
| `ketoan` | `ketoan123` | Kế toán |

---

## Cấu Trúc Thư Mục

```
D:\CODE\HIEPLOI\
├── backend/                 # FastAPI Backend
│   ├── app/
│   │   ├── main.py          # Entry point
│   │   ├── config.py        # Settings
│   │   ├── database.py      # DB connection
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── routers/         # API endpoints
│   │   ├── services/        # Business logic + seed data
│   │   ├── middleware/      # Auth middleware
│   │   └── utils/           # Security helpers
│   ├── venv/                # Python virtual environment
│   └── requirements.txt
│
├── frontend/                # React + Vite Frontend
│   ├── src/
│   │   ├── main.jsx         # Entry point
│   │   ├── App.jsx          # Routes
│   │   ├── theme.js         # Ant Design dark theme
│   │   ├── index.css        # Global styles
│   │   ├── api/             # Axios client
│   │   ├── stores/          # Zustand auth store
│   │   ├── components/      # Layout components
│   │   └── pages/           # Page components
│   └── package.json
│
├── docker-compose.yml       # PostgreSQL container
├── .env                     # Environment variables
└── DATABASE_STRUCTURE.md    # DB schema reference
```

---

## API Endpoints

| Method | Endpoint | Mô tả | Auth |
|--------|----------|-------|------|
| `POST` | `/api/auth/login` | Đăng nhập | No |
| `POST` | `/api/auth/refresh` | Refresh token | No |
| `GET` | `/api/auth/me` | Thông tin user hiện tại | Yes |
| `POST` | `/api/auth/users` | Tạo user mới | Admin |
| `GET` | `/api/shifts` | Danh sách mã ca | Yes |
| `POST` | `/api/shifts` | Tạo mã ca | Admin/KT |
| `PUT` | `/api/shifts/{id}` | Sửa mã ca | Admin/KT |
| `DELETE` | `/api/shifts/{id}` | Xóa mã ca | Admin |
| `GET` | `/api/employees` | Danh sách NV (phân trang) | Yes |
| `POST` | `/api/employees` | Thêm NV | Admin/KT |
| `PUT` | `/api/employees/{id}` | Sửa NV | Admin/KT |
| `DELETE` | `/api/employees/{id}` | Xóa NV | Admin |
| `GET` | `/api/employees/departments` | DS bộ phận | Yes |
| `GET` | `/api/dashboard/stats` | Thống kê dashboard | Yes |

---

## Lệnh Thường Dùng

```bash
# Reset database (xóa hết dữ liệu, restart sẽ seed lại)
docker exec hieploi_db psql -U hieploi -d hieploi_hr -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Dừng database
docker compose down

# Dừng + xóa dữ liệu database
docker compose down -v

# Xem log database
docker logs hieploi_db
```

---

## Xử Lý Lỗi Thường Gặp

### IDE báo "Cannot find module fastapi"
→ Chọn đúng Python interpreter: `Ctrl+Shift+P` → "Python: Select Interpreter" → chọn `D:\CODE\HIEPLOI\backend\venv\Scripts\python.exe`

### Backend lỗi UnicodeEncodeError trên Windows
→ Đây chỉ là lỗi logging hiển thị, không ảnh hưởng chức năng. Có thể set `echo=False` trong `database.py`.

### Port 5432 đã bị chiếm
→ Dừng PostgreSQL local nếu có, hoặc đổi port trong `docker-compose.yml`.
