import { Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../stores/authStore';

export default function Login() {
  const navigate = useNavigate();
  const { login, loading } = useAuthStore();

  const onFinish = async (values) => {
    const result = await login(values.username, values.password);
    if (result.success) {
      message.success('Dang nhap thanh cong!');
      navigate('/dashboard');
    } else {
      message.error(result.error);
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="title">
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #4361ee, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: '#fff', fontSize: 20, fontWeight: 800 }}>
            HL
          </div>
          <h1>Hiep Loi Group</h1>
          <p>He thong quan ly nhan su & cham cong</p>
        </div>

        <Form layout="vertical" onFinish={onFinish} size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: 'Nhap ten dang nhap' }]}>
            <Input prefix={<UserOutlined style={{ color: '#9ba8bf' }} />} placeholder="Ten dang nhap" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'Nhap mat khau' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#9ba8bf' }} />} placeholder="Mat khau" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={loading} block
              style={{ height: 42, fontSize: 14, fontWeight: 600, borderRadius: 8 }}>
              Dang nhap
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 20, color: '#9ba8bf', fontSize: 11 }}>
          Mac dinh: <b style={{ color: '#6b7a99' }}>admin / admin123</b>
        </div>
      </div>
    </div>
  );
}
