import { useState } from 'react';
import { DatePicker, Button, Tag, Select, message, Upload, Spin, Popover, Tooltip, Input, Form, TimePicker, InputNumber } from 'antd';
import { CalendarOutlined, UploadOutlined, SearchOutlined, ThunderboltOutlined, DeleteOutlined, CheckOutlined } from '@ant-design/icons';
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
  const [editingCell, setEditingCell] = useState(null); // {empId, day} – đổi ca
  const [otPopover, setOtPopover] = useState(null);    // {empId, day, employeeId} – OT popup
  const [searchTerm, setSearchTerm] = useState('');
  const [otForm] = Form.useForm();
  const qc = useQueryClient();

  // Lấy lịch
  const { data: schedule, isLoading } = useQuery({
    queryKey: ['schedule', monthKey],
    queryFn: () => api.get('/schedules', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  // Danh sách ca
  const { data: shiftList = [] } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.get('/shifts').then((r) => r.data),
  });

  // Tất cả OT config trong tháng
  const { data: xOtList = [] } = useQuery({
    queryKey: ['x-overtime', monthKey],
    queryFn: () => api.get('/schedules/x-overtime', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  // Map nhanh: "empId_YYYY-MM-DD" -> config
  const xOtMap = {};
  for (const c of xOtList) {
    xOtMap[`${c.employee_id}_${c.work_date}`] = c;
  }

  const shiftX = shiftList.find((s) => s.code === 'X');
  const mealAllowancePerMeal = shiftX ? Number(shiftX.meal_allowance) : 25000;

  // Mutation đổi ca
  const updateCell = useMutation({
    mutationFn: ({ employee_id, day, shift_code }) =>
      api.put('/schedules/cell', { employee_id, day, shift_code }, { params: { month_key: monthKey } }),
    onSuccess: () => { qc.invalidateQueries(['schedule']); setEditingCell(null); },
    onError: (e) => message.error(e.response?.data?.detail || 'Loi'),
  });

  // Mutation lưu OT
  const saveOt = useMutation({
    mutationFn: (body) => api.put('/schedules/x-overtime', body),
    onSuccess: () => {
      message.success('Đã lưu tăng ca!');
      qc.invalidateQueries(['x-overtime']);
      setOtPopover(null);
      otForm.resetFields();
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi lưu'),
  });

  // Mutation xóa OT
  const deleteOt = useMutation({
    mutationFn: ({ employee_id, work_date }) =>
      api.delete('/schedules/x-overtime', { params: { employee_id, work_date } }),
    onSuccess: () => {
      message.success('Đã xóa tăng ca!');
      qc.invalidateQueries(['x-overtime']);
      setOtPopover(null);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi xóa'),
  });

  // Import
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
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredRows = (s.rows || []).filter((row) => {
    if (!normalizedSearch) return true;
    return String(row.employee_code || '').toLowerCase().includes(normalizedSearch)
      || String(row.full_name || '').toLowerCase().includes(normalizedSearch);
  });

  // Mở OT popover cho 1 ô ngày X
  const openOtPopover = (row, day) => {
    const year = parseInt(monthKey.split('-')[0]);
    const month = parseInt(monthKey.split('-')[1]);
    const workDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const key = `${row.employee_id}_${workDate}`;
    const existing = xOtMap[key];
    otForm.setFieldsValue({
      ot_end_time: existing?.ot_end_time ? dayjs(existing.ot_end_time, 'HH:mm') : null,
      ot_hours: existing?.ot_hours ? Number(existing.ot_hours) : null,
      meal_count: existing?.meal_count ?? 0,
    });
    setOtPopover({ empId: row.employee_id, day, employee_id: row.employee_id, workDate, existing });
  };

  const handleOtSave = (values) => {
    if (!otPopover) return;
    saveOt.mutate({
      employee_id: otPopover.employee_id,
      work_date: otPopover.workDate,
      ot_end_time: values.ot_end_time ? values.ot_end_time.format('HH:mm') : null,
      ot_hours: values.ot_hours ?? null,
      meal_count: values.meal_count ?? 0,
    });
  };

  const watchMealCount = Form.useWatch('meal_count', otForm) || 0;

  // Render ô ngày
  const renderCell = (row, day) => {
    const year = parseInt(monthKey.split('-')[0]);
    const month = parseInt(monthKey.split('-')[1]);
    const workDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const val = row.days[day];
    const code = val || row.default_shift_code || '';
    const isOverride = val !== null && val !== undefined;
    const isEditing = editingCell?.empId === row.employee_id && editingCell?.day === day;
    const isOtOpen = otPopover?.empId === row.employee_id && otPopover?.day === day;
    const dow = s.weekdays[day];
    const isSunday = dow === 'CN';

    // Chỉ hiện OT option khi ca là X (mặc định hoặc override)
    const isXShift = code === 'X';
    const otKey = `${row.employee_id}_${workDate}`;
    const hasOt = !!xOtMap[otKey];

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

    const cellContent = (
      <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
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
        {isXShift && (
          <div
            className={hasOt ? 'ot-dot ot-dot--active' : 'ot-dot'}
            title={hasOt ? 'Đã có tăng ca – click để sửa' : 'Thêm tăng ca X'}
            onClick={(e) => { e.stopPropagation(); openOtPopover(row, day); }}
          >
            ⚡
          </div>
        )}
      </div>
    );

    // OT popover content
    const otContent = (
      <div style={{ width: 260 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#334155', marginBottom: 10 }}>
          ⚡ Tăng ca X – Ngày {day}/{parseInt(monthKey.split('-')[1])}
        </div>
        <Form form={otForm} layout="vertical" onFinish={handleOtSave} size="small">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
            <Form.Item name="ot_end_time" label="Giờ ra" rules={[{ required: true, message: 'Nhập giờ ra!' }]}>
              <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="20:00" minuteStep={30} />
            </Form.Item>
            <Form.Item name="ot_hours" label="Số giờ OT" rules={[{ required: true, message: 'Nhập!' }]}>
              <InputNumber min={0} max={8} step={0.5} style={{ width: '100%' }} placeholder="3.5" addonAfter="h" />
            </Form.Item>
          </div>
          <Form.Item name="meal_count" label="Số bữa ăn OT">
            <InputNumber min={0} max={3} style={{ width: '100%' }} addonAfter="bữa" />
          </Form.Item>
          {watchMealCount > 0 && (
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6,
              padding: '6px 10px', marginBottom: 10,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 12, color: '#475569' }}>
                Tiền cơm ({watchMealCount} × {mealAllowancePerMeal.toLocaleString('vi-VN')}đ)
              </span>
              <strong style={{ color: '#16a34a', fontSize: 12 }}>
                {(watchMealCount * mealAllowancePerMeal).toLocaleString('vi-VN')}đ
              </strong>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <Button
              type="primary" htmlType="submit" size="small" icon={<CheckOutlined />}
              loading={saveOt.isPending}
              style={{ flex: 1, background: '#f59e0b', borderColor: '#f59e0b' }}
            >
              Lưu
            </Button>
            {otPopover?.existing && (
              <Button
                size="small" danger icon={<DeleteOutlined />}
                loading={deleteOt.isPending}
                onClick={() => deleteOt.mutate({ employee_id: otPopover.employee_id, work_date: otPopover.workDate })}
              >
                Xóa
              </Button>
            )}
            <Button size="small" onClick={() => setOtPopover(null)}>Hủy</Button>
          </div>
        </Form>
      </div>
    );

    if (isXShift) {
      return (
        <Popover
          content={otContent}
          open={isOtOpen}
          onOpenChange={(open) => { if (!open) setOtPopover(null); }}
          trigger="click"
          placement="bottom"
        >
          {cellContent}
        </Popover>
      );
    }

    return cellContent;
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><CalendarOutlined style={{ marginRight: 6 }} />Lich lam viec</h1>
          <div className="sub">
            Thang {dayjs(monthKey).format('M/YYYY')} – {filteredRows.length}/{s.rows?.length || 0} nhan vien
            {' | '}Ô trống = ca mặc định, click đổi ca · ⚡ = tăng ca X
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Input
            placeholder="Tim ma NV / ho ten"
            allowClear
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            style={{ width: 190 }}
          />
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
              {filteredRows.map((row) => (
                <tr key={row.employee_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ ...tdStyle, position: 'sticky', left: 0, background: '#fff', zIndex: 1, fontWeight: 500 }}>{row.employee_code}</td>
                  <td style={{ ...tdStyle, position: 'sticky', left: 40, background: '#fff', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                    <Tooltip title={row.full_name}>{row.full_name}</Tooltip>
                  </td>
                  <td style={{ ...tdStyle, position: 'sticky', left: 180, background: '#fff', zIndex: 1, textAlign: 'center' }}>
                    <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{row.default_shift_code}</Tag>
                  </td>
                  {days.map((d) => (
                    <td key={d} style={{ ...tdStyle, padding: '2px 1px', position: 'relative' }}>
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
