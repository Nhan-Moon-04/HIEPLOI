import { Menu, Dropdown, Button, Tooltip, Avatar } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppstoreOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  ScheduleOutlined,
  CalendarOutlined,
  DollarOutlined,
  FileTextOutlined,
  SafetyOutlined,
  BankOutlined,
  ImportOutlined,
  AuditOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  RiseOutlined,
  SunOutlined,
  MoonOutlined,
  DownOutlined,
} from '@ant-design/icons';
import useAuthStore from '../../stores/authStore';
import useThemeStore from '../../stores/themeStore';

const sections = [
  {
    key: 'overview',
    label: 'Tổng quan',
    icon: <AppstoreOutlined />,
    children: [{ key: '/dashboard', label: 'Dashboard' }],
  },
  {
    key: 'hr',
    label: 'Nhân sự',
    icon: <TeamOutlined />,
    roles: ['admin', 'accountant'],
    children: [
      { key: '/employees', label: 'Nhân viên', icon: <TeamOutlined /> },
      { key: '/schedules', label: 'Lịch làm', icon: <CalendarOutlined /> },
      { key: '/attendance', label: 'Chấm công', icon: <ClockCircleOutlined /> },
      { key: '/overtime', label: 'Tăng ca', icon: <RiseOutlined /> },
      { key: '/shifts', label: 'Mã ca', icon: <ScheduleOutlined /> },
      { key: '/leave', label: 'Phép năm', icon: <CalendarOutlined /> },
    ],
  },
  {
    key: 'finance',
    label: 'Lương & Thuế',
    icon: <DollarOutlined />,
    roles: ['admin', 'accountant'],
    children: [
      { key: '/meal-allowance', label: 'Tiền ăn', icon: <DollarOutlined /> },
      { key: '/salaries', label: 'Lương cơ bản', icon: <DollarOutlined /> },
      { key: '/payslips', label: 'Phiếu lương', icon: <FileTextOutlined /> },
      { key: '/insurance', label: 'BHXH / Thuế', icon: <SafetyOutlined /> },
      { key: '/advances', label: 'Tạm ứng', icon: <BankOutlined /> },
    ],
  },
  {
    key: 'system',
    label: 'Hệ thống',
    icon: <SettingOutlined />,
    roles: ['admin'],
    children: [
      { key: '/holidays', label: 'Ngày OFF & Lễ', icon: <CalendarOutlined /> },
      { key: '/import-export', label: 'Import / Export', icon: <ImportOutlined /> },
      { key: '/audit', label: 'Nhật ký', icon: <AuditOutlined /> },
      { key: '/settings', label: 'Cài đặt', icon: <SettingOutlined /> },
    ],
  },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hasRole, logout } = useAuthStore();
  const { mode, toggle } = useThemeStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = sections
    .filter((sec) => !sec.roles || sec.roles.some((r) => hasRole(r)))
    .map((sec) => ({
      key: sec.key,
      label: sec.label,
      icon: sec.icon,
      children: sec.children.map((child) => ({
        key: child.key,
        label: child.label,
        icon: child.icon,
      })),
    }));

  return (
    <div className="navbar">
      <div className="navbar-container">
        <div className="navbar-left">
          <div className="navbar-logo" onClick={() => navigate('/dashboard')}>
            <span className="logo-hl">HL</span>
            <span className="logo-text">Hiep Loi HR</span>
          </div>
          
          <Menu
            mode="horizontal"
            theme={mode === 'dark' ? 'dark' : 'light'}
            selectedKeys={[location.pathname]}
            onClick={({ key }) => navigate(key)}
            items={menuItems}
            className="navbar-menu"
          />
        </div>

        <div className="navbar-right">
          <Tooltip title={mode === 'light' ? 'Dark mode' : 'Light mode'}>
            <Button
              type="text"
              icon={mode === 'light' ? <MoonOutlined /> : <SunOutlined />}
              onClick={toggle}
              className="theme-toggle"
            />
          </Tooltip>

          <Dropdown
            menu={{
              items: [
                {
                  key: 'profile',
                  label: (
                    <div className="user-dropdown-info">
                      <strong>{user?.full_name || user?.username}</strong>
                      <div className="user-role">{user?.role?.toUpperCase()}</div>
                    </div>
                  ),
                  disabled: true,
                },
                { type: 'divider' },
                {
                  key: 'logout',
                  label: 'Đăng xuất',
                  icon: <LogoutOutlined />,
                  danger: true,
                  onClick: handleLogout,
                },
              ],
            }}
            placement="bottomRight"
            trigger={['click']}
          >
            <div className="navbar-user">
              <Avatar 
                style={{ backgroundColor: 'var(--sidebar-accent)', verticalAlign: 'middle' }}
                icon={<UserOutlined />}
              >
                {(user?.full_name || user?.username || '?')[0].toUpperCase()}
              </Avatar>
              <span className="user-name">{user?.full_name || user?.username}</span>
              <DownOutlined style={{ fontSize: 10, opacity: 0.5 }} />
            </div>
          </Dropdown>
        </div>
      </div>
    </div>
  );
}
