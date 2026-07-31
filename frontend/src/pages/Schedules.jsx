import { useState, useMemo } from 'react';
import { DatePicker, Button, Tag, Select, message, Upload, Spin, Popover, Tooltip, Input, Form, TimePicker, InputNumber, Alert, Table as AntTable, Segmented, Popconfirm, Modal, Space } from 'antd';
import { CalendarOutlined, UploadOutlined, SearchOutlined, DeleteOutlined, CheckOutlined, ThunderboltOutlined, LockOutlined, CheckCircleOutlined, EditOutlined, TeamOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import useMonthStore from '../stores/monthStore';

const SHIFT_COLORS = {
  X: '#4361ee', XVP: '#6366f1', D: '#7c3aed', CND: '#9333ea',
  CN: '#f59e0b', S: '#10b981', C: '#10b981', P: '#3b82f6',
  N: '#ef4444', OFF: '#94a3b8', L: '#ec4899',
};

const X_OT_SHIFTS = ['X', 'X40'];

export default function Schedules() {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const { monthKey, setMonthKey } = useMonthStore();
  const [editingCell, setEditingCell] = useState(null);
  const [otPopover, setOtPopover] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [otForm] = Form.useForm();
  const qc = useQueryClient();

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['schedule', monthKey],
    queryFn: () => api.get('/schedules', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  const { data: shiftTemplates = [] } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.get('/shifts').then((r) => r.data),
  });

  const { data: xOtConfigs = [] } = useQuery({
    queryKey: ['x-overtime', monthKey],
    queryFn: () => api.get('/schedules/x-overtime', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  const xOtMap = useMemo(() => {
    const map = {};
    xOtConfigs.forEach((c) => {
      map[`${c.employee_id}_${c.work_date}`] = c;
    });
    return map;
  }, [xOtConfigs]);

  const shiftList = useMemo(() => shiftTemplates.filter((s) => s.is_active !== false), [shiftTemplates]);

  // Batch override states
  const [batchModal, setBatchModal] = useState(false);
  const [batchTab, setBatchTab] = useState('add'); // 'add' or 'history'
  const [historyViewMode, setHistoryViewMode] = useState('groups'); // 'groups' or 'detail'
  const [batchName, setBatchName] = useState('');
  const [batchShiftCode, setBatchShiftCode] = useState(null);
  const [batchDateRange, setBatchDateRange] = useState([]); // [dayjs, dayjs]
  const [batchDept, setBatchDept] = useState(null);
  const [batchSearchTerm, setBatchSearchTerm] = useState('');
  const [batchSelectedEmps, setBatchSelectedEmps] = useState([]); // list of employee ids
  const [batchHistorySelectedKeys, setBatchHistorySelectedKeys] = useState([]); // selected override IDs in History
  const [selectedGroupKeys, setSelectedGroupKeys] = useState([]); // selected batch group keys
  const [batchEditTargetGroups, setBatchEditTargetGroups] = useState([]); // groups to edit in modal
  const [batchEditShiftModal, setBatchEditShiftModal] = useState(false);
  const [batchEditShiftCode, setBatchEditShiftCode] = useState(null);
  const [batchSaving, setBatchSaving] = useState(false);

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/employees/departments').then((r) => r.data),
    enabled: !isWorker,
  });

  const { data: batchOverrides = [], refetch: refetchBatchOverrides } = useQuery({
    queryKey: ['batch-overrides', monthKey],
    queryFn: () => api.get('/schedules/batch-override', { params: { month_key: monthKey } }).then((r) => r.data),
    enabled: !isWorker && batchModal,
  });

  const { data: batchGroups = [], refetch: refetchBatchGroups } = useQuery({
    queryKey: ['batch-override-groups', monthKey],
    queryFn: () => api.get('/schedules/batch-override/groups', { params: { month_key: monthKey } }).then((r) => r.data),
    enabled: !isWorker && batchModal,
  });

  const batchEligibleEmps = useMemo(() => {
    return (schedule?.rows || []).map((row) => ({
      key: row.employee_id,
      employee_id: row.employee_id,
      employee_code: row.employee_code,
      full_name: row.full_name,
      department: row.department,
    }));
  }, [schedule]);

  const filteredBatchEmps = useMemo(() => {
    return batchEligibleEmps.filter((emp) => {
      const matchDept = !batchDept || emp.department === batchDept;
      const matchSearch = !batchSearchTerm ||
        emp.employee_code.toLowerCase().includes(batchSearchTerm.toLowerCase()) ||
        emp.full_name.toLowerCase().includes(batchSearchTerm.toLowerCase());
      return matchDept && matchSearch;
    });
  }, [batchEligibleEmps, batchDept, batchSearchTerm]);

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
  const isLocked = !!s.is_locked;
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

  // Batch override handlers
  const handleBatchSave = async () => {
    if (!batchShiftCode || !batchDateRange?.[0] || !batchDateRange?.[1] || batchSelectedEmps.length === 0) {
      message.warning('Vui lòng điền đầy đủ thông tin');
      return;
    }
    setBatchSaving(true);
    try {
      await api.post('/schedules/batch-override', {
        month_key: monthKey,
        start_date: batchDateRange[0].format('YYYY-MM-DD'),
        end_date: batchDateRange[1].format('YYYY-MM-DD'),
        employee_ids: batchSelectedEmps,
        shift_code: batchShiftCode,
        batch_name: batchName || undefined,
      });
      message.success('Đã áp dụng ca làm hàng loạt');
      setBatchModal(false);
      qc.invalidateQueries({ queryKey: ['schedule'] });
      // Reset form states
      setBatchName('');
      setBatchShiftCode(null);
      setBatchDateRange([]);
      setBatchSelectedEmps([]);
      setBatchDept(null);
      setBatchSearchTerm('');
      refetchBatchOverrides();
      refetchBatchGroups();
    } catch {
      message.error('Lỗi khi áp dụng ca làm');
    } finally {
      setBatchSaving(false);
    }
  };

  const handleBatchDelete = async (idsToDelete) => {
    if (!idsToDelete || idsToDelete.length === 0) return;
    setBatchSaving(true);
    try {
      await api.delete('/schedules/batch-override', {
        data: { ids: idsToDelete, month_key: monthKey },
      });
      message.success('Đã xóa ca tùy chỉnh');
      setBatchHistorySelectedKeys((prev) => prev.filter((k) => !idsToDelete.includes(k)));
      refetchBatchOverrides();
      refetchBatchGroups();
      qc.invalidateQueries({ queryKey: ['schedule'] });
    } catch {
      message.error('Lỗi khi xóa');
    } finally {
      setBatchSaving(false);
    }
  };

  const handleBatchUpdate = async () => {
    const targetIds = batchEditTargetGroups.length > 0
      ? batchEditTargetGroups.flatMap((g) => g.ids)
      : batchHistorySelectedKeys;

    if (!batchEditShiftCode || targetIds.length === 0) {
      message.warning('Vui lòng chọn mã ca');
      return;
    }
    setBatchSaving(true);
    try {
      await api.put('/schedules/batch-override', {
        ids: targetIds,
        shift_code: batchEditShiftCode,
        month_key: monthKey,
      });
      message.success('Đã cập nhật mã ca làm');
      setBatchEditShiftModal(false);
      setBatchEditShiftCode(null);
      setBatchEditTargetGroups([]);
      setBatchHistorySelectedKeys([]);
      setSelectedGroupKeys([]);
      refetchBatchOverrides();
      refetchBatchGroups();
      qc.invalidateQueries({ queryKey: ['schedule'] });
    } catch {
      message.error('Lỗi khi cập nhật');
    } finally {
      setBatchSaving(false);
    }
  };

  const handleDeleteBatchGroups = async (groupsToDelete) => {
    if (!groupsToDelete || groupsToDelete.length === 0) return;
    const allIdsToDelete = groupsToDelete.flatMap((g) => g.ids);
    setBatchSaving(true);
    try {
      await api.delete('/schedules/batch-override', {
        data: { ids: allIdsToDelete, month_key: monthKey },
      });
      message.success(`Đã xóa ${groupsToDelete.length} đợt ca tùy chỉnh (${allIdsToDelete.length} ca)`);
      setSelectedGroupKeys((prev) => prev.filter((k) => !groupsToDelete.map((g) => g.key).includes(k)));
      refetchBatchOverrides();
      refetchBatchGroups();
      qc.invalidateQueries({ queryKey: ['schedule'] });
    } catch {
      message.error('Lỗi khi xóa đợt tùy chỉnh');
    } finally {
      setBatchSaving(false);
    }
  };

  const handleLoadBatchToForm = (group) => {
    setBatchShiftCode(group.shift_code);
    setBatchDateRange([dayjs(group.start_date), dayjs(group.end_date)]);
    setBatchSelectedEmps(group.employee_ids);
    setBatchTab('add');
    message.info(`Đã tải cấu hình "${group.batch_name}" vào form thêm nhanh`);
  };

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
          size="small"
          autoFocus
          open
          style={{ width: 70 }}
          popupMatchSelectWidth={false}
          dropdownStyle={{ minWidth: 140 }}
          value={val || ''}
          placeholder={row.default_shift_code}
          onChange={(v) => updateCell.mutate({ employee_id: row.employee_id, day, shift_code: v || null })}
          onBlur={() => setEditingCell(null)}
          options={[
            { value: '', label: `Mặc định (${row.default_shift_code || 'X'})` },
            ...shiftList.map((sh) => ({ value: sh.code, label: `${sh.code} ${sh.name ? `(${sh.name})` : ''}` })),
          ]}
        />
      );
    }

    const accentColor = isOverride ? '#16a34a' : (SHIFT_COLORS[code] || '#94a3b8');

    const cellContent = (
      <div className="sch-cell-wrap">
        <div
          className={`sch-cell ${isOverride ? 'sch-cell--override' : ''} ${isSunday && !isOverride ? 'sch-cell--sunday' : ''}`}
          style={isOverride ? {
            background: accentColor + '1a',
            color: accentColor,
            border: `1px solid ${accentColor}44`,
          } : {}}
          onClick={() => !isLocked && !isWorker && setEditingCell({ empId: row.employee_id, day })}
        >
          {code || <span className="sch-cell-empty">–</span>}
        </div>
        {isXShift && (
          <div
            className={`ot-dot ${hasOt ? 'ot-dot--active' : ''}`}
            title={isWorker ? (hasOt ? 'Có tăng ca' : '') : (hasOt ? 'Đã có tăng ca – click để sửa' : 'Thêm tăng ca X')}
            onClick={(e) => { e.stopPropagation(); !isLocked && !isWorker && openOtPopover(row, day); }}
            style={{ cursor: isWorker ? 'default' : 'pointer' }}
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

    if (isXShift && !isWorker) {
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
            {isLocked ? (
              <Tag color="red" icon={<LockOutlined />} style={{ borderRadius: 6, margin: 0, padding: '0 8px', display: 'flex', alignItems: 'center' }}>
                Đã chốt (Xem chi tiết)
              </Tag>
            ) : (
              <div className="emp-stat-chip" style={{ color: '#9ca3af', fontSize: 11 }}>
                {isWorker ? 'Chế độ xem (Chỉ đọc)' : 'Click ô để đổi ca · ⚡ tăng ca X'}
              </div>
            )}
          </div>
        </div>
        {!isWorker && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button
              type="primary"
              icon={<CalendarOutlined />}
              onClick={() => { setBatchModal(true); setBatchTab('add'); }}
              disabled={isLocked}
              style={{ background: '#10b981', borderColor: '#10b981' }}
            >
              Quản lý ca tùy chỉnh
            </Button>
            <Upload accept=".xlsx,.xls" showUploadList={false} disabled={isLocked}
              beforeUpload={(file) => { if (!isLocked) { importMut.mutate(file); } return false; }}>
              <Button icon={<UploadOutlined />} loading={importMut.isPending} size="middle" disabled={isLocked}>
                Import Excel
              </Button>
            </Upload>
          </div>
        )}
      </div>

      {isLocked && (
        <Alert
          title={`Dữ liệu lịch làm việc tháng ${dayjs(monthKey).format('M/YYYY')} đã được chốt (khóa dữ liệu).`}
          description="Hệ thống đang hoạt động ở chế độ xem chi tiết (chỉ đọc). Mọi thay đổi đối với lịch làm việc và cấu hình tăng ca đều bị vô hiệu hóa."
          type="warning"
          showIcon
          icon={<LockOutlined />}
          style={{ marginBottom: 16, borderRadius: 8 }}
        />
      )}

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

      {/* Batch Override Modals */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarOutlined style={{ color: '#10b981' }} />
            <span>Quản lý ca tùy chỉnh (Hàng loạt)</span>
          </div>
        }
        open={batchModal}
        onCancel={() => setBatchModal(false)}
        width={750}
        centered
        footer={batchTab === 'add' ? [
          <Button key="cancel" onClick={() => setBatchModal(false)}>Hủy</Button>,
          <Button
            key="submit"
            type="primary"
            loading={batchSaving}
            disabled={!batchShiftCode || !batchDateRange?.[0] || !batchDateRange?.[1] || batchSelectedEmps.length === 0}
            style={{ background: '#10b981', borderColor: '#10b981' }}
            onClick={handleBatchSave}
          >
            Áp dụng cho {batchSelectedEmps.length} nhân viên
          </Button>,
        ] : (
          historyViewMode === 'groups' ? [
            <Button key="cancel" onClick={() => setBatchModal(false)}>Đóng</Button>,
            <Button
              key="edit-group-batch"
              type="primary"
              disabled={selectedGroupKeys.length === 0}
              onClick={() => {
                const selected = batchGroups.filter((g) => selectedGroupKeys.includes(g.key));
                setBatchEditTargetGroups(selected);
                setBatchEditShiftCode(null);
                setBatchEditShiftModal(true);
              }}
              style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
            >
              Sửa mã ca đợt đã chọn ({selectedGroupKeys.length})
            </Button>,
            <Popconfirm
              key="delete-group-batch-confirm"
              title={`Xóa ${selectedGroupKeys.length} đợt tùy chỉnh đã chọn?`}
              description="Tất cả ca thuộc các đợt này sẽ bị xóa và quay về mặc định."
              onConfirm={() => {
                const selected = batchGroups.filter((g) => selectedGroupKeys.includes(g.key));
                handleDeleteBatchGroups(selected);
              }}
              okText="Xóa đợt đã chọn"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              disabled={selectedGroupKeys.length === 0}
            >
              <Button key="delete-group-batch" danger loading={batchSaving} disabled={selectedGroupKeys.length === 0}>
                Xóa đợt đã chọn ({selectedGroupKeys.length})
              </Button>
            </Popconfirm>,
          ] : [
            <Button key="cancel" onClick={() => setBatchModal(false)}>Đóng</Button>,
            <Button
              key="edit-batch"
              type="primary"
              disabled={batchHistorySelectedKeys.length === 0}
              onClick={() => {
                setBatchEditTargetGroups([]);
                setBatchEditShiftCode(null);
                setBatchEditShiftModal(true);
              }}
              style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
            >
              Sửa mã ca ({batchHistorySelectedKeys.length})
            </Button>,
            <Popconfirm
              key="delete-batch-confirm"
              title={`Xóa ${batchHistorySelectedKeys.length} ca tùy chỉnh đã chọn?`}
              description="Lịch làm sẽ quay về mặc định."
              onConfirm={() => handleBatchDelete(batchHistorySelectedKeys)}
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              disabled={batchHistorySelectedKeys.length === 0}
            >
              <Button key="delete-batch" danger loading={batchSaving} disabled={batchHistorySelectedKeys.length === 0}>
                Xóa đã chọn ({batchHistorySelectedKeys.length})
              </Button>
            </Popconfirm>,
          ]
        )}
      >
        <Segmented
          value={batchTab}
          onChange={(val) => setBatchTab(val)}
          options={[
            { value: 'add', label: `Thêm nhanh`, icon: <ThunderboltOutlined /> },
            { value: 'history', label: `Lịch sử tùy chỉnh (${batchGroups.length} đợt / ${batchOverrides.length} ca)`, icon: <CalendarOutlined /> },
          ]}
          block
          style={{ marginBottom: 16 }}
        />

        {batchTab === 'add' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Batch Name input */}
            <div>
              <div style={{ fontWeight: 500, marginBottom: 6, fontSize: 13 }}>
                Tên đợt / Ghi chú lần thêm <span style={{ color: '#9ca3af', fontWeight: 400 }}>(Tùy chọn, ví dụ: Lần đổi ca ngày 26)</span>:
              </div>
              <Input
                placeholder="Ví dụ: Đổi ca ngày 26, Ca trực lễ 2/9, Tăng ca đợt 1..."
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                allowClear
              />
            </div>

            {/* Top selectors */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 500, marginBottom: 6, fontSize: 13 }}>Chọn mã ca làm việc:</div>
                <Select
                  style={{ width: '100%' }}
                  placeholder="Chọn ca..."
                  value={batchShiftCode}
                  onChange={setBatchShiftCode}
                  options={shiftList.map((sh) => ({ value: sh.code, label: `${sh.code} (${sh.name || ''})` }))}
                />
              </div>
              <div>
                <div style={{ fontWeight: 500, marginBottom: 6, fontSize: 13 }}>Chọn khoảng thời gian:</div>
                <DatePicker.RangePicker
                  style={{ width: '100%' }}
                  value={batchDateRange}
                  onChange={(val) => setBatchDateRange(val || [])}
                  format="DD/MM/YYYY"
                />
              </div>
            </div>

            {/* Department selector and employee search */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'end' }}>
              <div>
                <div style={{ fontWeight: 500, marginBottom: 6, fontSize: 13 }}>Lọc theo Bộ phận:</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Select
                    style={{ flex: 1 }}
                    placeholder="Tất cả bộ phận"
                    allowClear
                    value={batchDept}
                    onChange={(val) => {
                      setBatchDept(val);
                      setBatchSelectedEmps([]);
                    }}
                    options={departments.map((d) => ({ value: d, label: d }))}
                  />
                  {batchDept && (
                    <Button
                      onClick={() => {
                        const filteredIds = filteredBatchEmps.map((emp) => emp.employee_id);
                        setBatchSelectedEmps(filteredIds);
                        message.success(`Đã chọn toàn bộ ${filteredIds.length} nhân viên của bộ phận ${batchDept}`);
                      }}
                      style={{ background: '#f3f4f6' }}
                    >
                      Chọn hết
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 500, marginBottom: 6, fontSize: 13 }}>Tìm kiếm nhân viên:</div>
                <Input
                  placeholder="Tìm theo mã NV, tên..."
                  prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
                  value={batchSearchTerm}
                  onChange={(e) => setBatchSearchTerm(e.target.value)}
                  allowClear
                />
              </div>
            </div>

            {/* Employee selection Table */}
            <div>
              <div style={{ fontWeight: 500, marginBottom: 6, fontSize: 13 }}>
                Chọn nhân viên ({batchSelectedEmps.length}/{filteredBatchEmps.length} đang lọc):
              </div>
              <AntTable
                dataSource={filteredBatchEmps}
                rowKey="employee_id"
                columns={[
                  { title: 'Mã NV', dataIndex: 'employee_code', width: 100 },
                  { title: 'Họ tên', dataIndex: 'full_name' },
                  { title: 'Bộ phận', dataIndex: 'department', width: 150 },
                ]}
                rowSelection={{
                  selectedRowKeys: batchSelectedEmps,
                  onChange: setBatchSelectedEmps,
                }}
                size="small"
                pagination={{ pageSize: 5, showSizeChanger: false }}
                scroll={{ y: 220 }}
              />
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                Quản lý theo <b>Đợt áp dụng (Lần thêm)</b> giúp sửa/xóa 1 đợt nhiều nhân viên với 1-click.
              </div>
              <Segmented
                size="small"
                value={historyViewMode}
                onChange={(val) => setHistoryViewMode(val)}
                options={[
                  { value: 'groups', label: `Theo đợt (${batchGroups.length})`, icon: <AppstoreOutlined /> },
                  { value: 'detail', label: `Dòng lẻ (${batchOverrides.length})`, icon: <UnorderedListOutlined /> },
                ]}
              />
            </div>

            {historyViewMode === 'groups' ? (
              <AntTable
                dataSource={batchGroups}
                rowKey="key"
                columns={[
                  {
                    title: 'Đợt áp dụng / Thời gian',
                    dataIndex: 'batch_name',
                    key: 'batch_name',
                    render: (v, r) => (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{v}</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                          <CalendarOutlined style={{ marginRight: 4 }} />
                          Áp dụng: <b>{r.start_date_fmt}</b> – <b>{r.end_date_fmt}</b> ({r.days_count} ngày)
                        </div>
                      </div>
                    ),
                  },
                  {
                    title: 'Mã ca',
                    dataIndex: 'shift_code',
                    width: 90,
                    render: (c) => <Tag color="green" style={{ fontWeight: 700, fontSize: 12 }}>{c}</Tag>,
                  },
                  {
                    title: 'Nhân viên áp dụng',
                    key: 'employees',
                    width: 140,
                    render: (_, r) => (
                      <Tooltip
                        title={
                          <div style={{ maxHeight: 200, overflowY: 'auto', padding: 4 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4, borderBottom: '1px solid #374151', paddingBottom: 2 }}>
                              Danh sách ({r.employee_count} NV):
                            </div>
                            {r.employees.map((emp) => (
                              <div key={emp.employee_id} style={{ fontSize: 11 }}>
                                • {emp.employee_code} - {emp.full_name} ({emp.department || 'Chưa xếp'})
                              </div>
                            ))}
                          </div>
                        }
                      >
                        <div style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600, fontSize: 13 }}>
                          <TeamOutlined style={{ marginRight: 4 }} />
                          {r.employee_count} NV
                        </div>
                      </Tooltip>
                    ),
                  },
                  {
                    title: 'Tổng số ca',
                    dataIndex: 'record_count',
                    width: 90,
                    align: 'center',
                    render: (v) => <span style={{ fontWeight: 600, color: '#059669' }}>{v} ca</span>,
                  },
                  {
                    title: 'Thao tác',
                    key: 'action',
                    width: 110,
                    align: 'center',
                    render: (_, r) => (
                      <Space size={4}>
                        <Tooltip title="Tải đợt này vào Form thêm nhanh">
                          <Button
                            type="text"
                            icon={<ThunderboltOutlined style={{ color: '#d97706' }} />}
                            size="small"
                            onClick={() => handleLoadBatchToForm(r)}
                          />
                        </Tooltip>
                        <Tooltip title="Sửa mã ca cho cả đợt này">
                          <Button
                            type="text"
                            icon={<EditOutlined style={{ color: '#2563eb' }} />}
                            size="small"
                            onClick={() => {
                              setBatchEditTargetGroups([r]);
                              setBatchEditShiftCode(r.shift_code);
                              setBatchEditShiftModal(true);
                            }}
                          />
                        </Tooltip>
                        <Popconfirm
                          title="Xóa cả đợt tùy chỉnh này?"
                          description={`Xóa toàn bộ ${r.record_count} ca thuộc đợt này. Lịch làm sẽ quay về mặc định.`}
                          onConfirm={() => handleDeleteBatchGroups([r])}
                          okText="Xóa cả đợt"
                          cancelText="Hủy"
                          okButtonProps={{ danger: true }}
                        >
                          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                        </Popconfirm>
                      </Space>
                    ),
                  },
                ]}
                rowSelection={{
                  selectedRowKeys: selectedGroupKeys,
                  onChange: setSelectedGroupKeys,
                }}
                size="small"
                pagination={{ pageSize: 6 }}
                scroll={{ y: 320 }}
              />
            ) : (
              <AntTable
                dataSource={batchOverrides}
                rowKey="id"
                columns={[
                  {
                    title: 'Họ tên',
                    dataIndex: 'full_name',
                    render: (v, r) => (
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.employee_code}</div>
                      </div>
                    ),
                  },
                  {
                    title: 'Bộ phận',
                    dataIndex: 'department',
                  },
                  {
                    title: 'Ngày',
                    dataIndex: 'work_date',
                    render: (d) => dayjs(d).format('DD/MM/YYYY'),
                    sorter: (a, b) => a.work_date.localeCompare(b.work_date),
                  },
                  {
                    title: 'Ca tùy chỉnh',
                    dataIndex: 'shift_code',
                    render: (c) => <Tag color="green" style={{ fontWeight: 600 }}>{c}</Tag>,
                    filters: Array.from(new Set(batchOverrides.map(o => o.shift_code))).map(c => ({ text: c, value: c })),
                    onFilter: (value, record) => record.shift_code === value,
                  },
                  {
                    title: 'Hành động',
                    key: 'action',
                    width: 80,
                    align: 'center',
                    render: (_, r) => (
                      <Popconfirm
                        title="Xóa ca tùy chỉnh này?"
                        description="Lịch làm sẽ quay về mặc định."
                        onConfirm={() => handleBatchDelete([r.id])}
                        okText="Xóa"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                      >
                        <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                      </Popconfirm>
                    ),
                  },
                ]}
                rowSelection={{
                  selectedRowKeys: batchHistorySelectedKeys,
                  onChange: setBatchHistorySelectedKeys,
                }}
                size="small"
                pagination={{ pageSize: 8 }}
                scroll={{ y: 320 }}
              />
            )}
          </div>
        )}
      </Modal>

      {/* Mini modal to edit shift code for batch history selection */}
      <Modal
        title="Sửa mã ca tùy chỉnh"
        open={batchEditShiftModal}
        onCancel={() => {
          setBatchEditShiftModal(false);
          setBatchEditTargetGroups([]);
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setBatchEditShiftModal(false);
            setBatchEditTargetGroups([]);
          }}>Hủy</Button>,
          <Button
            key="submit"
            type="primary"
            loading={batchSaving}
            disabled={!batchEditShiftCode}
            style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
            onClick={handleBatchUpdate}
          >
            Lưu thay đổi cho {batchEditTargetGroups.length > 0
              ? `${batchEditTargetGroups.length} đợt (${batchEditTargetGroups.reduce((acc, g) => acc + g.record_count, 0)} ca)`
              : `${batchHistorySelectedKeys.length} ca`}
          </Button>,
        ]}
        centered
        width={350}
      >
        <div style={{ padding: '12px 0' }}>
          <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>Chọn mã ca mới:</div>
          <Select
            style={{ width: '100%' }}
            placeholder="Chọn ca..."
            value={batchEditShiftCode}
            onChange={setBatchEditShiftCode}
            options={shiftList.map((sh) => ({ value: sh.code, label: `${sh.code} (${sh.name || ''})` }))}
          />
        </div>
      </Modal>
    </div>
  );
}
