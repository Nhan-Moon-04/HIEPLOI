import { useState } from 'react';
import { Form, Input, Button, message, Radio, Divider } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  BankOutlined,
  FormatPainterOutlined,
  SaveOutlined,
  CheckOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import useAuthStore from '../stores/authStore';
import useThemeStore from '../stores/themeStore';

const COLORS = [
  { name: 'Xanh MISA',     value: '#276EF1' },
  { name: 'Xanh chuyên',   value: '#4361ee' },
  { name: 'Tím hiện đại',  value: '#7209b7' },
  { name: 'Xanh ngọc',     value: '#06b6d4' },
  { name: 'Cam năng động', value: '#f77f00' },
  { name: 'Hồng quý phái', value: '#f72585' },
];

const NAV_ITEMS = [
  { key: 'profile',    icon: <UserOutlined />,         label: 'Hồ sơ cá nhân' },
  { key: 'company',   icon: <BankOutlined />,          label: 'Thông tin công ty' },
  { key: 'appearance',icon: <FormatPainterOutlined />, label: 'Giao diện' },
];

export default function Settings() {
  const { user } = useAuthStore();
  const { mode, primaryColor, setTheme } = useThemeStore();
  const [activeTab, setActiveTab] = useState('profile');

  const onFinishProfile = () => message.success('Đã cập nhật thông tin cá nhân');

  const onFinishPassword = (v) => {
    if (v.newPassword !== v.confirmPassword)
      return message.error('Mật khẩu xác nhận không khớp');
    message.success('Đã đổi mật khẩu thành công');
  };

  const onFinishCompany = () => message.success('Đã lưu thông tin công ty');

  return (
    <div className="att-page">
      {/* Title bar */}
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <h2 className="emp-title">Cài đặt hệ thống</h2>
          <div className="emp-stats">
            <div className="emp-stat-chip">Quản lý cấu hình cá nhân và thông tin tổ chức</div>
          </div>
        </div>
      </div>

      {/* Settings layout */}
      <div className="st-layout">
        {/* Left nav */}
        <nav className="st-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`st-nav-item${activeTab === item.key ? ' st-nav-item--active' : ''}`}
              onClick={() => setActiveTab(item.key)}
            >
              <span className="st-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Right content */}
        <div className="st-content">

          {/* ── Profile ── */}
          {activeTab === 'profile' && (
            <>
              <div className="st-section">
                <div className="st-section-head">
                  <div className="st-section-title">Thông tin tài khoản</div>
                  <div className="st-section-desc">Cập nhật thông tin cơ bản của bạn</div>
                </div>
                <Form
                  layout="vertical"
                  initialValues={{ username: user?.username, full_name: user?.full_name }}
                  onFinish={onFinishProfile}
                  className="st-form"
                >
                  <Form.Item label="Tên đăng nhập" name="username">
                    <Input disabled prefix={<UserOutlined style={{ color: '#9ca3af' }} />} />
                  </Form.Item>
                  <Form.Item label="Họ và tên" name="full_name" rules={[{ required: true, message: 'Nhập họ và tên' }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item label="Email" name="email">
                    <Input placeholder="Chưa cập nhật email" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" icon={<SaveOutlined />}
                    style={{ background: '#276EF1', borderColor: '#276EF1', borderRadius: 8 }}>
                    Lưu thay đổi
                  </Button>
                </Form>
              </div>

              <div className="st-section">
                <div className="st-section-head">
                  <div className="st-section-title">Đổi mật khẩu</div>
                  <div className="st-section-desc">Sử dụng mật khẩu mạnh để bảo mật tài khoản</div>
                </div>
                <Form layout="vertical" onFinish={onFinishPassword} className="st-form">
                  <Form.Item label="Mật khẩu hiện tại" name="oldPassword" rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}>
                    <Input.Password />
                  </Form.Item>
                  <Form.Item label="Mật khẩu mới" name="newPassword" rules={[{ required: true, message: 'Nhập mật khẩu mới' }]}>
                    <Input.Password />
                  </Form.Item>
                  <Form.Item label="Xác nhận mật khẩu mới" name="confirmPassword" rules={[{ required: true, message: 'Xác nhận mật khẩu' }]}>
                    <Input.Password />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" icon={<LockOutlined />}
                    style={{ background: '#276EF1', borderColor: '#276EF1', borderRadius: 8 }}>
                    Cập nhật mật khẩu
                  </Button>
                </Form>
              </div>
            </>
          )}

          {/* ── Company ── */}
          {activeTab === 'company' && (
            <div className="st-section">
              <div className="st-section-head">
                <div className="st-section-title">Thông tin tổ chức</div>
                <div className="st-section-desc">Hiển thị trên các báo cáo Excel và phiếu lương</div>
              </div>
              <Form
                layout="vertical"
                initialValues={{
                  name: 'CÔNG TY TNHH HIỆP LỢI',
                  mst: '3701609885',
                  address: 'Số 123, Đường ABC, KCN VSIP, Bình Dương',
                }}
                onFinish={onFinishCompany}
                className="st-form"
              >
                <Form.Item label="Tên công ty" name="name" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item label="Mã số thuế" name="mst">
                  <Input />
                </Form.Item>
                <Form.Item label="Địa chỉ" name="address">
                  <Input.TextArea rows={3} />
                </Form.Item>
                <Form.Item label="Số điện thoại liên hệ" name="phone">
                  <Input />
                </Form.Item>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />}
                  style={{ background: '#276EF1', borderColor: '#276EF1', borderRadius: 8 }}>
                  Lưu cấu hình
                </Button>
              </Form>
            </div>
          )}

          {/* ── Appearance ── */}
          {activeTab === 'appearance' && (
            <>
              <div className="st-section">
                <div className="st-section-head">
                  <div className="st-section-title">Chế độ hiển thị</div>
                  <div className="st-section-desc">Chọn giao diện sáng hoặc tối</div>
                </div>
                <div className="st-mode-row">
                  <button
                    className={`st-mode-card${mode === 'light' ? ' st-mode-card--active' : ''}`}
                    onClick={() => setTheme('light', primaryColor)}
                  >
                    <SunOutlined className="st-mode-icon" />
                    <div className="st-mode-label">Sáng (Light)</div>
                    {mode === 'light' && <CheckOutlined className="st-mode-check" />}
                  </button>
                  <button
                    className={`st-mode-card${mode === 'dark' ? ' st-mode-card--active' : ''}`}
                    onClick={() => setTheme('dark', primaryColor)}
                  >
                    <MoonOutlined className="st-mode-icon" />
                    <div className="st-mode-label">Tối (Dark)</div>
                    {mode === 'dark' && <CheckOutlined className="st-mode-check" />}
                  </button>
                </div>
              </div>

              <div className="st-section">
                <div className="st-section-head">
                  <div className="st-section-title">Màu chủ đạo</div>
                  <div className="st-section-desc">Áp dụng cho toàn bộ giao diện</div>
                </div>
                <div className="st-colors">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      className={`st-color-item${primaryColor === c.value ? ' st-color-item--active' : ''}`}
                      onClick={() => setTheme(mode, c.value)}
                      title={c.name}
                    >
                      <div className="st-color-dot" style={{ background: c.value }}>
                        {primaryColor === c.value && <CheckOutlined style={{ color: '#fff', fontSize: 12 }} />}
                      </div>
                      <div className="st-color-name">{c.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
