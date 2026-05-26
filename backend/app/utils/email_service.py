"""
Email service — gửi mail qua Gmail SMTP (TLS port 587)
"""
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _build_base_html(title: str, body_html: str) -> str:
    """Template email HTML chung"""
    return f"""
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  body{{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f8;margin:0;padding:20px}}
  .wrap{{max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;
         box-shadow:0 4px 24px rgba(0,0,0,0.10)}}
  .hd{{background:linear-gradient(135deg,#276EF1,#4f46e5);padding:28px 32px;text-align:center}}
  .hd-logo{{width:48px;height:48px;background:rgba(255,255,255,0.2);border-radius:12px;
             display:inline-flex;align-items:center;justify-content:center;
             font-size:18px;font-weight:800;color:#fff;margin-bottom:10px}}
  .hd-title{{color:#fff;font-size:18px;font-weight:700;margin:0}}
  .hd-sub{{color:rgba(255,255,255,0.8);font-size:12px;margin-top:4px}}
  .body{{padding:28px 32px}}
  .body p{{color:#374151;font-size:14px;line-height:1.7;margin:0 0 14px}}
  .btn{{display:block;margin:20px auto;padding:13px 28px;background:linear-gradient(135deg,#276EF1,#4f46e5);
        color:#fff!important;text-decoration:none;border-radius:10px;font-weight:700;
        font-size:14px;text-align:center;max-width:220px}}
  .otp-box{{background:#f0f4ff;border:2px dashed #276EF1;border-radius:12px;
             padding:18px;text-align:center;margin:16px 0}}
  .otp-code{{font-size:36px;font-weight:900;color:#276EF1;letter-spacing:8px;
              font-family:'Courier New',monospace}}
  .otp-timer{{font-size:12px;color:#9ca3af;margin-top:6px}}
  .divider{{border:none;border-top:1px solid #f1f5f9;margin:20px 0}}
  .footer{{background:#f8fafc;padding:16px 32px;text-align:center;
           font-size:11px;color:#9ca3af;line-height:1.6}}
  .warning{{background:#fff7ed;border-left:4px solid #f59e0b;padding:10px 14px;
             border-radius:0 8px 8px 0;font-size:12px;color:#92400e;margin:14px 0}}
</style></head>
<body>
<div class="wrap">
  <div class="hd">
    <div class="hd-logo">HL</div>
    <div class="hd-title">{settings.EMAIL_FROM_NAME}</div>
    <div class="hd-sub">Hệ thống quản lý nhân sự</div>
  </div>
  <div class="body">
    <h2 style="color:#1a2233;font-size:16px;font-weight:700;margin:0 0 16px">{title}</h2>
    {body_html}
  </div>
  <div class="footer">
    Email này được gửi tự động từ hệ thống {settings.EMAIL_FROM_NAME}.<br>
    Vui lòng không trả lời email này.<br>
    © 2026 Công ty TNHH Hiệp Lợi
  </div>
</div>
</body></html>"""


def _send(to_email: str, subject: str, html_body: str) -> bool:
    """Gửi email qua Gmail SMTP TLS"""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.EMAIL_FROM_NAME} <{settings.SMTP_USER}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.sendmail(settings.SMTP_USER, to_email, msg.as_string())

        logger.info(f"[EMAIL OK] Sent to {to_email}: {subject}")
        print(f"[EMAIL OK] Sent to {to_email}: {subject}", flush=True)
        return True
    except smtplib.SMTPAuthenticationError as e:
        logger.error(f"[EMAIL FAIL] SMTP auth error: {e}")
        print(f"[EMAIL FAIL] SMTP auth error — kiểm tra SMTP_USER/SMTP_PASSWORD trong .env: {e}")
        return False
    except smtplib.SMTPException as e:
        logger.error(f"[EMAIL FAIL] SMTP error to {to_email}: {e}")
        print(f"[EMAIL FAIL] SMTP error to {to_email}: {e}")
        return False
    except Exception as e:
        logger.error(f"[EMAIL FAIL] Unexpected error to {to_email}: {e}")
        print(f"[EMAIL FAIL] Unexpected error to {to_email}: {e}")
        return False


def send_reset_password_email(to_email: str, full_name: str, reset_token: str, frontend_origin: str = None) -> bool:
    """Gửi email chứa link reset mật khẩu (hiệu lực 5 phút)"""
    print(f"[EMAIL] send_reset_password_email called → {to_email}", flush=True)
    base_url = (frontend_origin or "").rstrip("/") or settings.FRONTEND_URL
    reset_url = f"{base_url}/reset-password?token={reset_token}"
    name = full_name or to_email.split("@")[0]

    body = f"""
    <p>Xin chào <strong>{name}</strong>,</p>
    <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
    <a href="{reset_url}" class="btn">🔑 Đặt lại mật khẩu</a>
    <div class="warning">
      ⏱ Link có hiệu lực trong <strong>5 phút</strong> kể từ lúc gửi.<br>
      Nếu bạn không yêu cầu, hãy bỏ qua email này.
    </div>
    <hr class="divider">
    <p style="font-size:12px;color:#9ca3af">Hoặc copy link này vào trình duyệt:<br>
      <span style="color:#276EF1;word-break:break-all">{reset_url}</span>
    </p>"""

    html = _build_base_html("Đặt lại mật khẩu", body)
    return _send(to_email, f"[{settings.EMAIL_FROM_NAME}] Đặt lại mật khẩu", html)


def send_otp_email(to_email: str, full_name: str, otp_code: str, ip_address: str = "") -> bool:
    """Gửi mã OTP 6 số để xác thực đăng nhập từ IP lạ"""
    print(f"[EMAIL] send_otp_email called → {to_email} | OTP: {otp_code}", flush=True)
    name = full_name or to_email.split("@")[0]
    ip_info = f"từ IP <strong>{ip_address}</strong> " if ip_address else ""

    body = f"""
    <p>Xin chào <strong>{name}</strong>,</p>
    <p>Có yêu cầu đăng nhập {ip_info}vào tài khoản của bạn từ một thiết bị chưa được nhận dạng.</p>
    <div class="otp-box">
      <div class="otp-code">{otp_code}</div>
      <div class="otp-timer">⏱ Mã có hiệu lực trong <strong>5 phút</strong></div>
    </div>
    <div class="warning">
      ⚠️ Nếu bạn không thực hiện đăng nhập này, hãy đổi mật khẩu ngay.
    </div>"""

    html = _build_base_html("Xác thực đăng nhập", body)
    return _send(to_email, f"[{settings.EMAIL_FROM_NAME}] Mã OTP đăng nhập: {otp_code}", html)
