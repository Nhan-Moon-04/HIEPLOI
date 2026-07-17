# Hướng Dẫn Deploy Lên VPS Ubuntu 24.04 LTS

Tài liệu này hướng dẫn chi tiết cách triển khai (deploy) hệ thống **Hiệp Lợi HR System** (bao gồm FastAPI backend, PostgreSQL database, React/Vite frontend và Nginx reverse proxy) lên máy chủ VPS chạy hệ điều hành **Ubuntu 24.04 LTS (Noble Numbat)**.

---

## 📌 Tổng Quan Kiến Trúc Triển Khai

```text
       Internet (Người dùng)
                 │
                 ▼
         Nginx (Port 80/443)
         ├── /        → Serve static files (Frontend đã build)
         └── /api/*   → Proxy_pass → Uvicorn (Backend :8000)
                                       │
                                       ▼
                                PostgreSQL (:5432)
```

---

## ⚙️ Điểm Khác Biệt Quan Trọng Trên Ubuntu 24.04 LTS
* **Python 3.12 có sẵn mặc định:** Không cần thêm PPA `deadsnakes` như các bản cũ (Ubuntu 20.04/22.04). Chỉ cần cài qua apt.
* **PEP 668 (Externally Managed Environment):** Ubuntu 24.04 chặn sử dụng `pip` cài package trực tiếp vào global. **Bắt buộc** phải sử dụng Virtual Environment (`venv`), điều này đã được cấu hình sẵn trong quy trình bên dưới.
* **PostgreSQL 16:** Phiên bản mặc định trên Ubuntu 24.04.

---

## 🛠️ Bước 1: Cập Nhật Hệ Thống & Cài Đặt Công Cụ

Cập nhật danh sách gói và cài đặt các thư viện hệ thống cơ bản cần thiết:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget nano ufw build-essential ca-certificates
```

---

## 🛠️ Bước 2: Cài Đặt Node.js 20.x (Để Build Frontend)

Chúng ta sử dụng Node.js v20.x (bản LTS hiện tại) thông qua NodeSource repository:

```bash
# Thêm NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Cài đặt Node.js
sudo apt install -y nodejs

# Kiểm tra phiên bản thành công
node -v   # Phải hiển thị v20.x.x
npm -v    # Kiểm tra phiên bản npm
```

---

## 🛠️ Bước 3: Cài Đặt Python 3.12 & Môi Trường Ảo

Vì Ubuntu 24.04 đã có Python 3.12 làm mặc định, bạn chỉ cần cài đặt trình quản lý gói `pip` và gói tạo môi trường ảo `venv`:

```bash
sudo apt install -y python3 python3-pip python3-venv python3-dev
python3 --version  # Phải thấy Python 3.12.x
```

---

## 🛠️ Bước 4: Cài Đặt & Cấu Hình PostgreSQL 16

```bash
# Cài đặt PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Kích hoạt và khởi chạy service
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### Tạo Database và Tài Khoản Quản Trị
Đăng nhập vào PostgreSQL CLI dưới quyền user hệ thống `postgres` để tạo database và user mới:

```bash
sudo -u postgres psql << 'EOF'
CREATE USER hieploi WITH PASSWORD 'hieploi2026';
CREATE DATABASE hieploi_hr OWNER hieploi;
GRANT ALL PRIVILEGES ON DATABASE hieploi_hr TO hieploi;
\q
EOF
```

---

## 🛠️ Bước 5: Tải Mã Nguồn Dự Án (Clone)

Tải mã nguồn từ GitHub về thư mục chuyên dụng `/opt/hieploi`:

```bash
cd /opt
sudo git clone https://github.com/Nhan-Moon-04/HIEPLOI.git hieploi
sudo chown -R root:root /opt/hieploi
cd /opt/hieploi
```

---

## 🛠️ Bước 6: Cấu Hình Tệp Môi Trường `.env`

Tạo file cấu hình môi trường chứa các tham số kết nối database và mail:

```bash
sudo nano /opt/hieploi/.env
```

