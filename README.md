# HIỆP LỢI GROUP — Hệ Thống Quản Lý Nhân Sự & Chấm Công

> Phần mềm quản lý chấm công, lịch làm việc, tính lương, công đoàn cho Công ty TNHH Hiệp Lợi.

---

## ⚠️ Yêu Cầu Hệ Điều Hành

| Hệ điều hành | Hỗ trợ |
|---|---|
| Windows 10 64-bit (1903 trở lên) | ✅ |
| Windows 11 | ✅ |
| Windows 7, 8, 8.1 | ❌ Không hỗ trợ |
| macOS 12+ | ✅ (đổi `.\venv\Scripts\activate` → `source venv/bin/activate`) |

> **Lý do Windows 7 không chạy được:**
> - Node.js 18+ (bắt buộc cho Vite 8) đã ngừng hỗ trợ Windows 7 từ phiên bản Node.js 14
> - Python 3.12 đã ngừng hỗ trợ Windows 7 từ Python 3.9
> - Docker Desktop yêu cầu Windows 10 Pro/Enterprise

---

## Tech Stack

| Layer | Công nghệ |
|---|---|
| **Frontend** | React 19 + Vite 8 + Ant Design 6 |
| **Backend** | Python 3.12 + FastAPI + SQLAlchemy 2.0 |
| **Database** | PostgreSQL 16 |
| **Auth** | JWT (python-jose + bcrypt) + OTP email |

---

## Cài Đặt Lần Đầu (One-time Setup)

### 1. Cài đặt phần mềm cần thiết

| Phần mềm | Phiên bản | Link tải |
|---|---|---|
| Python | 3.12.x | https://www.python.org/downloads/ |
| Node.js | 20 LTS | https://nodejs.org/ |
| PostgreSQL | 16 | https://www.postgresql.org/download/windows/ |
| Git | mới nhất | https://git-scm.com/ |

> **Lưu ý khi cài Python:** Tick vào ô **"Add Python to PATH"** trước khi nhấn Install.
>
> **Lưu ý khi cài PostgreSQL:** Nhớ password của user `postgres` — sẽ dùng ở bước sau.

---

### 2. Clone dự án

```bash
git clone https://github.com/Nhan-Moon-04/HIEPLOI.git
cd HIEPLOI
```

Hoặc tải ZIP từ GitHub về và giải nén vào `D:\CODE\HIEPLOI`.

---

### 3. Tạo Database PostgreSQL

Mở **pgAdmin** (đã cài cùng PostgreSQL) hoặc **SQL Shell (psql)** rồi chạy:

```sql
-- Tạo user
CREATE USER hieploi WITH PASSWORD 'hieploi2026';

-- Tạo database
CREATE DATABASE hieploi_hr OWNER hieploi;

-- Cấp quyền
GRANT ALL PRIVILEGES ON DATABASE hieploi_hr TO hieploi;
```

Hoặc dùng Docker (nếu đã cài Docker Desktop):

```bash
docker compose up -d
```

---

### 4. Cấu hình file `.env`

File `.env` nằm ở thư mục gốc `D:\CODE\HIEPLOI\.env`. Kiểm tra và chỉnh sửa nếu cần:

```env
# Database
DATABASE_URL=postgresql+asyncpg://hieploi:hieploi2026@localhost:5432/hieploi_hr
DATABASE_URL_SYNC=postgresql://hieploi:hieploi2026@localhost:5432/hieploi_hr

# JWT — ĐỔI SECRET_KEY trong production!
SECRET_KEY=hieploi-super-secret-key-2026-change-in-production

# App
DEBUG=true
FRONTEND_URL=http://localhost:5173

# SMTP Gmail — để nhận OTP đăng nhập thiết bị mới và reset mật khẩu
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password   # App Password 16 ký tự, KHÔNG phải mật khẩu Gmail thường
EMAIL_FROM_NAME=Hiệp Lợi HR
```

> **Tạo App Password Gmail:**
> 1. Vào https://myaccount.google.com/security
> 2. Bật **Xác minh 2 bước** (bắt buộc)
> 3. Vào **App passwords** → chọn "Mail" → Copy 16 ký tự

---

### 5. Cài đặt Backend

```bash
cd D:\CODE\HIEPLOI\backend

# Tạo virtual environment
python -m venv venv

# Kích hoạt venv
.\venv\Scripts\activate

# Cài packages
pip install -r requirements.txt
```

---

### 6. Cài đặt Frontend

```bash
cd D:\CODE\HIEPLOI\frontend

npm install
```

---

## Khởi Động Hệ Thống

### Cách nhanh — dùng file `s.bat`

Double-click vào `D:\CODE\HIEPLOI\s.bat`

File này tự động mở 2 cửa sổ CMD:
- **Cửa sổ 1:** Backend FastAPI tại `http://localhost:8000`
- **Cửa sổ 2:** Frontend Vite tại `http://localhost:5173`

> Lần đầu khởi động, backend tự động tạo tất cả bảng trong database.

---

### Cách thủ công

**Terminal 1 — Backend:**
```bash
cd D:\CODE\HIEPLOI\backend
.\venv\Scripts\activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend:**
```bash
cd D:\CODE\HIEPLOI\frontend
npm run dev -- --host
```

---

### Truy cập hệ thống

| URL | Mô tả |
|---|---|
| `http://localhost:5173` | Giao diện chính (dùng hàng ngày) |
| `http://192.168.1.xxx:5173` | Truy cập từ máy khác trong mạng LAN |
| `http://localhost:8000/docs` | API documentation (Swagger) |

> Tìm IP LAN của máy chủ: chạy `ipconfig` trong CMD → xem **IPv4 Address**.

---

## Tài Khoản Đăng Nhập Mặc Định

