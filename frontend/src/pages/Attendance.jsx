import { useState } from 'react';
import { DatePicker, Select, Spin, Tag, Tooltip, Button, Space } from 'antd';
import { 
  ClockCircleOutlined, 
  DownloadOutlined, 
  CalendarOutlined, 
  TeamOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import AttendanceDetailModal from '../components/Attendance/AttendanceDetailModal';

const STATUS_MAP = {
  full: { color: '#22c55e', bg: '#f0fdf4', label: 'Đủ', icon: '✓' },
  early_leave: { color: '#f59e0b', bg: '#fffbeb', label: 'Về sớm', icon: '⚠' },
  short: { color: '#f97316', bg: '#fff7ed', label: 'Thiếu', icon: '!' },
  absent: { color: '#ef4444', bg: '#fef2f2', label: 'Vắng', icon: 'N' },
  forgot_scan: { color: '#f97316', bg: '#fff7ed', label: 'Quên', icon: 'Q' },
  holiday: { color: '#8b5cf6', bg: '#f5f3ff', label: 'Lễ', icon: 'H' },
  off: { color: '#6b7280', bg: '#f9fafb', label: 'Nghỉ', icon: '-' },
  no_data: { color: '#d1d5db', bg: '#fff', label: '', icon: '' },
};

export default function Attendance() {
  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const [dept, setDept] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);

  const { data: att, isLoading } = useQuery({
    queryKey: ['attendance', monthKey, dept],
    queryFn: () => api.get('/attendance', {
      params: { month_key: monthKey, department: dept || undefined }
    }).then((r) => r.data),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/employees/departments').then((r) => r.data),
  });

  const s = att || { rows: [], days_in_month: 30 };
  const days = Array.from({ length: s.days_in_month }, (_, i) => i + 1);

  const renderGridCell = (cell) => {
    const st = STATUS_MAP[cell.status] || STATUS_MAP.no_data;
    if (cell.status === 'no_data') return <span className="cell-dot">·</span>;

    const hasIssue = cell.status === 'early_leave' || cell.status === 'absent' || cell.status === 'short' || cell.status === 'forgot_scan';

    return (
      <Tooltip title={
        <div className="att-tooltip">
          <div className="tooltip-header">
            <span className="shift-code">{cell.shift_code}</span>
            <span className="shift-name">{cell.shift_name}</span>
          </div>
          {cell.shift_start && <div className="info-row">Ca: {cell.shift_start} - {cell.shift_end}</div>}
          {cell.check_in && <div className="info-row">Vào: <b>{dayjs(cell.check_in).format('HH:mm')}</b></div>}
          {cell.check_out && <div className="info-row">Ra: <b>{dayjs(cell.check_out).format('HH:mm')}</b></div>}
          {cell.actual_hours > 0 && <div className="info-row">Thực: <b>{cell.actual_hours}h</b></div>}
          {cell.deviation !== 0 && <div className="info-row status">Chênh: {cell.deviation > 0 ? '+' : ''}{cell.deviation}h</div>}
          {cell.notes && <div className="notes-row">{cell.notes}</div>}
        </div>
      }>
        <div className={`att-cell-inner status-${cell.status} ${hasIssue ? 'has-issue' : ''}`}>
          {cell.check_in ? dayjs(cell.check_in).format('HH:mm') : st.icon}
        </div>
      </Tooltip>
    );
  };

  const totalPresent = s.rows?.reduce((sum, r) => sum + (r.summary?.total_present || 0), 0) || 0;
  const totalAbsent = s.rows?.reduce((sum, r) => sum + (r.summary?.total_absent || 0), 0) || 0;
  const totalEarly = s.rows?.reduce((sum, r) => sum + (r.summary?.total_early_leave || 0), 0) || 0;

  return (
    <div className="attendance-page">
      <div className="page-header-premium">
        <div className="title-section">
          <div className="icon-wrapper">
            <ClockCircleOutlined />
          </div>
          <div>
            <h1>Bảng chấm công hằng ngày</h1>
            <p className="sub-text">
              <CalendarOutlined /> Tháng {dayjs(monthKey).format('MM / YYYY')} — {s.rows?.length || 0} nhân viên
            </p>
          </div>
        </div>

        <div className="actions-section">
          <Space size={12}>
            <DatePicker picker="month" value={dayjs(monthKey)}
              onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
              format="[Tháng] MM / YYYY" style={{ width: 160, borderRadius: 8 }} />
            
            <Select placeholder="Bộ phận" allowClear style={{ width: 160 }}
              value={dept} onChange={setDept}
              options={departments.map((d) => ({ value: d, label: d }))}
              suffixIcon={<TeamOutlined />}
            />

            <Button icon={<DownloadOutlined />} type="primary" className="btn-premium-gradient">
              Xuất Excel
            </Button>
          </Space>
        </div>
      </div>

      <div className="stats-grid-main att">
        <div className="p-stat-card blue">
          <div className="label">NHÂN VIÊN</div>
          <div className="value">{s.rows?.length || 0}</div>
          <div className="icon-bg"><TeamOutlined /></div>
        </div>
        <div className="p-stat-card green">
          <div className="label">TỔNG NGÀY CÔNG</div>
          <div className="value">{totalPresent}</div>
          <div className="icon-bg"><CheckCircleOutlined /></div>
        </div>
        <div className="p-stat-card red">
          <div className="label">TỔNG NGÀY VẮNG</div>
          <div className="value">{totalAbsent}</div>
          <div className="icon-bg"><CloseCircleOutlined /></div>
        </div>
        <div className="p-stat-card orange">
          <div className="label">VỀ SỚM / TRỄ</div>
          <div className="value">{totalEarly}</div>
          <div className="icon-bg"><WarningOutlined /></div>
        </div>
      </div>

      <div className="main-data-card">
        {isLoading ? (
          <div className="loading-state"><Spin size="large" /></div>
        ) : (
          <div className="table-wrapper">
            <table className="premium-table att">
              <thead>
                <tr>
                  <th className="sticky-col col-code">Mã</th>
                  <th className="sticky-col col-name">Họ tên</th>
                  <th className="sticky-col col-shift">Ca</th>
                  {days.map((d) => {
                    const firstRow = s.rows?.[0];
                    const cell = firstRow?.days?.find((c) => c.day === d);
                    const dow = cell?.dow || '';
                    const isSunday = dow === 'CN';
                    const isHoliday = cell?.is_holiday;
                    return (
                      <th key={d} className={`day-head ${isSunday ? 'is-sunday' : ''} ${isHoliday ? 'is-holiday' : ''}`}>
                        <div className="day-num">{d}</div>
                        <div className="day-dow">{dow}</div>
                      </th>
                    );
                  })}
                  <th className="sum-head green">Có</th>
                  <th className="sum-head red">Vắng</th>
                  <th className="sum-head orange">Quên</th>
                  <th className="sum-head warning">V.Sớm</th>
                </tr>
              </thead>
              <tbody>
                {s.rows?.map((row) => (
                  <tr key={row.employee_id}>
                    <td className="sticky-col col-code">{row.employee_code}</td>
                    <td className="sticky-col col-name">
                      <a onClick={() => setSelectedRow(row)} className="emp-link">
                        {row.full_name}
                      </a>
                    </td>
                    <td className="sticky-col col-shift">
                      <div className="shift-tag-mini">{row.default_shift_code}</div>
                    </td>
                    {days.map((d) => {
                      const cell = row.days?.find((c) => c.day === d);
                      return (
                        <td key={d} className="day-cell">
                          {cell ? renderGridCell(cell) : '-'}
                        </td>
                      );
                    })}
                    <td className="sum-cell green">{row.summary?.total_present || 0}</td>
                    <td className="sum-cell red">{row.summary?.total_absent || 0}</td>
                    <td className="sum-cell orange">{row.summary?.total_forgot_scan || 0}</td>
                    <td className="sum-cell warning">{row.summary?.total_early_leave || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="legend-premium">
        {Object.entries(STATUS_MAP).filter(([k]) => k !== 'no_data').map(([key, st]) => (
          <div key={key} className="legend-item">
            <span className={`icon-box status-${key}`}>{st.icon}</span>
            <span className="label">{st.label}</span>
          </div>
        ))}
        <div className="hint-text-right">
          * Về sớm &gt; 15p = cảnh báo | Click tên NV để xem chi tiết chấm công
        </div>
      </div>

      <AttendanceDetailModal
        visible={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        data={selectedRow}
      />

      <style>{`
        :root {
          --p-blue: hsl(221, 83%, 53%);
          --p-blue-light: hsl(221, 83%, 96%);
          --p-green: hsl(142, 71%, 45%);
          --p-green-light: hsl(142, 71%, 96%);
          --p-red: hsl(0, 84%, 60%);
          --p-red-light: hsl(0, 84%, 96%);
          --p-orange: hsl(38, 92%, 50%);
          --p-orange-light: hsl(38, 92%, 96%);
          --p-slate-50: #f8fafc;
          --p-slate-100: #f1f5f9;
          --p-slate-200: #e2e8f0;
          --p-slate-700: #334155;
          --p-slate-900: #0f172a;
        }

        .attendance-page { padding-bottom: 24px; }

        .page-header-premium {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          background: #fff;
          padding: 20px 24px;
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .title-section { display: flex; align-items: center; gap: 16px; }
        .title-section .icon-wrapper {
          width: 48px; height: 48px;
          background: var(--p-blue-light); color: var(--p-blue);
          border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 24px;
        }

        .title-section h1 { font-size: 20px; font-weight: 800; margin: 0; color: var(--p-slate-900); }
        .title-section .sub-text { font-size: 13px; color: #64748b; margin: 2px 0 0; display: flex; align-items: center; gap: 6px; }

        .btn-premium-gradient {
          background: linear-gradient(135deg, var(--p-blue) 0%, hsl(231, 83%, 53%) 100%);
          border: none; box-shadow: 0 4px 12px rgba(67, 97, 238, 0.3);
          height: 38px; border-radius: 8px; font-weight: 600;
        }

        .stats-grid-main.att { grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; display: grid; }
        .p-stat-card {
          background: #fff; padding: 16px 20px; border-radius: 16px; border: 1px solid var(--p-slate-200);
          position: relative; overflow: hidden;
        }
        .p-stat-card .label { font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 4px; }
        .p-stat-card .value { font-size: 28px; font-weight: 900; color: var(--p-slate-900); }
        .p-stat-card.blue .value { color: var(--p-blue); }
        .p-stat-card.green .value { color: var(--p-green); }
        .p-stat-card.red .value { color: var(--p-red); }
        .p-stat-card.orange .value { color: var(--p-orange); }
        
        .p-stat-card .icon-bg {
          position: absolute; right: -10px; bottom: -10px; font-size: 64px; opacity: 0.04;
        }

        .main-data-card { background: #fff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden; }
        .table-wrapper { overflow: auto; max-height: calc(100vh - 350px); }

        .premium-table.att { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
        .premium-table.att thead th {
          position: sticky; top: 0; z-index: 10; background: var(--p-slate-50);
          padding: 12px 8px; font-weight: 700; font-size: 10px; color: #64748b;
          border-bottom: 2px solid var(--p-slate-200); text-align: center;
        }

        .premium-table.att .sticky-col { position: sticky; left: 0; z-index: 11; background: #fff; }
        .premium-table.att .col-code { left: 0; width: 50px; font-weight: 700; }
        .premium-table.att .col-name { left: 50px; width: 140px; text-align: left; border-right: 1px solid var(--p-slate-100); }
        .premium-table.att .col-shift { left: 190px; width: 60px; border-right: 1px solid var(--p-slate-100); }

        .premium-table.att thead th.sticky-col { z-index: 12; background: var(--p-slate-50); }

        .premium-table.att tbody td { padding: 8px; border-bottom: 1px solid var(--p-slate-100); text-align: center; }
        .premium-table.att tbody tr:hover td { background: var(--p-slate-50); }

        .emp-link { color: var(--p-slate-900); font-weight: 600; cursor: pointer; }
        .emp-link:hover { color: var(--p-blue); text-decoration: underline; }

        .shift-tag-mini {
          background: var(--p-blue-light); color: var(--p-blue);
          padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 800;
        }

        .day-head { min-width: 38px; }
        .day-num { font-size: 13px; color: var(--p-slate-900); }
        .day-dow { font-size: 9px; }
        .day-head.is-sunday { background: #fff7ed !important; color: #f97316 !important; }
        .day-head.is-holiday { background: #faf5ff !important; color: #8b5cf6 !important; }

        .sum-head { width: 50px; }
        .sum-head.green { color: var(--p-green); background: var(--p-green-light) !important; }
        .sum-head.red { color: var(--p-red); background: var(--p-red-light) !important; }
        .sum-head.orange { color: var(--p-orange); background: var(--p-orange-light) !important; }
        .sum-head.warning { color: #d97706; background: #fffbeb !important; }

        .sum-cell { font-weight: 800; font-size: 13px; }
        .sum-cell.green { color: var(--p-green); background: var(--p-green-light); }
        .sum-cell.red { color: var(--p-red); background: var(--p-red-light); }
        .sum-cell.orange { color: var(--p-orange); background: var(--p-orange-light); }
        .sum-cell.warning { color: #d97706; background: #fffbeb; }

        .att-cell-inner {
          font-weight: 700; font-size: 10px; border-radius: 6px; 
          min-width: 32px; height: 24px; line-height: 24px; margin: 0 auto;
        }
        .att-cell-inner.has-issue { border: 1px solid currentColor; }
        
        .status-full { color: var(--p-green); background: var(--p-green-light); }
        .status-absent { color: var(--p-red); background: var(--p-red-light); }
        .status-early_leave { color: var(--p-orange); background: var(--p-orange-light); }
        .status-forgot_scan { color: #f97316; background: #fff7ed; }
        .status-holiday { color: var(--p-purple); background: var(--p-purple-light); }
        .status-off { color: #94a3b8; background: var(--p-slate-50); }

        .legend-premium {
          display: flex; gap: 20px; margin-top: 16px; align-items: center; flex-wrap: wrap;
          padding: 12px 16px; background: #fff; border-radius: 12px;
        }
        .legend-item { display: flex; align-items: center; gap: 6px; }
        .legend-item .icon-box {
          width: 20px; height: 20px; border-radius: 50%; font-size: 10px; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
        }
        .legend-item .label { font-size: 11px; font-weight: 600; color: #64748b; }
        
        .hint-text-right { margin-left: auto; font-size: 11px; color: #94a3b8; font-style: italic; }

        .cell-dot { color: #e2e8f0; }
        .loading-state { padding: 100px; text-align: center; }

        .att-tooltip { padding: 4px; min-width: 150px; }
        .att-tooltip .tooltip-header { border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 8px; padding-bottom: 4px; }
        .att-tooltip .info-row { font-size: 11px; margin-bottom: 2px; }
        .att-tooltip .notes-row { margin-top: 6px; font-size: 11px; color: #ff9c6e; font-style: italic; }
      `}</style>
    </div>
  );
}
