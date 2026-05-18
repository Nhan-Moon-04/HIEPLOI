import { useState } from 'react';
import { DatePicker, Select, Spin, Tooltip, Button } from 'antd';
import {
  ClockCircleOutlined,
  DownloadOutlined,
  CalendarOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import AttendanceDetailModal from '../components/Attendance/AttendanceDetailModal';

const STATUS_MAP = {
  full:        { label: 'Đủ giờ',   icon: '✓' },
  early_leave: { label: 'Về sớm',   icon: '↙' },
  short:       { label: 'Thiếu giờ',icon: '!' },
  absent:      { label: 'Vắng',     icon: 'N' },
  forgot_scan: { label: 'Quên quẹt',icon: 'Q' },
  holiday:     { label: 'Ngày lễ',  icon: 'H' },
  off:         { label: 'Nghỉ',     icon: '–' },
  no_data:     { label: '',         icon: '' },
};

export default function Attendance() {
  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const [dept, setDept] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);

  const { data: att, isLoading } = useQuery({
    queryKey: ['attendance', monthKey, dept],
    queryFn: () =>
      api.get('/attendance', {
        params: { month_key: monthKey, department: dept || undefined },
      }).then((r) => r.data),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/employees/departments').then((r) => r.data),
  });

  const s = att || { rows: [], days_in_month: 30 };
  const days = Array.from({ length: s.days_in_month }, (_, i) => i + 1);

  const totalPresent = s.rows?.reduce((sum, r) => sum + (r.summary?.total_present || 0), 0) || 0;
  const totalAbsent  = s.rows?.reduce((sum, r) => sum + (r.summary?.total_absent || 0), 0) || 0;
  const totalEarly   = s.rows?.reduce((sum, r) => sum + (r.summary?.total_early_leave || 0), 0) || 0;

  const renderCell = (cell) => {
    if (cell.status === 'no_data') return <span className="ma-cell-dot">·</span>;

    const label = cell.check_in
      ? dayjs(cell.check_in).format('HH:mm')
      : (STATUS_MAP[cell.status]?.icon || '');

    return (
      <Tooltip
        title={
          <div className="att-tooltip">
            <div className="att-tooltip-hd">
              <span className="att-tooltip-code">{cell.shift_code}</span>
              <span className="att-tooltip-name">{cell.shift_name}</span>
            </div>
            {cell.shift_start && (
              <div className="att-tooltip-row">Ca: {cell.shift_start} – {cell.shift_end}</div>
            )}
            {cell.check_in && (
              <div className="att-tooltip-row">Vào: <b>{dayjs(cell.check_in).format('HH:mm')}</b></div>
            )}
            {cell.check_out && (
              <div className="att-tooltip-row">Ra: <b>{dayjs(cell.check_out).format('HH:mm')}</b></div>
            )}
            {cell.actual_hours > 0 && (
              <div className="att-tooltip-row">Thực: <b>{cell.actual_hours}h</b></div>
            )}
            {cell.deviation !== 0 && cell.deviation != null && (
              <div className="att-tooltip-row">Chênh: {cell.deviation > 0 ? '+' : ''}{cell.deviation}h</div>
            )}
            {cell.notes && <div className="att-tooltip-note">{cell.notes}</div>}
          </div>
        }
        mouseEnterDelay={0.15}
      >
        <div className={`att-cell att-cell--${cell.status}`}>{label}</div>
      </Tooltip>
    );
  };

  return (
    <div className="att-page">
      {/* Title bar */}
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <h2 className="emp-title">Bảng chấm công</h2>
          <div className="emp-stats">
            <div className="emp-stat-chip">
              <CalendarOutlined style={{ fontSize: 10 }} />
              Tháng {dayjs(monthKey).format('MM/YYYY')}
            </div>
            <div className="emp-stat-chip">
              <UserOutlined style={{ fontSize: 10 }} />
              <strong>{s.rows?.length || 0}</strong> nhân viên
            </div>
            <div className="emp-stat-chip">
              <span className="emp-stat-dot emp-stat-dot--green" />
              Ngày công <strong>{totalPresent}</strong>
            </div>
            {totalAbsent > 0 && (
              <div className="emp-stat-chip">
                <span className="emp-stat-dot emp-stat-dot--red" />
                Vắng <strong>{totalAbsent}</strong>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            icon={<DownloadOutlined />}
            type="primary"
            style={{ background: '#276EF1', borderColor: '#276EF1', borderRadius: 7 }}
          >
            Xuất Excel
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="emp-filterbar">
        <DatePicker
          picker="month"
          value={dayjs(monthKey)}
          onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
          format="[Tháng] MM/YYYY"
          style={{ width: 160 }}
          size="middle"
        />
        <Select
          placeholder="Bộ phận"
          allowClear
          style={{ width: 160 }}
          value={dept}
          onChange={setDept}
          options={departments.map((d) => ({ value: d, label: d }))}
          suffixIcon={<TeamOutlined style={{ color: '#9ca3af' }} />}
          size="middle"
        />
      </div>

      {/* KPI row */}
      <div className="att-kpi-row">
        <div className="att-kpi-card att-kpi--blue">
          <ClockCircleOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">NHÂN VIÊN</div>
            <div className="att-kpi-value">{s.rows?.length || 0}</div>
          </div>
        </div>
        <div className="att-kpi-card att-kpi--green">
          <CheckCircleOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">TỔNG NGÀY CÔNG</div>
            <div className="att-kpi-value">{totalPresent}</div>
          </div>
        </div>
        <div className="att-kpi-card att-kpi--red">
          <CloseCircleOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">TỔNG NGÀY VẮNG</div>
            <div className="att-kpi-value">{totalAbsent}</div>
          </div>
        </div>
        <div className="att-kpi-card att-kpi--orange">
          <WarningOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">VỀ SỚM / THIẾU GIỜ</div>
            <div className="att-kpi-value">{totalEarly}</div>
          </div>
        </div>
      </div>

      {/* Attendance table */}
      <div className="ma-table-card">
        {isLoading ? (
          <div className="ma-loading"><Spin size="large" /></div>
        ) : (
          <div className="ma-scroll">
            <table className="ma-table">
              <thead>
                <tr>
                  <th className="ma-th ma-th--s0">Mã</th>
                  <th className="ma-th ma-th--s1">Họ tên</th>
                  <th className="ma-th ma-th--s2">Ca</th>
                  {days.map((d) => {
                    const cell = s.rows?.[0]?.days?.find((c) => c.day === d);
                    const dow = cell?.dow || '';
                    return (
                      <th
                        key={d}
                        className={`ma-th ma-th--day${cell?.is_holiday ? ' ma-th--hol' : dow === 'CN' ? ' ma-th--sun' : ''}`}
                      >
                        <div className="ma-th-num">{d}</div>
                        <div className="ma-th-dow">{dow}</div>
                      </th>
                    );
                  })}
                  <th className="ma-th ma-th--sum att-sum--green">Có</th>
                  <th className="ma-th ma-th--sum att-sum--red">Vắng</th>
                  <th className="ma-th ma-th--sum att-sum--orange">Quên</th>
                  <th className="ma-th ma-th--sum att-sum--amber">V.Sớm</th>
                </tr>
              </thead>
              <tbody>
                {s.rows?.map((row, idx) => (
                  <tr key={row.employee_id} className={idx % 2 === 1 ? 'ma-row--alt' : ''}>
                    <td className="ma-td ma-td--s0 ma-td--code">{row.employee_code}</td>
                    <td className="ma-td ma-td--s1">
                      <div
                        className="ma-name-cell"
                        onClick={() => setSelectedRow(row)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="ma-avatar">{(row.full_name || '?')[0].toUpperCase()}</div>
                        <span className="ma-name-text">{row.full_name}</span>
                      </div>
                    </td>
                    <td className="ma-td ma-td--s2">
                      <span className="att-shift-badge">{row.default_shift_code || '–'}</span>
                    </td>
                    {days.map((d) => {
                      const cell = row.days?.find((c) => c.day === d);
                      return (
                        <td key={d} className="ma-td ma-td--cell">
                          {cell ? renderCell(cell) : <span className="ma-cell-dot">·</span>}
                        </td>
                      );
                    })}
                    <td className="ma-td ma-td--sum att-td--green">{row.summary?.total_present || 0}</td>
                    <td className="ma-td ma-td--sum att-td--red">{row.summary?.total_absent || 0}</td>
                    <td className="ma-td ma-td--sum att-td--orange">{row.summary?.total_forgot_scan || 0}</td>
                    <td className="ma-td ma-td--sum att-td--amber">{row.summary?.total_early_leave || 0}</td>
                  </tr>
                ))}
                {!s.rows?.length && (
                  <tr>
                    <td colSpan={3 + days.length + 4} className="ma-empty">Không có dữ liệu</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="att-legend">
        {Object.entries(STATUS_MAP)
          .filter(([k]) => k !== 'no_data')
          .map(([key, st]) => (
            <div key={key} className="att-legend-item">
              <span className={`att-cell att-cell--${key} att-cell--sm`}>{st.icon}</span>
              <span className="att-legend-label">{st.label}</span>
            </div>
          ))}
        <div className="att-legend-hint">* Về sớm &gt; 15p = cảnh báo &nbsp;·&nbsp; Click tên NV để xem chi tiết</div>
      </div>

      <AttendanceDetailModal
        visible={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        data={selectedRow}
      />
    </div>
  );
}