| Username | Password | Vai trò |
|---|---|---|
| `admin` | `admin123` | Admin — toàn quyền |
| `ketoan` | `ketoan123` | Kế toán |

> **Bảo mật:** Đổi mật khẩu ngay sau lần đăng nhập đầu tiên tại mục **Cài đặt tài khoản**.

---

## Tính Năng Hệ Thống

| Trang | Đường dẫn | Mô tả |
|---|---|---|
| Dashboard | `/dashboard` | Thống kê tổng quan, biểu đồ |
| Chấm công | `/attendance` | Bảng chấm công tháng, tính giờ OT |
| Lịch làm | `/schedules` | Phân ca theo tháng, kéo thả |
| Nhân viên | `/employees` | Hồ sơ, thông tin cá nhân |
| Mã ca | `/shifts` | Cấu hình các ca làm việc |
| Ngày nghỉ | `/holidays` | Lễ tết, nghỉ bù |
| OT Tăng ca X | `/overtime` | Config tăng ca đặc biệt |
| Tiền ăn | `/meal-allowance` | Phụ cấp tiền cơm, ca đêm |
| Lương cơ bản | `/base-salary` | Mức lương tháng từng NV |
| Bảng lương | `/payroll` | Tính lương đầy đủ (BHXH, TNCN) |
| Tạm ứng | `/advances` | Quản lý vay tạm ứng lương |
| Công đoàn | `/union` | Thu chi, sự kiện, danh sách đoàn viên |
| Import/Export | `/import-export` | Import chấm công, backup/restore dữ liệu |
| Kiểm toán | `/audit` | Lịch sử thao tác hệ thống |

---

## Import Dữ Liệu Chấm Công

File Excel từ máy chấm công phải có format:

| Cột 1 | Cột 2 | Cột 3 | Cột 4 |
|---|---|---|---|
| Mã NV | Họ tên | Bộ phận | Thời gian scan |

- Định dạng hỗ trợ: `.xlsx`, `.xls`, `.csv`
- Thời gian scan: `YYYY-MM-DD HH:MM:SS` hoặc `DD/MM/YYYY HH:MM`
- Scan trước 6:00 sáng → tự động tính là ca đêm hôm trước

---

## Backup & Restore

- **Backup:** Vào Import/Export → "Tải Backup (.json)" → lưu file về máy
- **Restore:** Vào Import/Export → "Restore từ Backup (.json)" → chọn file backup
- File backup chứa: nhân viên, ca, lịch, chấm công, lương, tạm ứng, công đoàn
- **Không** chứa: mật khẩu, raw logs chấm công (có thể re-import từ file máy)

---

## Cấu Trúc Thư Mục

```
HIEPLOI/
├── backend/
│   ├── app/
│   │   ├── main.py              # Entry point, migrations
│   │   ├── config.py            # Cấu hình từ .env
│   │   ├── database.py          # Kết nối DB
│   │   ├── models/              # SQLAlchemy models (22 bảng)
│   │   ├── schemas/             # Pydantic request/response
│   │   ├── routers/             # API endpoints
│   │   ├── services/            # Logic nghiệp vụ
│   │   ├── middleware/          # JWT auth middleware
│   │   └── utils/               # Email, security, audit...
│   ├── venv/                    # Python virtual environment (không commit)
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx              # Routes
│   │   ├── pages/               # Các trang chức năng
│   │   ├── components/          # Layout, Sidebar
│   │   ├── stores/              # Zustand (auth state)
│   │   └── api/                 # Axios client
│   └── package.json
│
├── .env                         # Biến môi trường (không commit lên Git public)
├── s.bat                        # Khởi động nhanh (double-click)
├── docker-compose.yml           # PostgreSQL qua Docker (tùy chọn)
└── README.md
```

---

## Xử Lý Lỗi Thường Gặp

### Không nhận được email OTP / quên mật khẩu

1. Kiểm tra `SMTP_PASSWORD` trong `.env` — phải là **App Password** 16 ký tự (không dấu cách), không phải mật khẩu Gmail thường
2. Tài khoản Gmail phải bật **Xác minh 2 bước**
3. Restart backend sau khi sửa `.env`
4. Trong **DEBUG mode** (`DEBUG=true`), mã OTP được in ra terminal backend — dùng để đăng nhập khi chưa có email

### Backend lỗi `connection refused` khi khởi động

→ PostgreSQL chưa chạy. Kiểm tra:
```bash
# Xem PostgreSQL có đang chạy không
services.msc   # Tìm "postgresql-x64-16" → Start
```

### Port 8000 hoặc 5173 đã bị chiếm

```bash
# Tìm process đang dùng port
netstat -ano | findstr :8000

# Kill process (thay PID)
taskkill /PID <PID> /F
```

### Frontend báo `ECONNREFUSED` khi gọi API

→ Backend chưa chạy hoặc đang khởi động. Đợi terminal backend hiện `Application startup complete.`

### IDE báo "Cannot find module fastapi"

→ Chọn đúng Python interpreter: `Ctrl+Shift+P` → "Python: Select Interpreter" → chọn `backend\venv\Scripts\python.exe`

### Lỗi `Module not found` sau khi `npm install`

```bash
cd frontend
rmdir /s /q node_modules
npm install
```

---

## Bảo Mật (Production)

Trước khi deploy thực tế, cần thay đổi trong `.env`:

```env
DEBUG=false
SECRET_KEY=<chuỗi ngẫu nhiên 64 ký tự>
FRONTEND_URL=https://your-domain.com
```

Tạo SECRET_KEY ngẫu nhiên:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## Hỗ Trợ

- **Lỗi kỹ thuật:** Mở Issue tại https://github.com/Nhan-Moon-04/HIEPLOI/issues
- **API docs:** http://localhost:8000/docs (khi backend đang chạy)
