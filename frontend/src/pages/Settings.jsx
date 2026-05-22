import { useState } from 'react';
import { Form, Input, Button, message } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  BankOutlined,
  FormatPainterOutlined,
  SaveOutlined,
  CheckOutlined,
  SunOutlined,
  MoonOutlined,
  LoadingOutlined,
  KeyOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import useAuthStore from '../stores/authStore';
import useThemeStore from '../stores/themeStore';

const COLORS = [
  { name: 'Xanh MISA',     value: '#276EF1' },
  { name: 'Xanh chuyên',   value: '#4361ee' },
  { name: 'Tím',           value: '#7209b7' },
  { name: 'Ngọc',          value: '#06b6d4' },
  { name: 'Cam',           value: '#f77f00' },
  { name: 'Hồng',          value: '#f72585' },
];

const NAV_ITEMS = [
  { key: 'profile',     icon: <IdcardOutlined />,      label: 'Hồ sơ & Mật khẩu' },
  { key: 'company',    icon: <BankOutlined />,          label: 'Công ty' },
  { key: 'appearance', icon: <FormatPainterOutlined />, label: 'Giao diện' },
];

const ROLE_LABELS = {
  admin: 'Quản trị viên',
  accountant: 'Kế toán',
  import_export: 'Xuất nhập khẩu',
  worker: 'Công nhân',
};