Nhập nội dung tương tự như sau (hãy thay đổi địa chỉ domain và mật khẩu email thật của bạn):

```env
# Database kết nối PostgreSQL
DATABASE_URL=postgresql+asyncpg://hieploi:hieploi2026@localhost:5432/hieploi_hr
DATABASE_URL_SYNC=postgresql://hieploi:hieploi2026@localhost:5432/hieploi_hr

# JWT Security Key (Tạo chuỗi ngẫu nhiên bên dưới để điền vào đây)
SECRET_KEY=THAY_THE_BANG_CHUOI_RANDOM_O_BUOC_DUOI

# App Mode & URL
DEBUG=false
FRONTEND_URL=http://yourdomain.com  # Thay bằng domain hoặc IP VPS của bạn

# SMTP Email (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=nthiennhan1611@gmail.com
SMTP_PASSWORD=fikbbpfhocqzxptu  # App password của Gmail
EMAIL_FROM_NAME=Hiệp Lợi HR
```

> **Cách sinh chuỗi SECRET_KEY ngẫu nhiên:**
> ```bash
> python3 -c "import secrets; print(secrets.token_hex(32))"
> ```
> *Copy mã hex kết quả thu được dán vào giá trị `SECRET_KEY` trong file `.env`.*

---

## 🛠️ Bước 7: Cài Đặt Backend & Cấu Hình Cơ Sở Dữ Liệu (Seed & Migrate)

Vào thư mục backend, khởi tạo Virtual Environment độc lập và cài đặt các thư viện Python:

```bash
cd /opt/hieploi/backend

# Khởi tạo môi trường ảo venv độc lập (Bắt buộc theo PEP 668)
python3 -m venv venv
source venv/bin/activate

# Nâng cấp pip và cài đặt packages
pip install --upgrade pip
pip install -r requirements.txt
```

### ⚠️ QUAN TRỌNG: Cơ chế Khởi tạo, Migration & Seeding dữ liệu (4 Nơi Cần Lưu Ý)
Cơ sở dữ liệu của hệ thống được quản lý thông qua **4 chỗ** (tự động và thủ công) riêng biệt tùy theo nhu cầu:

