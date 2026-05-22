import { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, message, Modal, Alert } from 'antd';
import {
  UserOutlined, LockOutlined, MailOutlined,
  ExclamationCircleOutlined, SafetyOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import api from '../api/client';

export default function Login() {
  const navigate = useNavigate();
  const { login, loading } = useAuthStore();

  // Login form
  const [loginError, setLoginError] = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [lockoutSecs, setLockoutSecs] = useState(0);
  const [lockoutTimer, setLockoutTimer] = useState(null);

  // Forgot password modal
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotCooldown, setForgotCooldown] = useState(0);

  // OTP modal
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpSessionId, setOtpSessionId] = useState(null);
  const [emailHint, setEmailHint] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState(null);
  const [otpExpiry, setOtpExpiry] = useState(300); // 5 phút

  const otpRefs = useRef([]);

  // ── Lockout countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    if (lockoutSecs <= 0) { setLockoutTimer(null); return; }
    const t = setTimeout(() => setLockoutSecs(s => s - 1), 1000);
    setLockoutTimer(t);
    return () => clearTimeout(t);
  }, [lockoutSecs]);

  // ── OTP countdown ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!otpOpen || otpExpiry <= 0) return;
    const t = setInterval(() => setOtpExpiry(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [otpOpen, otpExpiry]);

  // ── Forgot cooldown ────────────────────────────────────────────────────────
  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const t = setInterval(() => setForgotCooldown(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [forgotCooldown]);

  const fmtSecs = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
  };

  // ── Login submit ───────────────────────────────────────────────────────────
  const onFinish = async (values) => {
    setLoginError(null);
    setAttemptsLeft(null);

    const result = await login(values.username, values.password);

    if (result.success) {
      message.success('Đăng nhập thành công!');
      navigate('/dashboard');
      return;
    }

    // OTP required
    if (result.otp_required) {
      setOtpSessionId(result.otp_session_id);
      setEmailHint(result.email_hint || '');
      setOtpExpiry(300);
      setOtpCode('');
      setOtpError(null);
      setOtpOpen(true);
      return;
    }

    // Lockout
    if (result.lockout_seconds) {
      setLockoutSecs(result.lockout_seconds);
      setLoginError(result.error);
      return;
    }

    // Attempts warning
    if (result.attempts_remaining !== undefined) {
      setAttemptsLeft(result.attempts_remaining);
    }

    setLoginError(result.error);
  };

  // ── OTP verify ─────────────────────────────────────────────────────────────
  const handleOtpVerify = async () => {
    if (otpCode.length !== 6) { setOtpError('Nhập đủ 6 số OTP'); return; }
    setOtpLoading(true);
    setOtpError(null);
    try {
      const res = await api.post('/auth/otp/verify', {
        otp_session_id: otpSessionId,
        code: otpCode,
      });
      useAuthStore.getState().setAuthFromToken(res.data);
      setOtpOpen(false);
      message.success('Xác thực thành công!');
      navigate('/dashboard');
    } catch (err) {
      setOtpError(err.response?.data?.detail || 'Mã OTP không đúng');
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Forgot password ────────────────────────────────────────────────────────
  const handleForgotSend = async () => {
    if (!forgotEmail.trim()) { message.warning('Nhập email hoặc username'); return; }
    setForgotLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: forgotEmail.trim() });
      setForgotSent(true);
      setForgotCooldown(60);
    } catch (err) {
      if (err.response?.status === 429) {
        const retryAfter = parseInt(err.response.headers['retry-after'] || '900');
        setForgotCooldown(retryAfter);
        message.error(err.response.data?.detail || 'Gửi quá nhiều lần. Thử lại sau.');
      } else {
        message.error('Có lỗi xảy ra. Thử lại sau.');
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgot = () => {
    setForgotOpen(false);
    setTimeout(() => { setForgotSent(false); setForgotEmail(''); }, 300);
  };

  return (
    <div className="login-page">
      <div className="login-box">
        {/* Logo */}
        <div className="title">
          <div className="login-logo">HL</div>
          <h1>Hiệp Lợi Group</h1>
          <p>Hệ thống quản lý nhân sự &amp; chấm công</p>
        </div>

        {/* Lockout alert */}
        {lockoutSecs > 0 && (
          <Alert
            type="error"
            icon={<ClockCircleOutlined />}
            showIcon
            style={{ marginBottom: 16, borderRadius: 8, fontSize: 13 }}
            message={
              <span>
                Tài khoản tạm thời bị khoá — Thử lại sau{' '}
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtSecs(lockoutSecs)}
                </strong>
              </span>
            }
          />
        )}

        {/* Attempts warning */}
        {attemptsLeft !== null && attemptsLeft > 0 && lockoutSecs === 0 && (
          <Alert
            type="warning"
            icon={<ExclamationCircleOutlined />}
            showIcon
            style={{ marginBottom: 16, borderRadius: 8, fontSize: 12 }}
            message={`Còn ${attemptsLeft} lần thử trước khi tài khoản bị khoá tạm thời`}
          />
        )}

        <Form
          layout="vertical"
          onFinish={onFinish}
          size="large"
          autoComplete="off"
          disabled={lockoutSecs > 0}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}
            style={{ marginBottom: 12 }}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#9ba8bf' }} />}
              placeholder="Tên đăng nhập"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Nhập mật khẩu' }]}
            style={{ marginBottom: loginError ? 8 : 16 }}
            validateStatus={loginError && lockoutSecs === 0 ? 'error' : undefined}
            help={loginError && lockoutSecs === 0 ? loginError : undefined}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#9ba8bf' }} />}
              placeholder="Mật khẩu"
            />
          </Form.Item>

          {/* Quên mật khẩu link */}
          <div style={{ textAlign: 'right', marginBottom: 16, marginTop: -4 }}>
            <button
              type="button"
              className="login-forgot-link"
              onClick={() => setForgotOpen(true)}
            >
              Quên mật khẩu?
            </button>
          </div>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              disabled={lockoutSecs > 0}
              style={{ height: 42, fontSize: 14, fontWeight: 600, borderRadius: 8 }}
            >
              {lockoutSecs > 0 ? `Thử lại sau ${fmtSecs(lockoutSecs)}` : 'Đăng nhập'}
            </Button>
          </Form.Item>
        </Form>
      </div>

      {/* ── Modal Quên mật khẩu ── */}
      <Modal
        title={
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            <MailOutlined style={{ color: '#276EF1', marginRight: 8 }} />
            Quên mật khẩu
          </span>
        }
        open={forgotOpen}
        onCancel={closeForgot}
        footer={null}
        width={380}
        centered
      >
        {!forgotSent ? (
          <div style={{ padding: '8px 0' }}>
            <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
              Nhập email hoặc tên đăng nhập. Chúng tôi sẽ gửi link đặt lại mật khẩu
              (có hiệu lực <strong>5 phút</strong>).
            </p>
            <Input
              prefix={<MailOutlined style={{ color: '#9ca3af' }} />}
              placeholder="Email hoặc tên đăng nhập"
              size="large"
              value={forgotEmail}
              onChange={e => setForgotEmail(e.target.value)}
              onPressEnter={handleForgotSend}
              disabled={forgotCooldown > 0}
              style={{ marginBottom: 16 }}
            />
            <Button
              type="primary"
              block
              size="large"
              loading={forgotLoading}
              disabled={forgotCooldown > 0}
              onClick={handleForgotSend}
              style={{ borderRadius: 8, fontWeight: 600 }}
            >
              {forgotCooldown > 0
                ? `Gửi lại sau ${fmtSecs(forgotCooldown)}`
                : 'Gửi link đặt lại mật khẩu'
              }
            </Button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📬</div>
            <h3 style={{ fontWeight: 700, color: '#1a2233', marginBottom: 8 }}>Email đã được gửi!</h3>
            <p style={{ color: '#6b7280', fontSize: 13 }}>
              Kiểm tra hộp thư của bạn và nhấn vào link trong email để đặt lại mật khẩu.
              Link có hiệu lực <strong>5 phút</strong>.
            </p>
            {forgotCooldown > 0 && (
              <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 12 }}>
                Gửi lại sau{' '}
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtSecs(forgotCooldown)}
                </strong>
              </p>
            )}
            <Button
              style={{ marginTop: 16, borderRadius: 8 }}
              onClick={closeForgot}
            >
              Đóng
            </Button>
          </div>
        )}
      </Modal>

      {/* ── Modal OTP ── */}
      <Modal
        title={
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            <SafetyOutlined style={{ color: '#276EF1', marginRight: 8 }} />
            Xác thực đăng nhập
          </span>
        }
        open={otpOpen}
        onCancel={() => setOtpOpen(false)}
        footer={null}
        width={380}
        centered
        closable={!otpLoading}
        maskClosable={false}
      >
        <div style={{ padding: '8px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
          <p style={{ color: '#374151', fontSize: 13, marginBottom: 4 }}>
            Phát hiện đăng nhập từ <strong>thiết bị mới</strong>.
          </p>
          {emailHint && (
            <p style={{ color: '#6b7280', fontSize: 12, marginBottom: 16 }}>
              Mã OTP đã gửi về: <strong>{emailHint}</strong>
            </p>
          )}

          {/* 6 ô nhập OTP */}
          <div className="otp-input-row">
            {[0,1,2,3,4,5].map(i => (
              <input
                key={i}
                ref={el => otpRefs.current[i] = el}
                className="otp-digit"
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={otpCode[i] || ''}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  const arr = otpCode.split('');
                  arr[i] = val;
                  const next = arr.join('').slice(0, 6);
                  setOtpCode(next);
                  if (val && i < 5) otpRefs.current[i + 1]?.focus();
                }}
                onKeyDown={e => {
                  if (e.key === 'Backspace' && !otpCode[i] && i > 0)
                    otpRefs.current[i - 1]?.focus();
                }}
              />
            ))}
          </div>

          {otpError && (
            <Alert type="error" message={otpError} style={{ marginTop: 12, borderRadius: 8, fontSize: 12 }} />
          )}

          {/* Timer */}
          <div style={{ margin: '12px 0', fontSize: 12, color: otpExpiry < 60 ? '#ef4444' : '#9ca3af' }}>
            {otpExpiry > 0
              ? <>⏱ Mã hết hạn sau <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtSecs(otpExpiry)}</strong></>
              : <span style={{ color: '#ef4444' }}>⚠️ Mã OTP đã hết hạn. Vui lòng đăng nhập lại.</span>
            }
          </div>

          <Button
            type="primary"
            block
            size="large"
            loading={otpLoading}
            disabled={otpCode.length !== 6 || otpExpiry === 0}
            onClick={handleOtpVerify}
            style={{ borderRadius: 8, fontWeight: 600 }}
          >
            Xác nhận
          </Button>

          <Button
            type="text"
            style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}
            onClick={() => setOtpOpen(false)}
          >
            Huỷ — Đăng nhập lại
          </Button>
        </div>
      </Modal>
    </div>
  );
}
