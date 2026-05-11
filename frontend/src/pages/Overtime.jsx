import { useState } from 'react';
import { DatePicker, Spin, Tag, Tooltip } from 'antd';
import { RiseOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';

export default function Overtime() {
  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));

  const { data: ot, isLoading } = useQuery({
    queryKey: ['overtime', monthKey],
    queryFn: () => api.get('/overtime', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  const s = ot || { rows: [], weekdays: {}, days_in_month: 30, summary: {} };
  const days = Array.from({ length: s.days_in_month }, (_, i) => i + 1);
  const sum = s.summary || {};

  // Only show employees with OT > 0, but keep all for reference
  const rowsWithOT = s.rows?.filter((r) => r.total_ot_hours > 0) || [];

  const renderCell = (row, day) => {
    const cell = row.days[day];
    if (!cell || !cell.ot || cell.ot === 0) return <span style={{ color: '#e0e0e0' }}>-</span>;

    const isSunday = cell.is_sunday;
    const isHoliday = cell.is_holiday;
    
    let bg = '#f0f5ff';
    let color = '#4361ee';
    let label = '(x1.5)';
    
    if (isHoliday) {
      bg = '#f5f3ff';
      color = '#8b5cf6';
      label = '(Le x3.0)';
    } else if (isSunday) {
      bg = '#fff7ed';
      color = '#f59e0b';
      label = '(CN x2.0)';
    }

    return (
      <Tooltip title={`${cell.shift || 'OT'} - ${cell.ot}h ${label}`}>
        <div style={{
          background: bg, color, borderRadius: 4, padding: '1px 0',
          fontSize: 11, fontWeight: 700, textAlign: 'center', minWidth: 28, lineHeight: '20px',
        }}>
          {cell.ot}
        </div>
      </Tooltip>
    );
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><RiseOutlined style={{ marginRight: 6 }} />Tang ca (OT)</h1>
          <div className="sub">
            Thang {dayjs(monthKey).format('M/YYYY')} - {sum.employees_with_ot || 0}/{sum.total_employees || 0} NV co OT
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <DatePicker
            picker="month" value={dayjs(monthKey)}
            onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
            format="[Thang] M / YYYY" style={{ width: 155 }}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="stat-card">
          <div className="accent accent-blue" />
          <div className="label">TONG GIO OT</div>
          <div className="value">{(sum.total_ot_hours || 0).toFixed(1)}h</div>
        </div>
        <div className="stat-card">
          <div className="accent accent-green" />
          <div className="label">OT THUONG (x1.5)</div>
          <div className="value">{(sum.total_ot_normal || 0).toFixed(1)}h</div>
        </div>
        <div className="stat-card">
          <div className="accent accent-orange" />
          <div className="label">OT CN (x2.0)</div>
          <div className="value">{(sum.total_ot_sunday || 0).toFixed(1)}h</div>
        </div>
        <div className="stat-card">
          <div className="accent accent-purple" style={{ background: '#8b5cf6' }} />
          <div className="label">OT LE (x3.0)</div>
          <div className="value">{(sum.total_ot_holiday || 0).toFixed(1)}h</div>
        </div>
        <div className="stat-card">
          <div className="accent accent-red" />
          <div className="label">NV CO OT</div>
          <div className="value">{sum.employees_with_ot || 0}</div>
          <div className="sub">/ {sum.total_employees || 0} tong</div>
        </div>
      </div>

      {/* OT Grid */}
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
        ) : rowsWithOT.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ba8bf' }}>
            Khong co nhan vien nao co OT trong thang nay.
            <br /><span style={{ fontSize: 11 }}>OT dua tren ma ca co default_overtime_hours &gt; 0 hoac lam ngay CN.</span>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8f9fc' }}>
                <th style={{ ...thStyle, width: 40, position: 'sticky', left: 0, zIndex: 3, background: '#f8f9fc' }}>Ma</th>
                <th style={{ ...thStyle, width: 130, position: 'sticky', left: 40, zIndex: 3, background: '#f8f9fc', textAlign: 'left' }}>Ho ten</th>
                {days.map((d) => {
                  const isSun = s.weekdays[d] === 'CN';
                  const firstRow = s.rows?.[0];
                  const isHoliday = firstRow?.days?.[d]?.is_holiday;
                  return (
                    <th key={d} style={{
                      ...thStyle, minWidth: 30,
                      background: isHoliday ? '#f5f3ff' : isSun ? '#fff7ed' : '#f8f9fc',
                      color: isHoliday ? '#8b5cf6' : isSun ? '#f59e0b' : '#6b7a99',
                    }}>
                      <div>{d}</div>
                      <div style={{ fontSize: 9, fontWeight: 400 }}>{s.weekdays[d]}</div>
                    </th>
                  );
                })}
                <th style={{ ...thStyle, width: 45, background: '#f0f5ff', color: '#4361ee' }}>x1.5</th>
                <th style={{ ...thStyle, width: 45, background: '#fff7ed', color: '#f59e0b' }}>x2.0</th>
                <th style={{ ...thStyle, width: 45, background: '#f5f3ff', color: '#8b5cf6' }}>x3.0</th>
                <th style={{ ...thStyle, width: 55, background: '#f0fdf4', color: '#22c55e', fontWeight: 700 }}>Tong</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithOT.map((row) => (
                <tr key={row.employee_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ ...tdStyle, position: 'sticky', left: 0, background: '#fff', zIndex: 1, fontWeight: 500 }}>{row.employee_code}</td>
                  <td style={{ ...tdStyle, position: 'sticky', left: 40, background: '#fff', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>
                    <Tooltip title={row.full_name}>{row.full_name}</Tooltip>
                  </td>
                  {days.map((d) => (
                    <td key={d} style={{ ...tdStyle, padding: '2px 1px' }}>{renderCell(row, d)}</td>
                  ))}
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#4361ee', background: '#f8faff' }}>
                    {row.total_ot_normal > 0 ? row.total_ot_normal.toFixed(1) : '-'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#f59e0b', background: '#fffcf5' }}>
                    {row.total_ot_sunday > 0 ? row.total_ot_sunday.toFixed(1) : '-'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#8b5cf6', background: '#f5f3ff' }}>
                    {row.total_ot_holiday > 0 ? row.total_ot_holiday.toFixed(1) : '-'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#22c55e', background: '#f5fff9' }}>
                    {row.total_ot_hours.toFixed(1)}
                  </td>
                </tr>
              ))}
              {/* Total row */}
              <tr style={{ background: '#f8f9fc', borderTop: '2px solid #e8ecf1' }}>
                <td colSpan={2} style={{ ...tdStyle, fontWeight: 700, position: 'sticky', left: 0, background: '#f8f9fc', zIndex: 1 }}>
                  TONG ({rowsWithOT.length} NV)
                </td>
                {days.map((d) => <td key={d} style={tdStyle} />)}
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#4361ee' }}>
                  {sum.total_ot_normal?.toFixed(1)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#f59e0b' }}>
                  {sum.total_ot_sunday?.toFixed(1)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#8b5cf6' }}>
                  {sum.total_ot_holiday?.toFixed(1)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: '#22c55e', fontSize: 13 }}>
                  {sum.total_ot_hours?.toFixed(1)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
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
