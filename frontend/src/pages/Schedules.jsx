import { useState } from 'react';
import { DatePicker, Button, Tag, Select, message, Upload, Spin, Popover, Tooltip, Input, Form, TimePicker, InputNumber } from 'antd';
import { CalendarOutlined, UploadOutlined, SearchOutlined, DeleteOutlined, CheckOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';

const SHIFT_COLORS = {
  X: '#4361ee', XVP: '#6366f1', D: '#7c3aed', CND: '#9333ea',
  CN: '#f59e0b', S: '#10b981', C: '#10b981', P: '#3b82f6',
  N: '#ef4444', OFF: '#94a3b8', L: '#ec4899',
};

const X_OT_SHIFTS = ['X', 'X40'];

export default function Schedules() {
  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const [editingCell, setEditingCell] = useState(null);
  const [otPopover, setOtPopover] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [otForm] = Form.useForm();
  const qc = useQueryClient();

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['schedule', monthKey],
    queryFn: () => api.get('/schedules', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  const { data: shiftList = [] } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.get('/shifts').then((r) => r.data),
  });

  const { data: xOtList = [] } = useQuery({
    queryKey: ['x-overtime', monthKey],
    queryFn: () => api.get('/schedules/x-overtime', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  const xOtMap = {};
  for (const c of xOtList) {
    xOtMap[`${c.employee_id}_${c.work_date}`] = c;
  }

  const shiftX = shiftList.find((s) => s.code === 'X');
  const mealAllowancePerMeal = shiftX ? Number(shiftX.meal_allowance) : 25000;

  const updateCell = useMutation({
    mutationFn: ({ employee_id, day, shift_code }) =>
      api.put('/schedules/cell', { employee_id, day, shift_code }, { params: { month_key: monthKey } }),
    onSuccess: () => { qc.invalidateQueries(['schedule']); setEditingCell(null); },
    onError: (e) => message.error(e.response?.data?.detail || 'Loi'),
  });

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

  const importMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/schedules/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      const d = res.data;
      message.success(`${d.message}`);
      if (d.unknown_shifts?.length) message.warning(`Mã ca không nhận diện: ${d.unknown_shifts.join(', ')}`);
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
    const isXShift = X_OT_SHIFTS.includes(code);
    const otKey = `${row.employee_id}_${workDate}`;
    const hasOt = !!xOtMap[otKey];

    if (isEditing) {
      return (
        <Select
          size="small" autoFocus open style={{ width: 64 }}
          value={val || undefined}
          placeholder={row.default_shift_code}
          allowClear
          onChange={(v) => updateCell.mutate({ employee_id: row.employee_id, day, shift_code: v || null })}
          onBlur={() => setEditingCell(null)}
          options={[
            { value: null, label: 'Mặc định' },
            ...shiftList.map((sh) => ({ value: sh.code, label: sh.code })),
          ]}
        />
      );
    }

    const accentColor = SHIFT_COLORS[code] || '#94a3b8';

    const cellContent = (
      <div className="sch-cell-wrap">
        <div
          className={`sch-cell ${isOverride ? 'sch-cell--override' : ''} ${isSunday && !isOverride ? 'sch-cell--sunday' : ''}`}
          style={isOverride ? {
            background: accentColor + '1a',
            color: accentColor,
            border: `1px solid ${accentColor}44`,
          } : {}}
          onClick={() => setEditingCell({ empId: row.employee_id, day })}
        >
          {code || <span className="sch-cell-empty">–</span>}
        </div>
        {isXShift && (
          <div
            className={`ot-dot ${hasOt ? 'ot-dot--active' : ''}`}
            title={hasOt ? 'Đã có tăng ca – click để sửa' : 'Thêm tăng ca X'}
            onClick={(e) => { e.stopPropagation(); openOtPopover(row, day); }}
          >
            ⚡
          </div>
        )}
      </div>
    );

    const otContent = (
      <div style={{ width: 264 }}>
        <div className="ot-popup-title">
          <ThunderboltOutlined style={{ color: '#f59e0b' }} />
          Tăng ca X – Ngày {day}/{parseInt(monthKey.split('-')[1])}
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
            <div className="ot-meal-preview">
              <span>Tiền cơm ({watchMealCount} × {mealAllowancePerMeal.toLocaleString('vi-VN')}đ)</span>
              <strong>{(watchMealCount * mealAllowancePerMeal).toLocaleString('vi-VN')}đ</strong>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <Button type="primary" htmlType="submit" size="small" icon={<CheckOutlined />}
              loading={saveOt.isPending}
              style={{ flex: 1, background: '#f59e0b', borderColor: '#f59e0b' }}>
              Lưu
            </Button>
            {otPopover?.existing && (
              <Button size="small" danger icon={<DeleteOutlined />}
                loading={deleteOt.isPending}
                onClick={() => deleteOt.mutate({ employee_id: otPopover.employee_id, work_date: otPopover.workDate })}>
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
        <Popover content={otContent} open={isOtOpen}
          onOpenChange={(open) => { if (!open) setOtPopover(null); }}
          trigger="click" placement="bottom">
          {cellContent}
        </Popover>
      );
    }
    return cellContent;
  };

  return (
    <div className="sch-page">
      {/* Title bar */}
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <h2 className="emp-title">Lịch làm việc</h2>
          <div className="emp-stats">
            <div className="emp-stat-chip">
              <span className="emp-stat-dot emp-stat-dot--blue" />
              Tháng {dayjs(monthKey).format('M/YYYY')}
            </div>
            <div className="emp-stat-chip">
              <span className="emp-stat-dot emp-stat-dot--green" />
              {filteredRows.length}/{s.rows?.length || 0} nhân viên
            </div>
            <div className="emp-stat-chip" style={{ color: '#9ca3af', fontSize: 11 }}>
              Click ô để đổi ca · ⚡ tăng ca X
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Upload accept=".xlsx,.xls" showUploadList={false}
            beforeUpload={(file) => { importMut.mutate(file); return false; }}>
            <Button icon={<UploadOutlined />} loading={importMut.isPending} size="middle">
              Import Excel
            </Button>
          </Upload>
        </div>
      </div>

      {/* Filter bar */}
      <div className="emp-filterbar">
        <DatePicker
          picker="month" value={dayjs(monthKey)}
          onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
          format="[Tháng] M/YYYY" style={{ width: 140 }}
          suffixIcon={<CalendarOutlined style={{ color: '#9ca3af' }} />}
          size="middle"
        />
        <Input
          placeholder="Tìm mã NV, họ tên..."
          allowClear value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
          style={{ width: 220 }}
          size="middle"
        />
      </div>

      {/* Schedule grid */}
      <div className="sch-table-card">
        {isLoading ? (
          <div className="sch-loading"><Spin size="large" /></div>
        ) : (
          <div className="sch-scroll">
            <table className="sch-table">
              <thead>
                <tr>
                  <th className="sch-th sch-th--sticky0">Mã</th>
                  <th className="sch-th sch-th--sticky1">Họ tên</th>
                  <th className="sch-th sch-th--sticky2">Ca</th>
                  {days.map((d) => {
                    const dow = s.weekdays[d];
                    const isSun = dow === 'CN';
                    return (
                      <th key={d} className={`sch-th sch-th--day ${isSun ? 'sch-th--sun' : ''}`}>
                        <div className="sch-th-day-num">{d}</div>
                        <div className="sch-th-dow">{dow}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => (
                  <tr key={row.employee_id} className={`sch-row ${idx % 2 === 0 ? '' : 'sch-row--alt'}`}>
                    <td className="sch-td sch-td--sticky0 sch-td--code">{row.employee_code}</td>
                    <td className="sch-td sch-td--sticky1 sch-td--name">
                      <Tooltip title={row.full_name}>
                        <div className="sch-name-inner">
                          <div className="sch-avatar">{(row.full_name || '?')[0].toUpperCase()}</div>
                          <span className="sch-name-text">{row.full_name}</span>
                        </div>
                      </Tooltip>
                    </td>
                    <td className="sch-td sch-td--sticky2 sch-td--shift">
                      <Tag color="blue" style={{ margin: 0, fontSize: 10, borderRadius: 4, padding: '0 5px' }}>
                        {row.default_shift_code}
                      </Tag>
                    </td>
                    {days.map((d) => {
                      const dow = s.weekdays[d];
                      const isSun = dow === 'CN';
                      return (
                        <td key={d} className={`sch-td sch-td--cell ${isSun ? 'sch-td--sun' : ''}`}>
                          {renderCell(row, d)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={3 + days.length} className="sch-empty">
                      Không có dữ liệu
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
