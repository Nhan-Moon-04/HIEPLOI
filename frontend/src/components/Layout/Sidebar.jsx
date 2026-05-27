import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppstoreOutlined, TeamOutlined, ClockCircleOutlined, ScheduleOutlined,
  CalendarOutlined, DollarOutlined, FileTextOutlined, SafetyOutlined,
  BankOutlined, ImportOutlined, AuditOutlined, SettingOutlined, RiseOutlined,
  UsergroupAddOutlined, UserSwitchOutlined,
} from '@ant-design/icons';
import useAuthStore from '../../stores/authStore';

const sections = [
  {
    group: 'TỔNG QUAN',
    items: [{ key: '/dashboard', icon: <AppstoreOutlined />, label: 'Dashboard' }],
  },
  {
    group: 'NHÂN SỰ',
    roles: ['admin', 'accountant', 'worker'],
    items: [
      { key: '/employees', icon: <TeamOutlined />, label: 'Nhân viên' },
      { key: '/departments', icon: <AppstoreOutlined />, label: 'Bộ phận' },
      { key: '/schedules', icon: <CalendarOutlined />, label: 'Lịch làm' },
      { key: '/attendance', icon: <ClockCircleOutlined />, label: 'Chấm công' },
      { key: '/overtime', icon: <RiseOutlined />, label: 'Tăng ca' },
      { key: '/shifts', icon: <ScheduleOutlined />, label: 'Mã ca', roles: ['admin', 'accountant'] },
      { key: '/leave', icon: <CalendarOutlined />, label: 'Phép năm' },
    ],
  },
  {
    group: 'LƯƠNG & THUẾ',
    roles: ['admin', 'accountant', 'worker'],
    items: [
      { key: '/meal-allowance', icon: <DollarOutlined />, label: 'Tiền ăn' },
      { key: '/salaries', icon: <DollarOutlined />, label: 'Lương cơ bản' },
      { key: '/salaries/payroll', icon: <FileTextOutlined />, label: 'Bảng lương' },
      { key: '/insurance', icon: <SafetyOutlined />, label: 'BHXH / Thuế', roles: ['admin', 'accountant'] },
      { key: '/advances', icon: <BankOutlined />, label: 'Tạm ứng' },
    ],
  },
  {
    group: 'CÔNG ĐOÀN',
    roles: ['admin', 'accountant'],
    items: [
      { key: '/union', icon: <UsergroupAddOutlined />, label: 'Công đoàn' },
    ],
  },
  {
    group: 'HỆ THỐNG',
    roles: ['admin', 'worker'],
    items: [
      { key: '/holidays',        icon: <CalendarOutlined />,     label: 'Ngày OFF & Lễ', roles: ['admin'] },
      { key: '/import-export',   icon: <ImportOutlined />,       label: 'Import / Export', roles: ['admin'] },
      { key: '/audit',           icon: <AuditOutlined />,        label: 'Nhật ký', roles: ['admin'] },
      { key: '/user-management', icon: <UserSwitchOutlined />,   label: 'Quản lý user', roles: ['admin'] },
      { key: '/settings',        icon: <SettingOutlined />,      label: 'Cài đặt' },
    ],
  },
];

export default function Sidebar({ collapsed }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasRole } = useAuthStore();

  return (
    <div className={`sb ${collapsed ? 'sb--col' : ''}`}>
      <div className="sb-logo" onClick={() => navigate('/dashboard')}>
        <div className="sb-logo-badge">HL</div>
        {!collapsed && (
          <div className="sb-logo-text">
            <div className="sb-logo-name">Hiep Loi</div>
            <div className="sb-logo-sub">Quản lý nhân sự</div>
          </div>
        )}
      </div>

      <div className="sb-nav">
        {sections.map((sec) => {
          if (sec.roles && !sec.roles.some((r) => hasRole(r))) return null;
          
          const visibleItems = sec.items.filter((item) => {
            if (item.roles && !item.roles.some((r) => hasRole(r))) return false;
            return true;
          });
          
          if (visibleItems.length === 0) return null;

          return (
            <div key={sec.group} className="sb-section">
              {!collapsed && <div className="sb-group">{sec.group}</div>}
              {visibleItems.map((item) => {
                const active = location.pathname === item.key || location.pathname.startsWith(item.key + '/');
                return (
                  <div
                    key={item.key}
                    className={`sb-item ${active ? 'sb-item--active' : ''}`}
                    onClick={() => navigate(item.key)}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="sb-item-icon">{item.icon}</span>
                    {!collapsed && <span className="sb-item-label">{item.label}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
