import { useState } from 'react';
import { Form, Input, Button, message, Alert } from 'antd';
import { LockOutlined, MailOutlined, SafetyCertificateOutlined, LogoutOutlined } from '@ant-design/icons';
import useAuthStore from '../stores/authStore';

export default function SetupWizard() {
  const { user, completeSetup, logout } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const onFinish = async (values) => {
    const { password, email } = values;
    setErrorMsg(null);
    setLoading(true);

    const result = await completeSetup(password, email);
    setLoading(false);

    if (result.success) {
      message.success('Thiết lập tài khoản thành công! Chào mừng bạn đến với hệ thống.');
      // Hoàn tất xong sẽ tự động chuyển hướng nhờ logic ở App.jsx
    } else {
      setErrorMsg(result.error);
    }
  };

  return (
    <div className="login-page">
      <div className="rp-box" style={{ backdropFilter: 'blur(20px)', background: 'rgba(255, 255, 255, 0.85)', border: '1px solid rgba(255, 255, 255, 0.4)' }}>
        <div className="rp-header">
          <div className="rp-logo" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <SafetyCertificateOutlined style={{ fontSize: 24, color: '#fff' }} />
          </div>
          <h1 className="rp-title" style={{ fontSize: 22, fontWeight: 800, background: 'linear-gradient(135deg, #0f172a, #2563eb)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Thiết lập tài khoản lần đầu
          </h1>
          <p className="rp-sub" style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>
            Xin chào <strong style={{ color: '#2563eb' }}>{user?.full_name || user?.username}</strong>. Để bảo mật tài khoản, vui lòng cập nhật mật khẩu mới và địa chỉ Gmail trước khi tiếp tục.
          </p>
        </div>

        {errorMsg && (
          <Alert
            title={errorMsg}
            type="error"
            showIcon
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        <Form
          layout="vertical"
          onFinish={onFinish}
          size="large"
          autoComplete="off"
        >
          <Form.Item
            label="Mật khẩu mới"
            name="password"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu mới' },
              { min: 6, message: 'Mật khẩu phải chứa ít nhất 6 ký tự' }
            ]}
            hasFeedback
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Nhập mật khẩu mới"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item
            label="Xác nhận mật khẩu mới"
            name="confirmPassword"
            dependencies={['password']}
            hasFeedback
            rules={[
              { required: true, message: 'Vui lòng xác nhận mật khẩu mới' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
              placeholder="Nhập lại mật khẩu mới"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item
            label="Địa chỉ Gmail (Nhận mã OTP)"
            name="email"
            rules={[
              { required: true, message: 'Vui lòng nhập email nhận OTP' },
              { type: 'email', message: 'Địa chỉ email không hợp lệ' },
              {
                validator(_, value) {
                  if (!value || value.endsWith('@gmail.com')) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Hệ thống chỉ hỗ trợ địa chỉ Gmail (@gmail.com)'));
                }
              }
            ]}
            hasFeedback
          >
            <Input
              prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
              placeholder="tenban@gmail.com"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 24, marginBottom: 12 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                borderRadius: 8,
                height: 44,
                fontWeight: 600,
                fontSize: 14,
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
              }}
            >
              Hoàn tất thiết lập &amp; Đăng nhập
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={logout}
            style={{ color: '#ef4444', fontSize: 13, fontWeight: 500 }}
          >
            Đăng xuất tài khoản
          </Button>
        </div>
      </div>
    </div>
  );
}
