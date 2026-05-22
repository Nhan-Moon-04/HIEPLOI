import { useState, useEffect } from 'react';
import { Form, Input, Button, Result, Spin } from 'antd';
import { LockOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('checking'); // checking | valid | invalid | success
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [form] = Form.useForm();

  // Verify token khi load trang
  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }

    api.get(`/auth/reset-password/check?token=${token}`)
      .then(res => {
        setUsername(res.data.username || '');
        setStatus('valid');
      })
      .catch(() => setStatus('invalid'));
  }, [token]);

  // Đếm ngược sau khi đặt lại mật khẩu thành công
  useEffect(() => {
    if (status !== 'success') return;
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { navigate('/login'); clearInterval(t); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [status, navigate]);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        token,
        new_password: values.new_password,
      });
      setStatus('success');
    } catch (err) {
      form.setFields([{
        name: 'new_password',
        errors: [err.response?.data?.detail || 'Đặt lại mật khẩu thất bại'],
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="rp-box">
        {/* Header */}
        <div className="rp-header">
          <div className="rp-logo">HL</div>
          <h1 className="rp-title">Hiệp Lợi HR</h1>
          <p className="rp-sub">Hệ thống quản lý nhân sự</p>
        </div>

        {/* States */}
        {status === 'checking' && (
          <div className="rp-center">
            <Spin size="large" />
            <p style={{ marginTop: 12, color: '#6b7280', fontSize: 13 }}>Đang xác thực link...</p>
          </div>
        )}

        {status === 'invalid' && (
          <Result
            icon={<CloseCircleOutlined style={{ color: '#ef4444' }} />}
            title="Link không hợp lệ"
            subTitle="Link đặt lại mật khẩu đã hết hạn hoặc đã được sử dụng. Vui lòng yêu cầu link mới."
            extra={
              <Button type="primary" onClick={() => navigate('/login')}>
                Về trang đăng nhập
              </Button>
            }
          />
        )}

        {status === 'valid' && (
          <div className="rp-form-wrap">
            <div className="rp-form-title">
              <LockOutlined style={{ color: '#276EF1', marginRight: 8 }} />
              Đặt mật khẩu mới
              {username && <span className="rp-username"> cho @{username}</span>}
            </div>

            <Form form={form} layout="vertical" onFinish={onFinish} style={{ marginTop: 16 }}>
              <Form.Item
                name="new_password"
                label="Mật khẩu mới"
                rules={[
                  { required: true, message: 'Vui lòng nhập mật khẩu' },
                  { min: 6, message: 'Tối thiểu 6 ký tự' },
                ]}
                style={{ marginBottom: 12 }}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#9ca3af' }} />}
                  placeholder="Tối thiểu 6 ký tự"
                  size="large"
                />
              </Form.Item>

              <Form.Item
                name="confirm"
                label="Xác nhận mật khẩu"
                dependencies={['new_password']}
                rules={[
                  { required: true, message: 'Vui lòng xác nhận mật khẩu' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('new_password') === value)
                        return Promise.resolve();
                      return Promise.reject(new Error('Mật khẩu không khớp'));
                    },
                  }),
                ]}
                style={{ marginBottom: 20 }}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#9ca3af' }} />}
                  placeholder="Nhập lại mật khẩu mới"
                  size="large"
                />
              </Form.Item>

              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                size="large"
                style={{ borderRadius: 8, fontWeight: 600 }}
              >
                Đặt lại mật khẩu
              </Button>
            </Form>

            <div className="rp-expire-note">
              ⏱ Link có hiệu lực trong <strong>5 phút</strong>
            </div>
          </div>
        )}

        {status === 'success' && (
          <Result
            icon={<CheckCircleOutlined style={{ color: '#10b981', fontSize: 48 }} />}
            title="Mật khẩu đã được cập nhật!"
            subTitle="Tất cả phiên đăng nhập cũ đã bị đăng xuất để bảo mật."
            extra={
              <div style={{ textAlign: 'center' }}>
                <Button type="primary" onClick={() => navigate('/login')}>
                  Đăng nhập ngay
                </Button>
                <p style={{ marginTop: 10, color: '#9ca3af', fontSize: 12 }}>
                  Tự động chuyển sau <strong>{countdown}s</strong>
                </p>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
