import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppstoreOutlined, TeamOutlined, ClockCircleOutlined, ScheduleOutlined,
  CalendarOutlined, DollarOutlined, FileTextOutlined, SafetyOutlined,
  BankOutlined, ImportOutlined, AuditOutlined, SettingOutlined, RiseOutlined,
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
      { key: '/salaries/payroll', icon: <FileTextOutlined />, label: 'Bảng lương' },
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
          return (
            <div key={sec.group} className="sb-section">
              {!collapsed && <div className="sb-group">{sec.group}</div>}
              {sec.items.map((item) => {
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
