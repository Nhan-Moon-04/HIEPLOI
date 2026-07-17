import { useState, useEffect, useRef } from 'react';
import { Form, Input, Button, message, Modal, Alert } from 'antd';
import {
  UserOutlined, LockOutlined, MailOutlined,
  ExclamationCircleOutlined, SafetyOutlined, ClockCircleOutlined,
  SendOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';
import api from '../api/client';

export default function Login() {
  const navigate = useNavigate();
  const { login, loading } = useAuthStore();
  const [form] = Form.useForm();

  // ── Login state ───────────────────────────────────────────────────────────
  const [loginError, setLoginError]       = useState(null);
  const [attemptsLeft, setAttemptsLeft]   = useState(null);
  const [lockoutSecs, setLockoutSecs]     = useState(0);

  // ── Forgot password modal ─────────────────────────────────────────────────
  const [forgotOpen, setForgotOpen]           = useState(false);
  const [forgotEmail, setForgotEmail]         = useState('');
  const [forgotLoading, setForgotLoading]     = useState(false);
  const [forgotSent, setForgotSent]           = useState(false);
  const [forgotCooldown, setForgotCooldown]   = useState(0);
  const [forgotError, setForgotError]         = useState(null);

  // ── OTP modal ─────────────────────────────────────────────────────────────
  const [otpOpen, setOtpOpen]                     = useState(false);
  const [otpSessionId, setOtpSessionId]           = useState(null);
  const [emailHint, setEmailHint]                 = useState('');
  const [otpCode, setOtpCode]                     = useState('');
  const [otpLoading, setOtpLoading]               = useState(false);
  const [otpError, setOtpError]                   = useState(null);
  const [otpExpiry, setOtpExpiry]                 = useState(300);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [otpResendLoading, setOtpResendLoading]   = useState(false);

  const otpRefs = useRef([]);

  // ── Countdown: lockout ────────────────────────────────────────────────────
  useEffect(() => {
    if (lockoutSecs <= 0) return;
    const t = setTimeout(() => setLockoutSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [lockoutSecs]);

  // ── Countdown: OTP expiry ─────────────────────────────────────────────────
  useEffect(() => {
    if (!otpOpen || otpExpiry <= 0) return;
    const t = setInterval(() => setOtpExpiry(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [otpOpen, otpExpiry]);

  // ── Countdown: forgot cooldown ────────────────────────────────────────────
  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const t = setInterval(() => setForgotCooldown(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [forgotCooldown]);

  // ── Countdown: OTP resend cooldown ────────────────────────────────────────
  useEffect(() => {
    if (otpResendCooldown <= 0) return;
    const t = setInterval(() => setOtpResendCooldown(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [otpResendCooldown]);

  // Auto-focus ô OTP đầu tiên khi mở modal
  useEffect(() => {
    if (otpOpen) {
      setTimeout(() => otpRefs.current[0]?.focus(), 150);
    }
  }, [otpOpen]);

  const fmtSecs = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
  };

  // ── Login submit ──────────────────────────────────────────────────────────
  const onFinish = async (values) => {
    setLoginError(null);
    setAttemptsLeft(null);

    const result = await login(values.username, values.password);

    if (result.success) {
      message.success('Đăng nhập thành công!');
      navigate('/dashboard');
      return;
    }

    // OTP required (thiết bị mới)
    if (result.otp_required) {
      setOtpSessionId(result.otp_session_id);
      setEmailHint(result.email_hint || '');
      setOtpExpiry(300);
      setOtpCode('');
      setOtpError(null);
      setOtpResendCooldown(result.resend_cooldown_secs ?? 120);
      setOtpOpen(true);
      return;
    }

    // Lockout (429)
    if (result.lockout_seconds) {
      setLockoutSecs(result.lockout_seconds);
      setLoginError(result.error);
      // Xoá cả 2 ô khi bị khoá
      form.setFieldValue('password', '');
      return;
    }

    // Sai mật khẩu: chỉ xóa ô password, giữ nguyên username
    form.setFieldValue('password', '');
    // Hiển thị lỗi inline dưới ô password
    form.setFields([{
      name: 'password',
      errors: [result.error || 'Mật khẩu không đúng'],
    }]);

    if (result.attempts_remaining !== undefined) {
      setAttemptsLeft(result.attempts_remaining);
    }

    setLoginError(result.error);
  };

  // ── OTP verify ────────────────────────────────────────────────────────────
  const handleOtpVerify = async () => {
    if (otpCode.length !== 6) { setOtpError('Vui lòng nhập đủ 6 số OTP'); return; }
    setOtpLoading(true);
    setOtpError(null);
    try {
      const res = await api.post('/auth/otp/verify', {
        otp_session_id: otpSessionId,
        code: otpCode,
        device_id: localStorage.getItem('device_id'),
      });
      useAuthStore.getState().setAuthFromToken(res.data);
      setOtpOpen(false);
      message.success('Xác thực thành công!');
      navigate('/dashboard');
    } catch (err) {
      const errMsg = err.response?.data?.detail || 'Mã OTP không đúng';
      setOtpError(errMsg);
      // Xóa OTP khi sai để nhập lại
      setOtpCode('');
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } finally {
      setOtpLoading(false);
    }
  };

  // ── OTP resend ────────────────────────────────────────────────────────────
  const handleOtpResend = async () => {
    setOtpResendLoading(true);
    try {
      const res = await api.post('/auth/otp/resend', { otp_session_id: otpSessionId });
      setOtpResendCooldown(res.data.resend_cooldown_secs ?? 120);
      setOtpExpiry(300);
      setOtpCode('');
      setOtpError(null);
      message.success('Đã gửi lại mã OTP về email!');
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      const retryAfter = parseInt(err.response?.headers?.['retry-after'] || '120');
      setOtpResendCooldown(retryAfter);
      message.error(err.response?.data?.detail || 'Không thể gửi lại. Thử lại sau.');
    } finally {
      setOtpResendLoading(false);
    }
  };

  // ── Forgot password send ──────────────────────────────────────────────────
  const handleForgotSend = async () => {
    if (!forgotEmail.trim()) {
      setForgotError('Vui lòng nhập email hoặc tên đăng nhập');
      return;
    }
    setForgotLoading(true);
    setForgotError(null);
    try {
      await api.post('/auth/forgot-password', {
        email: forgotEmail.trim(),
        frontend_origin: window.location.origin,
      });
      setForgotSent(true);
      setForgotCooldown(60);
    } catch (err) {
      if (err.response?.status === 429) {
        const retryAfter = parseInt(err.response.headers['retry-after'] || '900');
        setForgotCooldown(retryAfter);
        setForgotError(err.response.data?.detail || 'Gửi quá nhiều lần. Thử lại sau.');
      } else {
        setForgotError('Có lỗi xảy ra. Vui lòng thử lại sau.');
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgotModal = () => {
    setForgotOpen(false);
    setTimeout(() => {
      setForgotSent(false);
      setForgotEmail('');
      setForgotError(null);
    }, 300);
  };

  const handleOtpInput = (i, e) => {
    const val = e.target.value.replace(/\D/g, '');
    const arr = otpCode.split('');
    arr[i] = val;
    const next = arr.join('').slice(0, 6);
    setOtpCode(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i, e) => {
    if (e.key === 'Backspace') {
      if (otpCode[i]) {
        // Xóa ký tự hiện tại
        const arr = otpCode.split('');
        arr[i] = '';
        setOtpCode(arr.join(''));
      } else if (i > 0) {
        otpRefs.current[i - 1]?.focus();
      }
    } else if (e.key === 'Enter' && otpCode.length === 6) {
      handleOtpVerify();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    setOtpCode(pasted);
    const nextIdx = Math.min(pasted.length, 5);
    otpRefs.current[nextIdx]?.focus();
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="login-page">
      {/* Decorative blobs */}
      <div className="login-blob login-blob-1" />
      <div className="login-blob login-blob-2" />

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
            className="login-alert"
            message={
              <span>
                Tài khoản tạm thời bị khoá — Thử lại sau{' '}
                <strong className="login-countdown">{fmtSecs(lockoutSecs)}</strong>
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
            className="login-alert"
            message={`Còn ${attemptsLeft} lần thử trước khi tài khoản bị khoá tạm thời`}
          />
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          size="large"
          autoComplete="off"
          disabled={lockoutSecs > 0}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}
            style={{ marginBottom: 14 }}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#9ba8bf' }} />}
              placeholder="Tên đăng nhập"
              className="login-input"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Nhập mật khẩu' }]}
            style={{ marginBottom: 6 }}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#9ba8bf' }} />}
              placeholder="Mật khẩu"
              className="login-input"
            />
          </Form.Item>

          {/* Quên mật khẩu link — nằm ngay dưới ô password */}
          <div style={{ textAlign: 'right', marginBottom: 20 }}>
            <button
              type="button"
              className="login-forgot-link"
              onClick={() => {
                setForgotOpen(true);
                setForgotError(null);
              }}
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
              className="login-btn"
            >
              {lockoutSecs > 0 ? `Thử lại sau ${fmtSecs(lockoutSecs)}` : 'Đăng nhập'}
            </Button>
          </Form.Item>
        </Form>
      </div>

      {/* ══════════════════════════════════════════════════════
          Modal Quên mật khẩu
      ══════════════════════════════════════════════════════ */}
      <Modal
        title={null}
        open={forgotOpen}
        onCancel={closeForgotModal}
        footer={null}
        width={400}
        centered
        className="login-modal"
        destroyOnClose
      >
        <div className="lm-header">
          <div className="lm-icon lm-icon--blue">
            <MailOutlined />
          </div>
          <h2 className="lm-title">Quên mật khẩu</h2>
          <p className="lm-sub">
            {!forgotSent
              ? 'Nhập email hoặc tên đăng nhập để nhận link đặt lại mật khẩu'
              : 'Kiểm tra hộp thư email của bạn'}
          </p>
        </div>

        {!forgotSent ? (
          <div className="lm-body">
            <div className="lm-field-wrap">
              <Input
                prefix={<MailOutlined style={{ color: '#9ca3af' }} />}
                placeholder="Email hoặc tên đăng nhập"
                size="large"
                value={forgotEmail}
                onChange={e => { setForgotEmail(e.target.value); setForgotError(null); }}
                onPressEnter={handleForgotSend}
                disabled={forgotCooldown > 0 || forgotLoading}
                className="login-input"
                autoFocus
              />
              {forgotError && (
                <div className="lm-field-error">{forgotError}</div>
              )}
            </div>

            <Button
              type="primary"
              block
              size="large"
              loading={forgotLoading}
              disabled={forgotCooldown > 0}
              onClick={handleForgotSend}
              icon={<SendOutlined />}
              className="login-btn"
            >
              {forgotCooldown > 0
                ? `Gửi lại sau ${fmtSecs(forgotCooldown)}`
                : 'Gửi link đặt lại mật khẩu'}
            </Button>

            <button type="button" className="lm-cancel-link" onClick={closeForgotModal}>
              Huỷ — quay lại đăng nhập
            </button>
          </div>
        ) : (
          <div className="lm-body lm-body--center">
            <div className="lm-success-icon">
              <CheckCircleOutlined />
            </div>
            <h3 className="lm-success-title">Email đã được gửi!</h3>
            <p className="lm-success-desc">
              Nếu <strong>{forgotEmail}</strong> tồn tại trong hệ thống, bạn sẽ nhận được email
              chứa link đặt lại mật khẩu. Link có hiệu lực <strong>5 phút</strong>.
            </p>
            <p className="lm-success-spam">
              Không thấy email? Kiểm tra thư mục Spam / Junk.
            </p>

            {forgotCooldown > 0 ? (
              <p className="lm-resend-wait">
                Gửi lại sau <strong className="login-countdown">{fmtSecs(forgotCooldown)}</strong>
              </p>
            ) : (
              <button
                type="button"
                className="lm-resend-btn"
                onClick={() => { setForgotSent(false); setForgotError(null); }}
              >
                Gửi lại email
              </button>
            )}

            <Button block style={{ marginTop: 16, borderRadius: 8 }} onClick={closeForgotModal}>
              Đóng
            </Button>
          </div>
        )}
      </Modal>

      {/* ══════════════════════════════════════════════════════
          Modal OTP — Thiết bị mới
      ══════════════════════════════════════════════════════ */}
      <Modal
        title={null}
        open={otpOpen}
        onCancel={() => !otpLoading && setOtpOpen(false)}
        footer={null}
        width={400}
        centered
        className="login-modal"
        closable={!otpLoading}
        maskClosable={false}
        destroyOnClose
      >
        <div className="lm-header">
          <div className="lm-icon lm-icon--purple">
            <SafetyOutlined />
          </div>
          <h2 className="lm-title">Xác thực thiết bị mới</h2>
          <p className="lm-sub">
            Phát hiện đăng nhập từ <strong>thiết bị chưa được nhận diện</strong>
          </p>
        </div>

        <div className="lm-body lm-body--center">
          {emailHint && (
            <div className="otp-email-hint">
              📧 Mã OTP đã gửi tới: <strong>{emailHint}</strong>
            </div>
          )}

          {/* 6 ô OTP */}
          <div className="otp-input-row" onPaste={handleOtpPaste}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <input
                key={i}
                ref={el => (otpRefs.current[i] = el)}
                className={`otp-digit${otpCode[i] ? ' otp-digit--filled' : ''}${otpError ? ' otp-digit--error' : ''}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={otpCode[i] || ''}
                onChange={e => handleOtpInput(i, e)}
                onKeyDown={e => handleOtpKeyDown(i, e)}
                disabled={otpLoading || otpExpiry === 0}
                autoComplete="one-time-code"
              />
            ))}
          </div>

          {/* OTP error */}
          {otpError && (
            <div className="otp-error-msg">
              <ExclamationCircleOutlined style={{ marginRight: 6 }} />
              {otpError}
            </div>
          )}

          {/* Timer */}
          <div className={`otp-timer${otpExpiry < 60 ? ' otp-timer--urgent' : ''}`}>
            {otpExpiry > 0 ? (
              <>⏱ Mã hết hạn sau <strong className="login-countdown">{fmtSecs(otpExpiry)}</strong></>
            ) : (
              <span className="otp-expired">⚠️ Mã OTP đã hết hạn — vui lòng đăng nhập lại</span>
            )}
          </div>

          {/* Confirm button */}
          <Button
            type="primary"
            block
            size="large"
            loading={otpLoading}
            disabled={otpCode.length !== 6 || otpExpiry === 0}
            onClick={handleOtpVerify}
            className="login-btn"
          >
            Xác nhận
          </Button>

          {/* Resend */}
          <div className="otp-resend-row">
            <span className="otp-resend-label">Không nhận được email?</span>
            {otpResendCooldown > 0 ? (
              <span className="otp-resend-wait">
                Gửi lại sau <strong className="login-countdown">{fmtSecs(otpResendCooldown)}</strong>
              </span>
            ) : (
              <Button
                type="link"
                size="small"
                loading={otpResendLoading}
                onClick={handleOtpResend}
                className="otp-resend-btn"
              >
                Gửi lại mã OTP
              </Button>
            )}
          </div>

          {/* Cancel */}
          <button
            type="button"
            className="lm-cancel-link"
            onClick={() => setOtpOpen(false)}
            disabled={otpLoading}
          >
            Huỷ — đăng nhập lại
          </button>
        </div>
      </Modal>
    </div>
  );
}
