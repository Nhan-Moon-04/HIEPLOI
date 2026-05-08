import { useState, useRef } from 'react';
import { DatePicker, Button, Tag, Select, message, Upload, Spin, Popover, Tooltip } from 'antd';
import { CalendarOutlined, UploadOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';

const SHIFT_COLORS = {
  X: '#4361ee', XVP: '#6366f1', D: '#7c3aed', CND: '#9333ea',
  CN: '#f59e0b', S: '#10b981', C: '#10b981', P: '#3b82f6',
  N: '#ef4444', OFF: '#94a3b8', L: '#ec4899',
};

export default function Schedules() {
  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const [editingCell, setEditingCell] = useState(null); // {empId, day}
  const qc = useQueryClient();

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['schedule', monthKey],
    queryFn: () => api.get('/schedules', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  const { data: shiftList = [] } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.get('/shifts').then((r) => r.data),
  });

  const updateCell = useMutation({
    mutationFn: ({ employee_id, day, shift_code }) =>
      api.put('/schedules/cell', { employee_id, day, shift_code }, { params: { month_key: monthKey } }),
    onSuccess: () => { qc.invalidateQueries(['schedule']); setEditingCell(null); },
    onError: (e) => message.error(e.response?.data?.detail || 'Loi'),
  });

  const importMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/schedules/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      const d = res.data;
      message.success(`${d.message}`);
      if (d.unknown_shifts?.length) message.warning(`Ma ca khong nhan dien: ${d.unknown_shifts.join(', ')}`);
      if (d.month_key) setMonthKey(d.month_key);
      qc.invalidateQueries(['schedule']);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Loi import'),
  });

  const s = schedule || { rows: [], weekdays: {}, days_in_month: 30 };
  const days = Array.from({ length: s.days_in_month }, (_, i) => i + 1);

  const renderCell = (row, day) => {
    const val = row.days[day]; // null=default, string=override
    const code = val || row.default_shift_code || '';
    const isOverride = val !== null && val !== undefined;
    const isEditing = editingCell?.empId === row.employee_id && editingCell?.day === day;
    const dow = s.weekdays[day];
    const isSunday = dow === 'CN';

    if (isEditing) {
      return (
        <Select
          size="small"
          autoFocus
          open
          style={{ width: 64 }}
          value={val || undefined}
          placeholder={row.default_shift_code}
          allowClear
          onChange={(v) => updateCell.mutate({ employee_id: row.employee_id, day, shift_code: v || null })}
          onBlur={() => setEditingCell(null)}
          options={[
            { value: null, label: 'Mac dinh' },
            ...shiftList.map((sh) => ({ value: sh.code, label: sh.code })),
          ]}
        />
      );
    }

    const bg = isOverride
      ? (SHIFT_COLORS[code] || '#6b7a99') + '18'
      : isSunday ? '#fff7ed' : 'transparent';
    const color = SHIFT_COLORS[code] || '#6b7a99';

    return (
      <div
        onClick={() => setEditingCell({ empId: row.employee_id, day })}
        style={{
          cursor: 'pointer', textAlign: 'center', padding: '2px 0',
          borderRadius: 4, background: bg,
          fontSize: 11, fontWeight: isOverride ? 700 : 400,
          color: isOverride ? color : '#9ba8bf',
          minWidth: 30, lineHeight: '22px',
        }}
      >
        {code || '-'}
      </div>
    );
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><CalendarOutlined style={{ marginRight: 6 }} />Lich lam viec</h1>
          <div className="sub">
            Thang {dayjs(monthKey).format('M/YYYY')} - {s.rows?.length || 0} nhan vien
            {' | '}O trong = ca mac dinh, click de doi ca
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <DatePicker
            picker="month" value={dayjs(monthKey)}
            onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
            format="[Thang] M / YYYY" style={{ width: 155 }}
          />
          <Upload
            accept=".xlsx,.xls"
            showUploadList={false}
            beforeUpload={(file) => { importMut.mutate(file); return false; }}
          >
            <Button icon={<UploadOutlined />} loading={importMut.isPending}>Import Excel</Button>
          </Upload>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8f9fc' }}>
                <th style={{ ...thStyle, width: 40, position: 'sticky', left: 0, zIndex: 3, background: '#f8f9fc' }}>Ma</th>
                <th style={{ ...thStyle, width: 140, position: 'sticky', left: 40, zIndex: 3, background: '#f8f9fc', textAlign: 'left' }}>Ho ten</th>
                <th style={{ ...thStyle, width: 50, position: 'sticky', left: 180, zIndex: 3, background: '#f8f9fc' }}>Ca</th>
                {days.map((d) => (
                  <th key={d} style={{
                    ...thStyle,
                    background: s.weekdays[d] === 'CN' ? '#fff7ed' : '#f8f9fc',
                    color: s.weekdays[d] === 'CN' ? '#f59e0b' : '#6b7a99',
                    minWidth: 34,
                  }}>
                    <div>{d}</div>
                    <div style={{ fontSize: 9, fontWeight: 400 }}>{s.weekdays[d]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.rows?.map((row) => (
                <tr key={row.employee_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ ...tdStyle, position: 'sticky', left: 0, background: '#fff', zIndex: 1, fontWeight: 500 }}>{row.employee_code}</td>
                  <td style={{ ...tdStyle, position: 'sticky', left: 40, background: '#fff', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                    <Tooltip title={row.full_name}>{row.full_name}</Tooltip>
                  </td>
                  <td style={{ ...tdStyle, position: 'sticky', left: 180, background: '#fff', zIndex: 1, textAlign: 'center' }}>
                    <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{row.default_shift_code}</Tag>
                  </td>
                  {days.map((d) => (
                    <td key={d} style={{ ...tdStyle, padding: '2px 1px' }}>
                      {renderCell(row, d)}
                    </td>
                  ))}
                </tr>
              ))}
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