export default function Settings() {
  const { user, updateProfile, changePassword } = useAuthStore();
  const { mode, primaryColor, setTheme } = useThemeStore();
  const [activeTab, setActiveTab] = useState('profile');
  const [profileLoading, setProfileLoading] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwForm] = Form.useForm();

  const onFinishProfile = async (values) => {
    setProfileLoading(true);
    const result = await updateProfile({ full_name: values.full_name });
    setProfileLoading(false);
    result.success ? message.success('Đã cập nhật thông tin') : message.error(result.error);
  };

  const onFinishPassword = async (values) => {
    setPwLoading(true);
    const result = await changePassword(values.oldPassword, values.newPassword, values.confirmPassword);
    setPwLoading(false);
    if (result.success) {
      message.success('Đã đổi mật khẩu thành công');
      pwForm.resetFields();
    } else {
      message.error(result.error);
    }
  };

  return (
    <div className="att-page">
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <h2 className="emp-title">Cài đặt</h2>
          <div className="emp-stats">
            <div className="emp-stat-chip">Quản lý tài khoản & giao diện</div>
          </div>
        </div>
      </div>

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

        <div className="st-content">

          {/* ── Hồ sơ & Mật khẩu ── */}
          {activeTab === 'profile' && (
            <div className="st-profile-grid">

              {/* Card: Thông tin tài khoản */}
              <div className="st-card">
                <div className="st-card-head">
                  <UserOutlined className="st-card-icon" />
                  <div>
                    <div className="st-card-title">Thông tin tài khoản</div>
                    <div className="st-card-desc">Cập nhật họ tên hiển thị</div>
                  </div>
                </div>

                {/* User badge */}
                <div className="st-user-badge">
                  <div className="st-user-avatar">
                    {(user?.full_name || user?.username || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="st-user-name">{user?.full_name || user?.username}</div>
                    <div className="st-user-role">{ROLE_LABELS[user?.role] || user?.role}</div>
                  </div>
                </div>

                <Form
                  layout="vertical"
                  initialValues={{ full_name: user?.full_name }}
                  onFinish={onFinishProfile}
                  className="st-form-compact"
                >
                  <Form.Item
                    label="Tên đăng nhập"
                    style={{ marginBottom: 10 }}
                  >
                    <Input
                      disabled
                      value={user?.username}
                      prefix={<UserOutlined style={{ color: '#9ca3af' }} />}
                      size="small"
                    />
                  </Form.Item>
                  <Form.Item
                    label="Họ và tên"
                    name="full_name"
                    rules={[{ required: true, message: 'Nhập họ và tên' }]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input size="small" placeholder="Nhập họ tên đầy đủ" />
                  </Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    size="small"
                    icon={profileLoading ? <LoadingOutlined /> : <SaveOutlined />}
                    loading={profileLoading}
                    style={{ borderRadius: 6 }}
                  >
                    Lưu thay đổi
                  </Button>
                </Form>
              </div>

              {/* Card: Đổi mật khẩu */}
              <div className="st-card">
                <div className="st-card-head">
                  <KeyOutlined className="st-card-icon st-card-icon--amber" />
                  <div>
                    <div className="st-card-title">Đổi mật khẩu</div>
                    <div className="st-card-desc">Dùng mật khẩu mạnh để bảo mật</div>
                  </div>
                </div>

                <Form
                  form={pwForm}
                  layout="vertical"
                  onFinish={onFinishPassword}
                  className="st-form-compact"
                >
                  <Form.Item
                    label="Mật khẩu hiện tại"
                    name="oldPassword"
                    rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}
                    style={{ marginBottom: 10 }}
                  >
                    <Input.Password size="small" placeholder="••••••••" />
                  </Form.Item>
                  <Form.Item
                    label="Mật khẩu mới"
                    name="newPassword"
                    rules={[
                      { required: true, message: 'Nhập mật khẩu mới' },
                      { min: 6, message: 'Tối thiểu 6 ký tự' },
                    ]}
                    style={{ marginBottom: 10 }}
                  >
                    <Input.Password size="small" placeholder="Tối thiểu 6 ký tự" />
                  </Form.Item>
                  <Form.Item
                    label="Xác nhận mật khẩu"
                    name="confirmPassword"
                    dependencies={['newPassword']}
                    rules={[
                      { required: true, message: 'Xác nhận mật khẩu' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('newPassword') === value)
                            return Promise.resolve();
                          return Promise.reject(new Error('Mật khẩu không khớp'));
                        },
                      }),
                    ]}
                    style={{ marginBottom: 12 }}
                  >
                    <Input.Password size="small" placeholder="Nhập lại mật khẩu mới" />
                  </Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    size="small"
                    icon={pwLoading ? <LoadingOutlined /> : <LockOutlined />}
                    loading={pwLoading}
                    style={{ borderRadius: 6, background: '#f59e0b', borderColor: '#f59e0b' }}
                  >
                    Đổi mật khẩu
                  </Button>
                </Form>
              </div>
            </div>
          )}

          {/* ── Công ty ── */}
          {activeTab === 'company' && (
            <div className="st-card st-card--single">
              <div className="st-card-head">
                <BankOutlined className="st-card-icon st-card-icon--green" />
                <div>
                  <div className="st-card-title">Thông tin công ty</div>
                  <div className="st-card-desc">Hiển thị trên báo cáo Excel và phiếu lương</div>
                </div>
              </div>
              <Form
                layout="vertical"
                initialValues={{
                  name: 'CÔNG TY TNHH HIỆP LỢI',
                  mst: '3701609885',
                  address: 'Số 123, Đường ABC, KCN VSIP, Bình Dương',
                }}
                onFinish={() => message.success('Đã lưu thông tin công ty')}
                className="st-form-compact st-form-company"
              >
                <div className="st-form-row2">
                  <Form.Item label="Tên công ty" name="name" rules={[{ required: true }]} style={{ marginBottom: 10 }}>
                    <Input size="small" />
                  </Form.Item>
                  <Form.Item label="Mã số thuế" name="mst" style={{ marginBottom: 10 }}>
                    <Input size="small" />
                  </Form.Item>
                </div>
                <div className="st-form-row2">
                  <Form.Item label="Địa chỉ" name="address" style={{ marginBottom: 10 }}>
                    <Input size="small" />
                  </Form.Item>
                  <Form.Item label="Số điện thoại" name="phone" style={{ marginBottom: 10 }}>
                    <Input size="small" />
                  </Form.Item>
                </div>
                <Button
                  type="primary"
                  htmlType="submit"
                  size="small"
                  icon={<SaveOutlined />}
                  style={{ borderRadius: 6, background: '#10b981', borderColor: '#10b981' }}
                >
                  Lưu cấu hình
                </Button>
              </Form>
            </div>
          )}

          {/* ── Giao diện ── */}
          {activeTab === 'appearance' && (
            <div className="st-profile-grid">
              {/* Mode */}
              <div className="st-card">
                <div className="st-card-head">
                  <SunOutlined className="st-card-icon" />
                  <div>
                    <div className="st-card-title">Chế độ hiển thị</div>
                    <div className="st-card-desc">Sáng hoặc tối</div>
                  </div>
                </div>
                <div className="st-mode-row-compact">
                  <button
                    className={`st-mode-btn${mode === 'light' ? ' st-mode-btn--active' : ''}`}
                    onClick={() => setTheme('light', primaryColor)}
                  >
                    <SunOutlined />
                    <span>Sáng</span>
                    {mode === 'light' && <CheckOutlined className="st-mode-check" />}
                  </button>
                  <button
                    className={`st-mode-btn${mode === 'dark' ? ' st-mode-btn--active' : ''}`}
                    onClick={() => setTheme('dark', primaryColor)}
                  >
                    <MoonOutlined />
                    <span>Tối</span>
                    {mode === 'dark' && <CheckOutlined className="st-mode-check" />}
                  </button>
                </div>
              </div>

              {/* Colors */}
              <div className="st-card">
                <div className="st-card-head">
                  <FormatPainterOutlined className="st-card-icon st-card-icon--purple" />
                  <div>
                    <div className="st-card-title">Màu chủ đạo</div>
                    <div className="st-card-desc">Áp dụng toàn bộ giao diện</div>
                  </div>
                </div>
                <div className="st-colors-compact">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      className={`st-swatch${primaryColor === c.value ? ' st-swatch--active' : ''}`}
                      onClick={() => setTheme(mode, c.value)}
                      title={c.name}
                      style={{ '--sw-color': c.value }}
                    >
                      <span className="st-swatch-dot" style={{ background: c.value }}>
                        {primaryColor === c.value && <CheckOutlined style={{ color: '#fff', fontSize: 10 }} />}
                      </span>
                      <span className="st-swatch-name">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
