import { useState } from 'react';
import { Button, Dropdown, Avatar, Tooltip, Badge } from 'antd';
import {
  MenuFoldOutlined, MenuUnfoldOutlined,
  SunOutlined, MoonOutlined,
  UserOutlined, LogoutOutlined,
  BellOutlined, QuestionCircleOutlined,
  DownOutlined, RightOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import useThemeStore from '../../stores/themeStore';
import useAuthStore from '../../stores/authStore';

const ROUTE_META = {
  '/dashboard':     ['Tổng quan',    'Dashboard'],
  '/employees':     ['Nhân sự',      'Nhân viên'],
  '/schedules':     ['Nhân sự',      'Lịch làm'],
  '/attendance':    ['Nhân sự',      'Chấm công'],
  '/overtime':      ['Nhân sự',      'Tăng ca'],
  '/shifts':        ['Nhân sự',      'Mã ca'],
  '/leave':         ['Nhân sự',      'Phép năm'],
  '/meal-allowance':['Lương & Thuế', 'Tiền ăn'],
  '/salaries':      ['Lương & Thuế', 'Lương cơ bản'],
  '/payslips':      ['Lương & Thuế', 'Phiếu lương'],
  '/insurance':     ['Lương & Thuế', 'BHXH / Thuế'],
  '/advances':      ['Lương & Thuế', 'Tạm ứng'],
  '/holidays':      ['Hệ thống',     'Ngày OFF & Lễ'],
  '/import-export': ['Hệ thống',     'Import / Export'],
  '/audit':         ['Hệ thống',     'Nhật ký'],
  '/settings':      ['Hệ thống',     'Cài đặt'],
};

export default function MainLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const { mode, toggle } = useThemeStore();
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const meta = ROUTE_META[location.pathname]
    || (location.pathname.startsWith('/meal-allowance/') ? ['Lương & Thuế', 'Chi tiết tiền ăn'] : null)
    || (location.pathname.startsWith('/employees/') ? ['Nhân sự', 'Chi tiết nhân viên'] : null)
    || [];

  const userMenu = {
    items: [
      {
        key: 'info',
        label: (
          <div style={{ padding: '4px 0', minWidth: 140 }}>
            <div style={{ fontWeight: 600, color: '#1f2937', fontSize: 13 }}>{user?.full_name || user?.username}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{user?.role?.toUpperCase()}</div>
          </div>
        ),
        disabled: true,
      },
      { type: 'divider' },
      { key: 'logout', label: 'Đăng xuất', icon: <LogoutOutlined />, danger: true, onClick: handleLogout },
    ],
  };

  return (
    <div className={`ml ${mode === 'dark' ? 'dark' : ''}`}>
      <Sidebar collapsed={collapsed} />

      <div className={`ml-body ${collapsed ? 'ml-body--col' : ''}`}>
        <header className="ml-hd">
          <div className="ml-hd-left">
            <Button
              type="text" size="small"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              className="ml-toggle"
            />
            {meta.length > 0 && (
              <div className="ml-bc">
                <span className="ml-bc-parent">{meta[0]}</span>
                <RightOutlined className="ml-bc-sep" />
                <span className="ml-bc-cur">{meta[1]}</span>
              </div>
            )}
          </div>

          <div className="ml-hd-right">
            <Tooltip title={mode === 'light' ? 'Dark mode' : 'Light mode'}>
              <Button type="text" size="small" icon={mode === 'light' ? <MoonOutlined /> : <SunOutlined />}
                onClick={toggle} className="ml-hd-btn" />
            </Tooltip>
            <Tooltip title="Thông báo">
              <Badge count={0} size="small">
                <Button type="text" size="small" icon={<BellOutlined />} className="ml-hd-btn" />
              </Badge>
            </Tooltip>
            <Tooltip title="Trợ giúp">
              <Button type="text" size="small" icon={<QuestionCircleOutlined />} className="ml-hd-btn" />
            </Tooltip>

            <div className="ml-hd-divider" />

            <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
              <div className="ml-user">
                <Avatar size={26} style={{ background: '#276EF1', fontSize: 11, fontWeight: 700 }}>
                  {(user?.full_name || user?.username || '?')[0].toUpperCase()}
                </Avatar>
                <span className="ml-user-name">{user?.full_name || user?.username}</span>
                <DownOutlined style={{ fontSize: 9, color: '#9ca3af' }} />
              </div>
            </Dropdown>
          </div>
        </header>

        <div className="ml-page">{children}</div>
      </div>
    </div>
  );
}
