# Hướng Dẫn Deploy lên Ubuntu / Armbian Server

> **Server của bạn:** Armbian Focal (Ubuntu 20.04) · ARM Cortex-A9 · RAM ~1GB  
> **Domain:** nthiennhan.ddns.net  
> **Truy cập:** `ssh root@nthiennhan.ddns.net`

---

## Tổng quan kiến trúc

```
Internet / LAN
      │
      ▼
   Nginx :80
   ├── /        → serve static files (frontend đã build)
   └── /api/*   → proxy → uvicorn :8000 (FastAPI backend)
                                │
                          PostgreSQL :5432
```

---

## Bước 1: Cập nhật hệ thống

```bash
apt update && apt upgrade -y
apt install -y git curl wget nano ufw build-essential
```

---

## Bước 2: Cài Node.js 18 (để build frontend)

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
node --version   # phải thấy v18.x.x
npm --version
```

---

## Bước 3: Cài Python 3.12

Ubuntu 20.04 mặc định có Python 3.8 — cần thêm PPA:

```bash
apt install -y software-properties-common
add-apt-repository ppa:deadsnakes/ppa -y
apt update
apt install -y python3.12 python3.12-venv python3.12-dev
python3.12 --version   # phải thấy Python 3.12.x
```

---

## Bước 4: Cài PostgreSQL

```bash
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql
```

Tạo database và user:

```bash
sudo -u postgres psql << 'EOF'
CREATE USER hieploi WITH PASSWORD 'hieploi2026';
CREATE DATABASE hieploi_hr OWNER hieploi;
GRANT ALL PRIVILEGES ON DATABASE hieploi_hr TO hieploi;
\q
EOF
```

Kiểm tra kết nối:

```bash
psql -U hieploi -h localhost -d hieploi_hr -c "SELECT version();"
# Nhập password: hieploi2026
```

---

## Bước 5: Cài Nginx

```bash
apt install -y nginx
systemctl enable nginx
systemctl start nginx
```

---

## Bước 6: Clone dự án

```bash
cd /opt
git clone https://github.com/Nhan-Moon-04/HIEPLOI.git hieploi
cd /opt/hieploi
```

---

## Bước 7: Cấu hình file `.env`

```bash
nano /opt/hieploi/.env
```

Nội dung:

```env
# Database
DATABASE_URL=postgresql+asyncpg://hieploi:hieploi2026@localhost:5432/hieploi_hr
DATABASE_URL_SYNC=postgresql://hieploi:hieploi2026@localhost:5432/hieploi_hr

# JWT — THAY BẰNG CHUỖI NGẪU NHIÊN!
SECRET_KEY=<chạy lệnh bên dưới để tạo>

# App
DEBUG=false
FRONTEND_URL=http://nthiennhan.ddns.net

# SMTP Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=nthiennhan1611@gmail.com
SMTP_PASSWORD=fikbbpfhocqzxptu
EMAIL_FROM_NAME=Hiệp Lợi HR
```

Tạo SECRET_KEY ngẫu nhiên:

```bash
python3.12 -c "import secrets; print(secrets.token_hex(32))"
# Copy kết quả vào SECRET_KEY trong .env
```

---

## Bước 8: Cài đặt Backend

```bash
cd /opt/hieploi/backend

# Tạo virtual environment
python3.12 -m venv venv

# Kích hoạt
source venv/bin/activate

# Cài packages
pip install --upgrade pip
pip install -r requirements.txt

# Test chạy thử
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# Ctrl+C sau khi thấy "Application startup complete."
```

---

## Bước 9: Build Frontend

```bash
cd /opt/hieploi/frontend

npm install
npm run build
# Kết quả nằm ở /opt/hieploi/frontend/dist/
ls dist/   # phải thấy index.html, assets/
```

> Build có thể mất 2-5 phút trên ARM. RAM 1GB đủ để build.

---

## Bước 10: Cấu hình Systemd (tự khởi động backend)

```bash
nano /etc/systemd/system/hieploi.service
```

Nội dung:

```ini
[Unit]
Description=Hiep Loi HR Backend
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

Kích hoạt service:

```bash
systemctl daemon-reload
systemctl enable hieploi
systemctl start hieploi

# Kiểm tra trạng thái
systemctl status hieploi
# Phải thấy "active (running)"

# Xem log nếu có lỗi
journalctl -u hieploi -n 50
```

---

## Bước 11: Cấu hình Nginx

```bash
nano /etc/nginx/sites-available/hieploi
```

Nội dung:

```nginx
server {
    listen 8080;
    server_name nthiennhan.ddns.net 192.168.1.200;

    # Serve frontend static files
    root /opt/hieploi/frontend/dist;
    index index.html;

    # API proxy → backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        client_max_body_size 50M;
    }

    # React SPA — fallback về index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Kích hoạt:

```bash
ln -s /etc/nginx/sites-available/hieploi /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Kiểm tra cú pháp
nginx -t

# Reload
systemctl reload nginx
```

---

## Bước 12: Mở firewall

```bash
ufw allow OpenSSH
ufw allow 8080/tcp
ufw enable
ufw status
```

---

## Bước 13: Truy cập hệ thống

Mở trình duyệt:

```
http://nthiennhan.ddns.net:8080   ← từ internet (nếu DDNS đã trỏ đúng)
http://192.168.1.200:8080         ← từ mạng LAN nội bộ
```

Đăng nhập: `admin` / `admin123`

---

## Cập nhật code mới (khi có thay đổi)

```bash
cd /opt/hieploi

# Pull code mới
git pull

# Rebuild frontend nếu có thay đổi giao diện
cd frontend && npm install && npm run build && cd ..

# Cài packages mới nếu requirements.txt thay đổi
cd backend && source venv/bin/activate && pip install -r requirements.txt && cd ..

# Restart backend
systemctl restart hieploi
```

---

## Lệnh quản lý thường dùng

```bash
# Xem trạng thái backend
systemctl status hieploi

# Xem log realtime
journalctl -u hieploi -f

# Restart backend
systemctl restart hieploi

# Xem log Nginx
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log

# Xem dung lượng database
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('hieploi_hr'));"

# Backup database PostgreSQL
pg_dump -U hieploi -h localhost hieploi_hr > backup_$(date +%Y%m%d).sql
```

---

## Xử lý lỗi thường gặp

### Backend không start — lỗi "could not connect to server"
→ PostgreSQL chưa chạy:
```bash
systemctl status postgresql
systemctl start postgresql
```

### Nginx báo 502 Bad Gateway
→ Backend chưa chạy:
```bash
systemctl restart hieploi
curl http://127.0.0.1:8000/api/health   # test trực tiếp
```

### Build frontend bị lỗi "JavaScript heap out of memory"
→ RAM hạn chế, tăng heap size:
```bash
NODE_OPTIONS=--max-old-space-size=512 npm run build
```

### Permission denied khi chạy uvicorn
```bash
chown -R root:root /opt/hieploi
chmod -R 755 /opt/hieploi
```

---

## Tùy chọn: HTTPS với Let's Encrypt

Nếu domain `nthiennhan.ddns.net` trỏ được ra ngoài internet:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d nthiennhan.ddns.net --http-01-port 8080
# Certbot tự sửa config Nginx và cài chứng chỉ SSL miễn phí

# Tự gia hạn (cron tự động)
certbot renew --dry-run
```

Sau đó truy cập bằng `https://nthiennhan.ddns.net:8080` ✅
