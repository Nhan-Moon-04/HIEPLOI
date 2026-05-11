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
    group: 'TỔNG QUAN',
    items: [{ key: '/dashboard', icon: <AppstoreOutlined />, label: 'Dashboard' }],
  },
  {
    group: 'NHÂN SỰ',
    roles: ['admin', 'accountant'],
    items: [
      { key: '/employees', icon: <TeamOutlined />, label: 'Nhân viên' },
      { key: '/schedules', icon: <CalendarOutlined />, label: 'Lịch làm' },
      { key: '/attendance', icon: <ClockCircleOutlined />, label: 'Chấm công' },
      { key: '/overtime', icon: <RiseOutlined />, label: 'Tăng ca' },
      { key: '/shifts', icon: <ScheduleOutlined />, label: 'Mã ca' },
      { key: '/leave', icon: <CalendarOutlined />, label: 'Phép năm' },
    ],
  },
  {
    group: 'LƯƠNG & THUẾ',
    roles: ['admin', 'accountant'],
    items: [
      { key: '/meal-allowance', icon: <DollarOutlined />, label: 'Tiền ăn' },
      { key: '/salaries', icon: <DollarOutlined />, label: 'Lương cơ bản' },
      { key: '/payslips', icon: <FileTextOutlined />, label: 'Phiếu lương' },
      { key: '/insurance', icon: <SafetyOutlined />, label: 'BHXH / Thuế' },
      { key: '/advances', icon: <BankOutlined />, label: 'Tạm ứng' },
    ],
  },
  {
    group: 'HỆ THỐNG',
    roles: ['admin'],
    items: [
      { key: '/holidays', icon: <CalendarOutlined />, label: 'Ngày OFF & Lễ' },
      { key: '/import-export', icon: <ImportOutlined />, label: 'Import / Export' },
      { key: '/audit', icon: <AuditOutlined />, label: 'Nhật ký' },
      { key: '/settings', icon: <SettingOutlined />, label: 'Cài đặt' },
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
