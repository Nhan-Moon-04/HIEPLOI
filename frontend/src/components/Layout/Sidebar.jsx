import { Menu, Tooltip } from 'antd';
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
} from '@ant-design/icons';
import useAuthStore from '../../stores/authStore';

const sections = [
  {
    group: 'TONG QUAN',
    items: [{ key: '/dashboard', icon: <AppstoreOutlined />, label: 'Dashboard' }],
  },
  {
    group: 'NHAN SU',
    roles: ['admin', 'accountant'],
    items: [
      { key: '/employees', icon: <TeamOutlined />, label: 'Nhan vien' },
      { key: '/schedules', icon: <CalendarOutlined />, label: 'Lich lam' },
      { key: '/attendance', icon: <ClockCircleOutlined />, label: 'Cham cong' },
      { key: '/overtime', icon: <RiseOutlined />, label: 'Tang ca' },
      { key: '/shifts', icon: <ScheduleOutlined />, label: 'Ma ca' },
      { key: '/leave', icon: <CalendarOutlined />, label: 'Phep nam' },
    ],
  },
  {
    group: 'LUONG & THUE',
    roles: ['admin', 'accountant'],
    items: [
      { key: '/salaries', icon: <DollarOutlined />, label: 'Bang luong' },
      { key: '/payslips', icon: <FileTextOutlined />, label: 'Phieu luong' },
      { key: '/insurance', icon: <SafetyOutlined />, label: 'BHXH / Thue' },
      { key: '/advances', icon: <BankOutlined />, label: 'Tam ung' },
    ],
  },
  {
    group: 'HE THONG',
    roles: ['admin'],
    items: [
      { key: '/holidays', icon: <CalendarOutlined />, label: 'Ngay OFF & Le' },
      { key: '/import-export', icon: <ImportOutlined />, label: 'Import / Export' },
      { key: '/audit', icon: <AuditOutlined />, label: 'Nhat ky' },
      { key: '/settings', icon: <SettingOutlined />, label: 'Cai dat' },
    ],
  },
];

export default function Sidebar({ collapsed }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hasRole } = useAuthStore();

  const menuItems = [];
  sections.forEach((sec) => {
    if (sec.roles && !sec.roles.some((r) => hasRole(r))) return;
    menuItems.push({
      key: `g-${sec.group}`,
      type: 'group',
      label: !collapsed ? (
        <span className="menu-group-label" style={{ padding: 0 }}>{sec.group}</span>
      ) : null,
      children: sec.items.map((it) => ({
        key: it.key,
        icon: it.icon,
        label: it.label,
      })),
    });
  });

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed ? (
          <>
            <div className="logo-text">Hiep Loi</div>
            <div className="logo-sub">QUAN LY NHAN SU</div>
          </>
        ) : (
          <div className="logo-text" style={{ fontSize: 14, textAlign: 'center' }}>HL</div>
        )}
      </div>

      <div className="sidebar-menu-wrap">
        <Menu
          mode="inline"
          theme="dark"
          selectedKeys={[location.pathname]}
          onClick={({ key }) => {
            if (!key.startsWith('g-')) navigate(key);
          }}
          items={menuItems}
          style={{ background: 'transparent', border: 'none' }}
          inlineCollapsed={collapsed}
        />
      </div>

      <div className="sidebar-footer">
        <Menu
          mode="inline"
          theme="dark"
          selectable={false}
          onClick={({ key }) => {
            if (key === 'logout') {
              useAuthStore.getState().logout();
              navigate('/login');
            }
          }}
          items={[
            {
              key: 'user-info',
              icon: <UserOutlined />,
              label: !collapsed ? (
                <span style={{ fontSize: 12 }}>
                  {user?.full_name || user?.username}
                  <span style={{ display: 'block', fontSize: 10, opacity: 0.5, marginTop: -2 }}>
                    {user?.role?.toUpperCase()}
                  </span>
                </span>
              ) : null,
            },
            {
              key: 'logout',
              icon: <LogoutOutlined />,
              label: !collapsed ? 'Dang xuat' : null,
              danger: true,
            },
          ]}
          style={{ background: 'transparent', border: 'none' }}
          inlineCollapsed={collapsed}
        />
      </div>
    </div>
  );
}
