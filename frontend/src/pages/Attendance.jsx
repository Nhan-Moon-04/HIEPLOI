import { useState } from 'react';
import { DatePicker, Select, Spin, Tag, Tooltip, Button } from 'antd';
import { ClockCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import EmployeeDetailModal from '../components/Attendance/EmployeeDetailModal';

const STATUS_MAP = {
  full: { color: '#22c55e', bg: '#f0fdf4', label: 'Du', icon: '✓' },
  early_leave: { color: '#f59e0b', bg: '#fffbeb', label: 'Ve som', icon: '⚠' },
  short: { color: '#f97316', bg: '#fff7ed', label: 'Thieu', icon: '!' },
  absent: { color: '#ef4444', bg: '#fef2f2', label: 'Vang', icon: 'N' },
  forgot_scan: { color: '#f97316', bg: '#fff7ed', label: 'Quen', icon: 'Q' },
  holiday: { color: '#8b5cf6', bg: '#f5f3ff', label: 'Le', icon: 'H' },
  off: { color: '#6b7280', bg: '#f9fafb', label: 'Nghi', icon: '-' },
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
    if (cell.status === 'no_data') return <span style={{ color: '#e5e7eb' }}>·</span>;

    const hasIssue = cell.status === 'early_leave' || cell.status === 'absent' || cell.status === 'short' || cell.status === 'forgot_scan';

    return (
      <Tooltip title={
        <div style={{ fontSize: 11 }}>
          <div><b>{cell.shift_code}</b> {cell.shift_name}</div>
          {cell.shift_start && <div>Ca: {cell.shift_start} - {cell.shift_end}</div>}
          {cell.check_in && <div>Vao: {cell.check_in}</div>}
          {cell.check_out && <div>Ra: {cell.check_out}</div>}
          {cell.actual_hours > 0 && <div>Thuc: {cell.actual_hours}h</div>}
          {cell.deviation !== 0 && <div>Chenh: {cell.deviation > 0 ? '+' : ''}{cell.deviation}h</div>}
          {cell.notes && <div>{cell.notes}</div>}
        </div>
      }>
        <div style={{
          background: st.bg,
          color: st.color,
          borderRadius: 4,
          padding: '1px 0',
          fontSize: 10,
          fontWeight: hasIssue ? 700 : 500,
          textAlign: 'center',
          minWidth: 26,
          lineHeight: '20px',
          border: hasIssue ? `1px solid ${st.color}30` : 'none',
        }}>
          {cell.check_in ? cell.check_in.slice(0, 5) : st.icon}
        </div>
      </Tooltip>
    );
  };

  // Summary totals
  const totalPresent = s.rows?.reduce((sum, r) => sum + (r.summary?.total_present || 0), 0) || 0;
  const totalAbsent = s.rows?.reduce((sum, r) => sum + (r.summary?.total_absent || 0), 0) || 0;
  const totalEarly = s.rows?.reduce((sum, r) => sum + (r.summary?.total_early_leave || 0), 0) || 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><ClockCircleOutlined style={{ marginRight: 6 }} />Cham cong</h1>
          <div className="sub">
            Thang {dayjs(monthKey).format('M/YYYY')} - {s.rows?.length || 0} nhan vien
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <DatePicker picker="month" value={dayjs(monthKey)}
            onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
            format="[Thang] M / YYYY" style={{ width: 155 }} />
          <Select placeholder="Bo phan" allowClear style={{ width: 140 }}
            value={dept} onChange={setDept}
            options={departments.map((d) => ({ value: d, label: d }))} />
          <Button icon={<DownloadOutlined />}>Xuat Excel</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="accent accent-blue" />
          <div className="label">NHAN VIEN</div>
          <div className="value">{s.rows?.length || 0}</div>
        </div>
        <div className="stat-card">
          <div className="accent accent-green" />
          <div className="label">TONG NGAY CO MAT</div>
          <div className="value">{totalPresent}</div>
        </div>
        <div className="stat-card">
          <div className="accent accent-red" />
          <div className="label">TONG NGAY VANG</div>
          <div className="value">{totalAbsent}</div>
        </div>
        <div className="stat-card">
          <div className="accent accent-orange" />
          <div className="label">VE SOM</div>
          <div className="value">{totalEarly}</div>
        </div>
      </div>

      {/* Grid */}
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8f9fc' }}>
                <th style={{ ...thStyle, width: 40, position: 'sticky', left: 0, zIndex: 3, background: '#f8f9fc' }}>Ma</th>
                <th style={{ ...thStyle, width: 120, position: 'sticky', left: 40, zIndex: 3, background: '#f8f9fc', textAlign: 'left' }}>Ho ten</th>
                <th style={{ ...thStyle, width: 45, position: 'sticky', left: 160, zIndex: 3, background: '#f8f9fc' }}>Ca</th>
                {days.map((d) => {
                  const firstRow = s.rows?.[0];
                  const cell = firstRow?.days?.find((c) => c.day === d);
                  const dow = cell?.dow || '';
                  const isSunday = dow === 'CN';
                  const isHoliday = cell?.is_holiday;
                  return (
                    <th key={d} style={{
                      ...thStyle, minWidth: 30,
                      background: isHoliday ? '#faf5ff' : isSunday ? '#fff7ed' : '#f8f9fc',
                      color: isHoliday ? '#8b5cf6' : isSunday ? '#f59e0b' : '#6b7a99',
                    }}>
                      <div>{d}</div>
                      <div style={{ fontSize: 9, fontWeight: 400 }}>{dow}</div>
                    </th>
                  );
                })}
                <th style={{ ...thStyle, width: 40, background: '#f0fdf4', color: '#22c55e' }}>Co</th>
                <th style={{ ...thStyle, width: 40, background: '#fef2f2', color: '#ef4444' }}>Vang</th>
                <th style={{ ...thStyle, width: 40, background: '#fff7ed', color: '#f97316' }}>Quen</th>
                <th style={{ ...thStyle, width: 45, background: '#fffbeb', color: '#f59e0b' }}>V.som</th>
              </tr>
            </thead>
            <tbody>
              {s.rows?.map((row) => (
                <tr key={row.employee_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ ...tdStyle, position: 'sticky', left: 0, background: '#fff', zIndex: 1, fontWeight: 500 }}>
                    {row.employee_code}
                  </td>
                  <td style={{ ...tdStyle, position: 'sticky', left: 40, background: '#fff', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                    <a onClick={() => setSelectedRow(row)} style={{ color: '#4361ee', fontWeight: 500, cursor: 'pointer' }}>
                      <Tooltip title={row.full_name}>{row.full_name}</Tooltip>
                    </a>
                  </td>
                  <td style={{ ...tdStyle, position: 'sticky', left: 160, background: '#fff', zIndex: 1, textAlign: 'center' }}>
                    <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{row.default_shift_code}</Tag>
                  </td>
                  {days.map((d) => {
                    const cell = row.days?.find((c) => c.day === d);
                    return (
                      <td key={d} style={{ ...tdStyle, padding: '2px 1px' }}>
                        {cell ? renderGridCell(cell) : '-'}
                      </td>
                    );
                  })}
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#22c55e', background: '#f8fff8' }}>
                    {row.summary?.total_present || 0}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#ef4444', background: '#fffafa' }}>
                    {row.summary?.total_absent || 0}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#f97316', background: '#fff7ed' }}>
                    {row.summary?.total_forgot_scan || 0}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#f59e0b', background: '#fffcf5' }}>
                    {row.summary?.total_early_leave || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: '#6b7a99', flexWrap: 'wrap' }}>
        {Object.entries(STATUS_MAP).filter(([k]) => k !== 'no_data').map(([key, st]) => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: st.bg, border: `1px solid ${st.color}30`, textAlign: 'center', lineHeight: '14px', fontSize: 9, color: st.color, fontWeight: 700 }}>
              {st.icon}
            </span>
            {st.label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9ba8bf' }}>
          * Vao som = ko van de | Ve som &gt;15p = canh bao | Click ten NV de xem chi tiet
        </span>
      </div>

      <EmployeeDetailModal
        visible={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        data={selectedRow}
      />
    </div>
  );
}

const thStyle = {
  padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600,
  borderBottom: '2px solid #e8ecf1', color: '#6b7a99', whiteSpace: 'nowrap',
};
const tdStyle = {
  padding: '4px 6px', borderBottom: '1px solid #f5f5f5', fontSize: 12,
};