#### 1. Tạo bảng & Cập nhật Schema tự động (Tự Động Chạy)
Khi ứng dụng backend FastAPI khởi chạy lần đầu, sự kiện `lifespan` trong [main.py](file:///d:/CODE/HIEPLOI/backend/app/main.py) sẽ tự động chạy:
* `Base.metadata.create_all`: Tự động tạo toàn bộ các bảng dữ liệu nếu chưa tồn tại.
* `run_migration()`: Chạy các lệnh SQL nâng cấp tự động (như `ALTER TABLE ... ADD COLUMN` cho các bảng `employees`, `advance_payments`, `company_holidays`, `departments`...).

#### 2. Seed ca đặc biệt "SEP" tự động (Tự Động Chạy)
Cũng trong quá trình startup của Backend ở [main.py](file:///d:/CODE/HIEPLOI/backend/app/main.py), hệ thống tự động kiểm tra xem mã ca làm việc `SEP` (Ca sếp) đã tồn tại trong bảng `shift_templates` chưa. Nếu chưa có, hệ thống tự động insert vào database.

#### 3. Seed dữ liệu nghiệp vụ cơ sở (Thủ Công - PHẢI CHẠY)
Để hệ thống có sẵn các tài khoản đăng nhập (`admin`, `ketoan`), các ca làm việc tiêu chuẩn (`DEFAULT_SHIFTS` như X, XVP, D, CN, CND, OFF, P, L...), và 37 nhân viên mẫu ban đầu (`SAMPLE_EMPLOYEES`).
Do chức năng này đã bị **tắt tự động chạy** trong file [main.py](file:///d:/CODE/HIEPLOI/backend/app/main.py) (dòng `# await seed_database()`) để tránh ghi đè dữ liệu thật sau này, **bạn bắt buộc phải chạy lệnh này thủ công một lần duy nhất** ngay sau khi cài database sạch:

```bash
# Kích hoạt venv trước nếu chưa kích hoạt
source /opt/hieploi/backend/venv/bin/activate

# Chạy lệnh Python để seed dữ liệu cơ bản từ app/services/seed.py
python -c "import asyncio; from app.services.seed import seed_database; asyncio.run(seed_database())"
```
*Kết quả hiển thị thành công:*
```text
[OK] Seeded admin + ke toan users
[OK] Seeded shift templates
[OK] Seeded 37 employees
[DONE] Database seeding complete!
```

#### 4. Script chỉnh sửa & Cập nhật dữ liệu cũ (Chỉ Dùng Khi Cập Nhật)
Nếu bạn nâng cấp hệ thống từ phiên bản cũ lên hoặc chuyển đổi từ cơ sở dữ liệu SQLite sang PostgreSQL, bạn sẽ cần chạy một số file python tiện ích nằm trong gốc thư mục `backend/` theo trình tự thích hợp:
* **Cập nhật bảng tăng ca X:** Chạy `python migrate_xot.py` để drop và khởi tạo lại bảng `x_overtime_configs` với cấu trúc cột `work_date` mới.
* **Gỡ bỏ ràng buộc Unique mã nhân viên:** Chạy `python drop_unique.py` để chuyển đổi index mã nhân viên từ Unique (duy nhất) sang Non-Unique (cho phép trùng nếu nhân viên nghỉ rồi vào lại).
* **Dọn dẹp mã nhân viên (xóa dấu nháy):** Chạy `python clean_codes.py` nếu dữ liệu mã nhân viên bị bọc trong dấu nháy đơn `'` do quá trình import Excel cũ.
* **Trộn bản ghi nhân viên trùng lặp:** Chạy `python fix_duplicates.py` để gộp các bản ghi nhân viên bị trùng lặp mã trở lại bản ghi gốc.

---

## 🛠️ Bước 8: Khởi Tạo Service Systemd Cho Backend (Tự Khởi Động)

Tạo file service để quản lý tiến trình backend FastAPI chạy nền và tự động bật lại nếu server crash:

```bash
sudo nano /etc/systemd/system/hieploi.service
```

Thêm nội dung sau vào file:

```ini
[Unit]
Description=Hiep Loi HR Backend Service
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/hieploi/backend
Environment="PATH=/opt/hieploi/backend/venv/bin"
ExecStart=/opt/hieploi/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Kích hoạt và khởi chạy service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable hieploi
sudo systemctl start hieploi

# Kiểm tra trạng thái hoạt động
sudo systemctl status hieploi   # Phải hiển thị màu xanh "active (running)"
```

---

## 🛠️ Bước 9: Cài Đặt Dependencies & Build Frontend

Tiến hành cài đặt thư viện frontend bằng npm và build ra thư mục tĩnh tĩnh để Nginx phục vụ:

```bash
cd /opt/hieploi/frontend
sudo npm install

# Build mã nguồn thành các file HTML/JS/CSS tĩnh
sudo npm run build

# Kết quả build sẽ nằm tại thư mục: /opt/hieploi/frontend/dist
# Kiểm tra sự tồn tại của index.html
ls -la dist/
```

> *Mẹo nhỏ trên VPS cấu hình RAM yếu (< 1GB): Nếu quá trình build bị đứng hoặc báo lỗi `JavaScript heap out of memory`, hãy dùng lệnh:*
> `sudo NODE_OPTIONS=--max-old-space-size=1024 npm run build`

---

## 🛠️ Bước 10: Cấu Hình Nginx Reverse Proxy

Tạo file cấu hình virtual host mới cho Nginx:

```bash
sudo nano /etc/nginx/sites-available/hieploi
```

Dán nội dung cấu hình sau vào (hãy thay thế `yourdomain.com` bằng domain thật của bạn hoặc IP VPS):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com; # Thay thế bằng domain hoặc IP của bạn

    # Thư mục chứa mã nguồn Frontend tĩnh đã build
    root /opt/hieploi/frontend/dist;
    index index.html;

    # Cấu hình proxy ngược cho Backend FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Hỗ trợ Websocket cho Chat và Chấm công thời gian thực
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        client_max_body_size 50M; # Giới hạn dung lượng file tải lên (50MB)
    }

    # Hỗ trợ Router React (SPA) - Chuyển hướng các request khác về index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Kích hoạt cấu hình và tải lại Nginx:

```bash
# Tạo liên kết tượng trưng (symlink) kích hoạt site
sudo ln -sf /etc/nginx/sites-available/hieploi /etc/nginx/sites-enabled/

# Xóa cấu hình mặc định (default site) để tránh xung đột port 80
sudo rm -f /etc/nginx/sites-enabled/default

# Kiểm tra cú pháp file cấu hình Nginx
sudo nginx -t   # Phải báo "syntax is ok" và "test is successful"

# Reload Nginx
sudo systemctl reload nginx
```

---

## 🛠️ Bước 11: Cấu Hình Tường Lửa (UFW Firewall)

Chỉ cho phép mở các cổng cần thiết như SSH, HTTP, và HTTPS để đảm bảo bảo mật cho VPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable   # Gõ "y" để đồng ý kích hoạt tường lửa
sudo ufw status
```

---

## 🔒 Tùy Chọn: Cấu Hình Bảo Mật SSL (HTTPS) Miễn Phí Với Certbot

Nếu bạn đã có tên miền riêng (domain) và đã trỏ thành công về địa chỉ IP của VPS, hãy cài đặt SSL miễn phí thông qua Let's Encrypt:

```bash
sudo apt install -y certbot python3-certbot-nginx

# Chạy certbot tự động quét cấu hình Nginx và cài đặt chứng chỉ
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

*Làm theo hướng dẫn trên màn hình (nhập email và đồng ý điều khoản). Certbot sẽ tự động chỉnh sửa cấu hình Nginx để kích hoạt SSL và tự động gia hạn chứng chỉ.*

---

## 🔄 Quy Trình Cập Nhật Dự Án Khi Có Thay Đổi Code (Update)

Mỗi lần bạn đẩy code mới lên Git và muốn cập nhật trên VPS, hãy SSH vào VPS và chạy chuỗi lệnh sau:

```bash
cd /opt/hieploi

# 1. Kéo code mới nhất từ GitHub
sudo git pull

# 2. Cập nhật frontend (nếu có thay đổi UI)
cd frontend
sudo npm install
sudo npm run build

# 3. Cập nhật backend (nếu có thư viện mới trong requirements.txt)
cd ../backend
source venv/bin/activate
pip install -r requirements.txt

# 4. Áp dụng các thay đổi database (nếu có sửa đổi database ở app/main.py)
# Khi backend khởi động lại ở bước 5, lifespan sẽ tự động chạy Base.metadata.create_all và run_migration()

# 5. Khởi động lại service Backend để áp dụng code mới
sudo systemctl restart hieploi
```

---

## 🛠️ Các Lệnh Quản Trị Thường Dùng Trên VPS

### Quản lý tiến trình Backend
```bash
# Xem nhật ký log chạy thời gian thực (realtime) của Backend
journalctl -u hieploi -f -n 100

# Khởi động lại Backend
sudo systemctl restart hieploi

# Dừng chạy Backend
sudo systemctl stop hieploi
```

### Quản lý Nginx và PostgreSQL
```bash
# Xem log lỗi của Nginx
sudo tail -f /var/log/nginx/error.log

# Kiểm tra trạng thái PostgreSQL
sudo systemctl status postgresql
```

### Sao lưu Cơ Sở Dữ Liệu PostgreSQL (Backup)
```bash
# Xuất dữ liệu ra file SQL (đặt tên theo ngày giờ)
pg_dump -U hieploi -h localhost hieploi_hr > /opt/backup_hieploi_$(date +%Y%m%d_%H%M%S).sql
```
