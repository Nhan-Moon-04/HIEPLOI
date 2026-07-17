import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatePicker, Select, Spin, Tooltip, Button, Space, Modal, Input, InputNumber, Form, message, Popconfirm, Table as AntTable, Tag, Segmented } from 'antd';
import {
  DollarCircleOutlined,
  DownloadOutlined,
  CalendarOutlined,
  SettingOutlined,
  TeamOutlined,
  SearchOutlined,
  MoonOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

const { RangePicker } = DatePicker;

let mealAllowanceFilters = null;

const getInitialFilters = () => {
  const defaultStart = dayjs().startOf('month');
  const defaultEnd = dayjs().endOf('month');

  if (!mealAllowanceFilters) {
    return {
      monthKey: dayjs().format('YYYY-MM'),
      dateRange: [defaultStart, defaultEnd],
    };
  }

  const start = mealAllowanceFilters.start_date ? dayjs(mealAllowanceFilters.start_date) : defaultStart;
  const end = mealAllowanceFilters.end_date ? dayjs(mealAllowanceFilters.end_date) : defaultEnd;

  return {
    monthKey: mealAllowanceFilters.month_key || start.format('YYYY-MM'),
    dateRange: [start, end],
  };
};

export default function MealAllowance() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const queryClient = useQueryClient();
  const initialFilters = useMemo(() => getInitialFilters(), []);
  const [monthKey, setMonthKey] = useState(initialFilters.monthKey);
  const [dept, setDept] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState(initialFilters.dateRange);
  const [nightModal, setNightModal] = useState(false);
  const [nightAllowanceRate, setNightAllowanceRate] = useState(0);
  const [nightOtTarget, setNightOtTarget] = useState(null); // { cell, employeeId }
  const [nightOtSaving, setNightOtSaving] = useState(false);
  const [quickModal, setQuickModal] = useState(false);
  const [quickTab, setQuickTab] = useState('eligible');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectedDeleteKeys, setSelectedDeleteKeys] = useState([]);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickDeleting, setQuickDeleting] = useState(false);

  // State cho Chỉnh sửa Tăng ca Thủ công (Double Click)
  const [editManualModal, setEditManualModal] = useState(false);
  const [editManualTarget, setEditManualTarget] = useState(null); // { cell, row }
  const [editManualMealCount, setEditManualMealCount] = useState(0);
  const [editManualWithNight, setEditManualWithNight] = useState(false);
  const [editManualSaving, setEditManualSaving] = useState(false);

  // State cho duyệt giờ bất thường
  const [approvalModal, setApprovalModal] = useState(false);
  const [approvalTab, setApprovalTab] = useState('pending');
  const [selectedApprovalKeys, setSelectedApprovalKeys] = useState([]);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [approvalReason, setApprovalReason] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('nightAllowanceRate');
    setNightAllowanceRate(saved ? Number(saved) : 100000);
  }, []);

  useEffect(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) return;
    mealAllowanceFilters = {
      month_key: monthKey,
      start_date: dateRange[0].format('YYYY-MM-DD'),
      end_date: dateRange[1].format('YYYY-MM-DD'),
    };
  }, [monthKey, dateRange]);

  const handleSaveNightAllowance = (val) => {
    setNightAllowanceRate(val);
    localStorage.setItem('nightAllowanceRate', val);
    setNightModal(false);
    message.success('Đã lưu mức phụ cấp ca đêm');
  };

  const handleNightOtSave = async (withNightPccd) => {
    if (!nightOtTarget) return;
    const { cell, employeeId } = nightOtTarget;
    setNightOtSaving(true);
    try {
      const payload = { employee_id: employeeId, work_date: cell.work_date, meal_count: 1 };
      if (withNightPccd) payload.ot_end_time = '23:30';
      await api.put('/schedules/x-overtime', payload);
      message.success(withNightPccd ? 'Đã thêm bữa ăn và PC ca đêm' : 'Đã thêm bữa ăn');
      setNightOtTarget(null);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch {
      message.error('Lỗi khi lưu');
    } finally {
      setNightOtSaving(false);
    }
  };

  // ─── XỬ LÝ DOUBLE-CLICK CHỈNH SỬA TĂNG CA THỦ CÔNG ──────────────────────────
  const handleCellDoubleClick = (cell, row) => {
    if (cell.status === 'no_data') return;
    setEditManualTarget({ cell, row });
    if (cell.has_manual_xot) {
      setEditManualMealCount(cell.manual_meal_count || 1);
      const hasNightTime = cell.manual_ot_end_time && cell.manual_ot_end_time >= '23:00';
      setEditManualWithNight(hasNightTime || cell.night_allowance > 0);
    } else {
      setEditManualMealCount(cell.meal_count || 1);
      setEditManualWithNight(cell.night_allowance > 0);
    }
    setEditManualModal(true);
  };

  const handleSaveManualOverride = async () => {
    if (!editManualTarget) return;
    const { cell, row } = editManualTarget;
    setEditManualSaving(true);
    try {
      const payload = {
        employee_id: row.employee_id,
        work_date: cell.work_date,
        meal_count: editManualMealCount,
      };
      if (editManualWithNight) {
        payload.ot_end_time = '23:30';
      } else {
        payload.ot_end_time = null;
      }
      await api.put('/schedules/x-overtime', payload);
      message.success('Đã cập nhật tăng ca thủ công');
      setEditManualModal(false);
      setEditManualTarget(null);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch {
      message.error('Lỗi khi lưu');
    } finally {
      setEditManualSaving(false);
    }
  };

  const handleDeleteManualOverride = async () => {
    if (!editManualTarget) return;
    const { cell, row } = editManualTarget;
    setEditManualSaving(true);
    try {
      await api.delete('/schedules/x-overtime', {
        params: {
          employee_id: row.employee_id,
          work_date: cell.work_date,
        }
      });
      message.success('Đã xóa tăng ca thủ công (khôi phục tính tự động)');
      setEditManualModal(false);
      setEditManualTarget(null);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch {
      message.error('Lỗi khi xóa tăng ca');
    } finally {
      setEditManualSaving(false);
    }
  };

  const handleQuickOtSave = async () => {
    if (selectedRowKeys.length === 0) return;
    setQuickSaving(true);
    try {
      const selected = eligibleList.filter((r) => selectedRowKeys.includes(r.key));
      await Promise.all(
        selected.map((r) =>
          api.put('/schedules/x-overtime', {
            employee_id: r.employee_id,
            work_date: r.cell.work_date,
            meal_count: 1,
            ...(r.is_night ? { ot_end_time: '23:30' } : {}),
          })
        )
      );
      message.success(`Đã cập nhật ${selected.length} ngày tăng ca`);
      setQuickModal(false);
      setSelectedRowKeys([]);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch {
      message.error('Lỗi khi lưu hàng loạt');
    } finally {
      setQuickSaving(false);
    }
  };

  const { data: att, isLoading } = useQuery({
    queryKey: ['attendance', monthKey, dept, dateRange[0]?.format('YYYY-MM-DD'), dateRange[1]?.format('YYYY-MM-DD'), nightAllowanceRate],
    queryFn: () => api.get('/attendance', {
      params: {
        month_key: monthKey,
        department: dept || undefined,
        start_date: dateRange[0]?.format('YYYY-MM-DD'),
        end_date: dateRange[1]?.format('YYYY-MM-DD'),
        night_allowance_rate: nightAllowanceRate,
      }
    }).then((r) => r.data),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/employees/departments').then((r) => r.data),
    enabled: !isWorker,
  });

  const s = att || { rows: [], days_in_month: 30 };

  const eligibleList = useMemo(() => {
    const result = [];
    for (const row of (att?.rows || [])) {
      for (const cell of (row.days || [])) {
        if (cell.ot_eligible || cell.night_eligible) {
          result.push({
            key: `${row.employee_id}_${cell.work_date}`,
            employee_id: row.employee_id,
            employee_code: row.employee_code,
            full_name: row.full_name,
            cell,
            is_night: !!cell.night_eligible,
          });
        }
      }
    }
    return result.sort((a, b) => a.cell.work_date.localeCompare(b.cell.work_date));
  }, [att]);

  // Danh sách OT đã thêm (manual XOT)
  const addedOtList = useMemo(() => {
    const result = [];
    for (const row of (att?.rows || [])) {
      for (const cell of (row.days || [])) {
        if (cell.has_manual_xot) {
          result.push({
            key: `${row.employee_id}_${cell.work_date}`,
            employee_id: row.employee_id,
            employee_code: row.employee_code,
            full_name: row.full_name,
            department: row.department,
            cell,
            has_night: cell.night_allowance > 0 && cell.manual_ot_end_time >= '23:00',
          });
        }
      }
    }
    return result.sort((a, b) => a.cell.work_date.localeCompare(b.cell.work_date));
  }, [att]);

  const uniqueShiftCodes = useMemo(() => {
    const codes = new Set();
    eligibleList.forEach((r) => {
      if (r.cell.shift_code) codes.add(r.cell.shift_code);
    });
    addedOtList.forEach((r) => {
      if (r.cell.shift_code) codes.add(r.cell.shift_code);
    });
    return Array.from(codes).sort().map((c) => ({ text: c, value: c }));
  }, [eligibleList, addedOtList]);

  const handleBulkDeleteOt = async () => {
    if (selectedDeleteKeys.length === 0) return;
    setQuickDeleting(true);
    try {
      const selected = addedOtList.filter((r) => selectedDeleteKeys.includes(r.key));
      await Promise.all(
        selected.map((r) =>
          api.delete('/schedules/x-overtime', {
            params: { employee_id: r.employee_id, work_date: r.cell.work_date },
          })
        )
      );
      message.success(`Đã xóa ${selected.length} ngày tăng ca`);
      setSelectedDeleteKeys([]);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch {
      message.error('Lỗi khi xóa tăng ca');
    } finally {
      setQuickDeleting(false);
    }
  };

  // ─── DANH SÁCH GIỜ LÀM BẤT THƯỜNG ────────────────────────────
  const irregularList = useMemo(() => {
    const result = [];
    for (const row of (att?.rows || [])) {
      for (const cell of (row.days || [])) {
        if (cell.is_irregular) {
          result.push({
            key: `${row.employee_id}_${cell.work_date}`,
            employee_id: row.employee_id,
            employee_code: row.employee_code,
            full_name: row.full_name,
            department: row.department,
            cell,
            approval_id: cell.meal_approval_id,
            approval_status: cell.meal_approval_status || 'pending',
          });
        }
      }
    }
    return result.sort((a, b) => a.cell.work_date.localeCompare(b.cell.work_date));
  }, [att]);

  const pendingIrregulars = useMemo(() => irregularList.filter(r => r.approval_status === 'pending'), [irregularList]);
  const approvedIrregulars = useMemo(() => irregularList.filter(r => r.approval_status === 'approved'), [irregularList]);

  const handleApproveIrregular = async () => {
    if (selectedApprovalKeys.length === 0) return;
    setApprovalSaving(true);
    try {
      const selected = irregularList.filter((r) => selectedApprovalKeys.includes(r.key));
      const ids = selected.map(r => r.approval_id).filter(Boolean);
      if (ids.length === 0) {
        message.warning('Không có bản ghi để duyệt');
        return;
      }
      await api.put('/meal-approvals/approve', {
        ids,
        meal_count: 1,
        reason: approvalReason || 'Sếp duyệt',
      });
      message.success(`Đã duyệt ${ids.length} ngày`);
      setSelectedApprovalKeys([]);
      setApprovalReason('');
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch {
      message.error('Lỗi khi duyệt');
    } finally {
      setApprovalSaving(false);
    }
  };

  const handleRejectIrregular = async () => {
    if (selectedApprovalKeys.length === 0) return;
    setApprovalSaving(true);
    try {
      const selected = irregularList.filter((r) => selectedApprovalKeys.includes(r.key));
      const ids = selected.map(r => r.approval_id).filter(Boolean);
      if (ids.length === 0) return;
      await api.put('/meal-approvals/reject', {
        ids,
        reason: approvalReason || 'Từ chối',
      });
      message.success(`Đã từ chối ${ids.length} ngày`);
      setSelectedApprovalKeys([]);
      setApprovalReason('');
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch {
      message.error('Lỗi khi từ chối');
    } finally {
      setApprovalSaving(false);
    }
  };

  const handleDeleteApproval = async (approvalId) => {
    if (!approvalId) return;
    setApprovalSaving(true);
    try {
      await api.delete(`/meal-approvals/${approvalId}`);
      message.success('Đã xóa lượt duyệt');
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch {
      message.error('Lỗi khi xóa lượt duyệt');
    } finally {
      setApprovalSaving(false);
    }
  };

  const quickOtColumns = [
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
      title: 'Ca',
      key: 'shift',
      width: 55,
      render: (_, r) => <Tag style={{ fontSize: 10, margin: 0 }}>{r.cell.shift_code || '–'}</Tag>,
      sorter: (a, b) => {
        const codeA = a.cell.shift_code || '';
        const codeB = b.cell.shift_code || '';
        return codeA.localeCompare(codeB);
      },
      filters: uniqueShiftCodes,
      onFilter: (value, record) => record.cell.shift_code === value,
    },
    {
      title: 'Ngày',
      key: 'date',
      width: 75,
      render: (_, r) => dayjs(r.cell.work_date).format('DD/MM'),
    },
    {
      title: 'Giờ ra',
      key: 'checkout',
      width: 72,
      render: (_, r) => r.cell.check_out
        ? <b style={{ color: r.is_night ? '#1d4ed8' : '#d97706' }}>{dayjs(r.cell.check_out).format('HH:mm')}</b>
        : '–',
    },
    {
      title: 'Loại OT',
      key: 'type',
      width: 115,
      render: (_, r) => r.is_night
        ? <Tag color="blue" style={{ fontSize: 11 }}>OT sau 23h</Tag>
        : <Tag color="orange" style={{ fontSize: 11 }}>OT sau 17h50</Tag>,
    },
    {
      title: 'Sẽ thêm',
      key: 'action',
      render: (_, r) => r.is_night
        ? <span style={{ fontSize: 11, color: '#1d4ed8' }}>1 bữa + PC đêm</span>
        : <span style={{ fontSize: 11, color: '#d97706' }}>1 bữa ăn</span>,
    },
  ];

  let days = [];
  if (dateRange[0] && dateRange[1]) {
    const start = dateRange[0].date();
    const end = dateRange[1].date();
    days = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  } else {
    days = Array.from({ length: s.days_in_month }, (_, i) => i + 1);
  }

  const renderMealCell = (cell, employeeId) => {
    if (cell.status === 'no_data') return <span className="ma-cell-dot">·</span>;

    // Giờ làm bất thường - cần duyệt
    if (cell.is_irregular) {
      const approvalStatus = cell.meal_approval_status || 'pending';
      const isApproved = approvalStatus === 'approved';
      const isRejected = approvalStatus === 'rejected';
      const amount = cell.meal_allowance || 0;
      const shortAmount = amount >= 1000 ? `${amount / 1000}k` : (amount ? String(amount) : '0');

      let bgColor, textColor, borderColor, statusLabel;
      if (isApproved) {
        bgColor = '#dcfce7'; textColor = '#15803d'; borderColor = '#86efac'; statusLabel = '✓ Đã duyệt';
      } else if (isRejected) {
        bgColor = '#fef2f2'; textColor = '#991b1b'; borderColor = '#fca5a5'; statusLabel = '✗ Đã từ chối';
      } else {
        bgColor = '#fef3c7'; textColor = '#92400e'; borderColor = '#fcd34d'; statusLabel = '⏳ Chờ duyệt';
      }

      return (
        <Tooltip title={
          <div className="ma-tooltip">
            <div style={{ color: isApproved ? '#22c55e' : (isRejected ? '#ef4444' : '#f59e0b'), fontWeight: 700, marginBottom: 4 }}>
              {statusLabel}
            </div>
            <div style={{ fontSize: 12, color: '#d1d5db', marginBottom: 4 }}>Giờ làm không đủ ca</div>
            {cell.check_in && <div className="ma-tooltip-row">Vào: <b>{dayjs(cell.check_in).format('HH:mm')}</b></div>}
            {cell.check_out && <div className="ma-tooltip-row">Ra: <b>{dayjs(cell.check_out).format('HH:mm')}</b></div>}
            {cell.shift_code && <div className="ma-tooltip-row">Ca: <b>{cell.shift_code}</b> {cell.shift_name}</div>}
            {isApproved && amount > 0 && <div className="ma-tooltip-amount meal">Tiền ăn: <b>{amount.toLocaleString()} đ</b></div>}
            {!isWorker && !isApproved && (
              <div style={{ color: '#fbbf24', fontSize: 11, marginTop: 4, borderTop: '1px dashed #374151', paddingTop: 4 }}>
                💡 Mở "Duyệt giờ bất thường" để xử lý
              </div>
            )}
          </div>
        }>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 32, padding: '1px 5px', borderRadius: 5,
            fontSize: 11, fontWeight: 700,
            background: bgColor, color: textColor, border: `1px solid ${borderColor}`,
            animation: (!isApproved && !isRejected) ? 'ma-irregular-pulse 2s ease-in-out infinite' : 'none',
          }}>
            {isApproved ? shortAmount : '⚠'}
          </div>
        </Tooltip>
      );
    }

    if (cell.status === 'forgot_scan') {
      const amount = cell.meal_allowance || 0;
      const shortAmount = amount >= 1000 ? `${amount / 1000}k` : (amount ? String(amount) : '?');
      return (
        <Tooltip title={
          <div className="ma-tooltip">
            <div style={{ color: '#f87171', fontWeight: 700, marginBottom: 4 }}>⚠ Quên chấm công</div>
            {!cell.check_in && <div style={{ color: '#fca5a5' }}>Thiếu giờ vào</div>}
            {!cell.check_out && <div style={{ color: '#fca5a5' }}>Thiếu giờ ra</div>}
            {cell.check_in && <div className="ma-tooltip-row">Vào: <b>{dayjs(cell.check_in).format('HH:mm')}</b></div>}
            {cell.check_out && <div className="ma-tooltip-row">Ra: <b>{dayjs(cell.check_out).format('HH:mm')}</b></div>}
            {amount > 0 && <div className="ma-tooltip-amount meal">Tiền ăn tạm tính: <b>{amount.toLocaleString()} đ</b></div>}
          </div>
        }>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 32, padding: '1px 5px', borderRadius: 5,
            fontSize: 11, fontWeight: 700,
            background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5',
          }}>
            {shortAmount || '!'}
          </div>
        </Tooltip>
      );
    }

    if (cell.night_eligible) {
      const amount = cell.meal_allowance || 0;
      const shortAmount = amount >= 1000 ? `${amount / 1000}k` : String(amount || '0');
      return (
        <Tooltip title={isWorker ? `Ra ${cell.check_out ? dayjs(cell.check_out).format('HH:mm') : ''} — quá 23h` : `Ra ${cell.check_out ? dayjs(cell.check_out).format('HH:mm') : ''} — quá 23h, click để xử lý`}>
          <div
            className="ma-cell-val ma-cell-val--night-eligible"
            onClick={() => !isWorker && setNightOtTarget({ cell, employeeId })}
            style={{ cursor: isWorker ? 'default' : 'pointer' }}
          >
            {shortAmount}
          </div>
        </Tooltip>
      );
    }

    if (cell.ot_eligible) {
      const amount = cell.meal_allowance || 0;
      const shortAmount = amount >= 1000 ? `${amount / 1000}k` : String(amount || '0');
      if (isWorker) {
        return (
          <div className="ma-cell-val ma-cell-val--ot-eligible" style={{ cursor: 'default' }}>
            {shortAmount}
          </div>
        );
      }
      return (
        <Popconfirm
          title="Thêm bữa tăng ca?"
          description={`Ngày ${dayjs(cell.work_date).format('DD/MM')} — OT sau 17h50 hoặc ≥ 3h`}
          onConfirm={async () => {
            try {
              await api.put('/schedules/x-overtime', {
                employee_id: employeeId,
                work_date: cell.work_date,
                meal_count: 1,
              });
              message.success('Đã thêm bữa tăng ca');
              queryClient.invalidateQueries({ queryKey: ['attendance'] });
            } catch {
              message.error('Lỗi khi thêm bữa tăng ca');
            }
          }}
          okText="Thêm bữa"
          cancelText="Bỏ qua"
        >
          <div className="ma-cell-val ma-cell-val--ot-eligible">
            {shortAmount}
          </div>
        </Popconfirm>
      );
    }

    if (!cell.meal_allowance) return <span className="ma-cell-zero">0</span>;

    const amount = cell.meal_allowance;
    const shortAmount = amount >= 1000 ? `${amount / 1000}k` : amount;

    const isManualNight = cell.has_manual_xot && cell.night_allowance > 0;
    const isManualMeal = cell.has_manual_xot && (cell.manual_meal_count || 0) > 0;
    const hasActiveManual = isManualNight || isManualMeal;

    const extraClass = hasActiveManual
      ? (isManualNight ? 'ma-cell-val--manual-night' : 'ma-cell-val--manual-meal')
      : (cell.night_allowance > 0
        ? 'ma-cell-val--night'
        : (cell.meal_count >= 2 ? 'ma-cell-val--double' : ''));

    return (
      <Tooltip title={
        <div className="ma-tooltip">
          <div className="ma-tooltip-hd">
            <span className="ma-tooltip-code">{cell.shift_code}</span>
            <span className="ma-tooltip-name">{cell.shift_name}</span>
          </div>
          {cell.check_in && <div className="ma-tooltip-row">Vào: <b>{dayjs(cell.check_in).format('HH:mm')}</b></div>}
          {cell.check_out && <div className="ma-tooltip-row">Ra: <b>{dayjs(cell.check_out).format('HH:mm')}</b></div>}
          <div className="ma-tooltip-amount meal">Tiền ăn: <b>{amount.toLocaleString()} đ</b></div>
          {cell.meal_count >= 2 && <div className="ma-tooltip-row" style={{ color: '#2563eb' }}>Bữa ăn: <b>{cell.meal_count} bữa</b></div>}
          {cell.night_allowance > 0 && <div className="ma-tooltip-amount night">PC Đêm: <b>{cell.night_allowance.toLocaleString()} đ</b></div>}
          {hasActiveManual && <div className="ma-tooltip-row" style={{ color: '#7c3aed', fontWeight: 600, marginTop: 2 }}>★ Nhập thủ công</div>}
          {!isWorker && cell.status !== 'no_data' && (
            <div style={{ color: '#9ca3af', fontSize: 10, marginTop: 4, borderTop: '1px dashed #e5e7eb', paddingTop: 4 }}>
              💡 Double-click để chỉnh sửa thủ công
            </div>
          )}
        </div>
      }>
        <div className={`ma-cell-val ${extraClass}`}>
          {shortAmount}
        </div>
      </Tooltip>
    );
  };

  const totalMeal  = s.rows?.reduce((sum, r) => sum + (r.summary?.total_meal_allowance || 0), 0) || 0;
  const totalNight = s.rows?.reduce((sum, r) => sum + (r.summary?.total_night_allowance || 0), 0) || 0;

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredRows = (s.rows || []).filter((row) => {
    if (!normalizedSearch) return true;
    const code = String(row.employee_code || '').toLowerCase();
    const name = String(row.full_name || '').toLowerCase();
    if (code.includes(normalizedSearch) || name.includes(normalizedSearch)) return true;
    const numericNeedle = normalizedSearch.replace(/[^0-9]/g, '');
    if (!numericNeedle) return false;
    const mealStr = String(Math.round(row.summary?.total_meal_allowance || 0));
    const totalStr = String(Math.round((row.summary?.total_meal_allowance || 0) + (row.summary?.total_night_allowance || 0)));
    return mealStr.includes(numericNeedle) || totalStr.includes(numericNeedle);
  });

  const handleExport = async () => {
    const hide = message.loading('Đang xuất file Excel...', 0);
    try {
      const res = await api.get('/import-export/export-meal-allowance', {
        params: {
          start_date: dateRange[0]?.format('YYYY-MM-DD'),
          end_date: dateRange[1]?.format('YYYY-MM-DD'),
          night_allowance: nightAllowanceRate,
          department: dept || undefined,
        },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', `TienAn_${dateRange[0]?.format('YYYY-MM-DD')}_${dateRange[1]?.format('YYYY-MM-DD')}.xlsx`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      message.success('Xuất file thành công');
    } catch {
      message.error('Lỗi khi xuất file Excel');
    } finally {
      hide();
    }
  };

  return (
    <div className="ma-page">
      {/* Title bar */}
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <h2 className="emp-title">Tiền ăn &amp; Phụ cấp đêm</h2>
          <div className="emp-stats">
            <div className="emp-stat-chip">
              <CalendarOutlined style={{ fontSize: 10 }} />
              {dateRange[0]?.format('DD/MM')} – {dateRange[1]?.format('DD/MM/YYYY')}
            </div>
            <div className="emp-stat-chip">
              <span className="emp-stat-dot emp-stat-dot--green" />
              Tiền ăn <strong>{(totalMeal / 1000).toLocaleString('vi-VN')}k</strong>
            </div>
            {totalNight > 0 && (
              <div className="emp-stat-chip">
                <span className="emp-stat-dot emp-stat-dot--blue" />
                PC Đêm <strong>{(totalNight / 1000).toLocaleString('vi-VN')}k</strong>
              </div>
            )}
            <div className="emp-stat-chip" style={{ fontWeight: 700, color: '#276EF1' }}>
              Tổng <strong>{((totalMeal + totalNight) / 1000).toLocaleString('vi-VN')}k đ</strong>
            </div>
          </div>
        </div>
        {!isWorker && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {user?.role === 'admin' && (
                <Tooltip title="Cấu hình phụ cấp ca đêm">
                  <Button icon={<SettingOutlined />} onClick={() => setNightModal(true)} />
                </Tooltip>
              )}
              <Button icon={<DownloadOutlined />} type="primary"
                style={{ background: '#276EF1', borderColor: '#276EF1', borderRadius: 7 }}
                onClick={handleExport}>
                Xuất Excel
              </Button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button
                size="small"
                icon={<ThunderboltOutlined />}
                onClick={() => { setQuickTab('eligible'); setSelectedRowKeys(eligibleList.map((r) => r.key)); setQuickModal(true); }}
                style={{ background: eligibleList.length > 0 ? '#fff7ed' : '#f9fafb', color: eligibleList.length > 0 ? '#d97706' : '#9ca3af', border: `1px solid ${eligibleList.length > 0 ? '#fbbf24' : '#e5e7eb'}`, borderRadius: 6, fontSize: 12 }}
              >
                Thêm nhanh OT{eligibleList.length > 0 ? ` (${eligibleList.length})` : ''}
              </Button>
              {addedOtList.length > 0 && (
                <Button
                  size="small"
                  icon={<CheckCircleOutlined />}
                  onClick={() => { setQuickTab('added'); setSelectedDeleteKeys([]); setQuickModal(true); }}
                  style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 6, fontSize: 12 }}
                >
                  Đã thêm ({addedOtList.length})
                </Button>
              )}
              {irregularList.length > 0 && (
                <Button
                  size="small"
                  icon={<ExclamationCircleOutlined />}
                  onClick={() => { setApprovalTab('pending'); setSelectedApprovalKeys(pendingIrregulars.map(r => r.key)); setApprovalModal(true); }}
                  style={{
                    background: pendingIrregulars.length > 0 ? '#fef3c7' : '#f0fdf4',
                    color: pendingIrregulars.length > 0 ? '#92400e' : '#16a34a',
                    border: `1px solid ${pendingIrregulars.length > 0 ? '#fcd34d' : '#86efac'}`,
                    borderRadius: 6, fontSize: 12,
                    animation: pendingIrregulars.length > 0 ? 'ma-irregular-pulse 2s ease-in-out infinite' : 'none',
                  }}
                >
                  {pendingIrregulars.length > 0
                    ? `Duyệt giờ bất thường (${pendingIrregulars.length})`
                    : `Giờ BT đã duyệt (${approvedIrregulars.length})`}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="emp-filterbar" style={{ flexWrap: 'wrap' }}>
        <Space.Compact>
          <Button size="middle" onClick={() => {
            const start = dayjs(monthKey).startOf('month');
            const end = start.add(14, 'day');
            setDateRange([start, end]);
          }}>Đợt 1 (1-15)</Button>
          <Button size="middle" onClick={() => {
            const start = dayjs(monthKey).startOf('month').add(15, 'day');
            const end = dayjs(monthKey).endOf('month');
            setDateRange([start, end]);
          }}>Đợt 2 (16-cuối)</Button>
        </Space.Compact>

        <RangePicker
          value={dateRange}
          onChange={(dates) => {
            if (dates) { setDateRange(dates); setMonthKey(dates[0].format('YYYY-MM')); }
          }}
          format="DD/MM/YYYY"
          style={{ width: 230 }}
          size="middle"
        />

        {!isWorker && (
          <Select
            placeholder="Bộ phận"
            allowClear
            style={{ width: 150 }}
            value={dept}
            onChange={setDept}
            options={departments.map((d) => ({ value: d, label: d }))}
            suffixIcon={<TeamOutlined style={{ color: '#9ca3af' }} />}
            size="middle"
          />
        )}

        <Input
          placeholder="Tìm mã NV, họ tên..."
          allowClear
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
          style={{ width: 210 }}
          size="middle"
        />
      </div>

      {/* Summary cards */}
      <div className="ma-summary">
        <div className="ma-sum-card ma-sum-card--green">
          <DollarCircleOutlined className="ma-sum-icon" />
          <div>
            <div className="ma-sum-label">TỔNG TIỀN ĂN</div>
            <div className="ma-sum-value">{totalMeal.toLocaleString()} <span>đ</span></div>
          </div>
          <div className="ma-sum-bar"><div style={{ width: '70%' }} /></div>
        </div>
        <div className="ma-sum-card ma-sum-card--purple">
          <MoonOutlined className="ma-sum-icon" />
          <div>
            <div className="ma-sum-label">TỔNG PC ĐÊM</div>
            <div className="ma-sum-value">{totalNight.toLocaleString()} <span>đ</span></div>
          </div>
          <div className="ma-sum-bar"><div style={{ width: '40%' }} /></div>
        </div>
        <div className="ma-sum-card ma-sum-card--blue">
          <DownloadOutlined className="ma-sum-icon" style={{ visibility: 'hidden' }} />
          <div>
            <div className="ma-sum-label">TỔNG CỘNG</div>
            <div className="ma-sum-value">{(totalMeal + totalNight).toLocaleString()} <span>đ</span></div>
          </div>
          <div className="ma-sum-bar"><div style={{ width: '100%' }} /></div>
        </div>
      </div>

      {/* Table */}
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
                  {days.map((d) => {
                    const cell = s.rows?.[0]?.days?.find((c) => c.day === d);
                    const dow = cell?.dow || '';
                    const isSun = dow === 'CN';
                    const isHol = cell?.is_holiday;
                    return (
                      <th key={d} className={`ma-th ma-th--day ${isSun ? 'ma-th--sun' : ''} ${isHol ? 'ma-th--hol' : ''}`}>
                        <div className="ma-th-num">{d}</div>
                        <div className="ma-th-dow">{dow}</div>
                      </th>
                    );
                  })}
                  <th className="ma-th ma-th--sum ma-th--blue">Bữa</th>
                  <th className="ma-th ma-th--sum ma-th--purple">PC Đêm</th>
                  <th className="ma-th ma-th--sum ma-th--green">Tổng (đ)</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => (
                  <tr key={row.employee_id} className={idx % 2 === 1 ? 'ma-row--alt' : ''}>
                    <td className="ma-td ma-td--s0 ma-td--code">{row.employee_code}</td>
                    <td className="ma-td ma-td--s1 ma-td--name">
                      <div className="ma-name-cell" onClick={() => {
                        const params = new URLSearchParams({
                          month_key: monthKey,
                          start_date: dateRange[0]?.format('YYYY-MM-DD'),
                          end_date: dateRange[1]?.format('YYYY-MM-DD'),
                          night_rate: nightAllowanceRate,
                        });
                        navigate(`/meal-allowance/${row.employee_id}?${params.toString()}`);
                      }}>
                        <div className="ma-avatar">{(row.full_name || '?')[0].toUpperCase()}</div>
                        <span className="ma-name-text">{row.full_name}</span>
                      </div>
                    </td>
                    {days.map((d) => {
                      const cell = row.days?.find((c) => c.day === d);
                      return (
                        <td
                          key={d}
                          className="ma-td ma-td--cell"
                          onDoubleClick={() => {
                            if (!isWorker && cell) {
                              const isManualNight = cell.has_manual_xot && cell.night_allowance > 0;
                              const isManualMeal = cell.has_manual_xot && (cell.manual_meal_count || 0) > 0;
                              if (isManualNight || isManualMeal) {
                                handleCellDoubleClick(cell, row);
                              }
                            }
                          }}
                          style={{
                            cursor: (!isWorker && cell && cell.has_manual_xot && (cell.night_allowance > 0 || (cell.manual_meal_count || 0) > 0))
                              ? 'pointer'
                              : 'default',
                            backgroundColor: cell?.status === 'forgot_scan' ? 'rgba(254,226,226,0.55)' : undefined,
                          }}
                        >
                          {cell ? renderMealCell(cell, row.employee_id) : <span className="ma-cell-dot">·</span>}
                        </td>
                      );
                    })}
                    <td className="ma-td ma-td--sum ma-td--blue">{row.summary?.total_meal_count || 0}</td>
                    <td className="ma-td ma-td--sum ma-td--purple">
                      {row.summary?.total_night_allowance > 0
                        ? row.summary.total_night_allowance.toLocaleString()
                        : <span className="ma-cell-dot">–</span>}
                    </td>
                    <td className="ma-td ma-td--sum ma-td--green ma-td--total">
                      {((row.summary?.total_meal_allowance || 0) + (row.summary?.total_night_allowance || 0)).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={3 + days.length} className="ma-empty">Không có dữ liệu</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ma-footer-hint">
        * Bảng hiển thị tiền ăn theo từng ngày. Click tên nhân viên để xem chi tiết.
      </div>

      {/* Quick OT bulk modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ThunderboltOutlined style={{ color: '#d97706' }} />
            <span>Quản lý tăng ca</span>
          </div>
        }
        open={quickModal}
        onCancel={() => setQuickModal(false)}
        width={700}
        centered
        footer={quickTab === 'eligible' ? [
          <Button key="cancel" onClick={() => setQuickModal(false)}>Hủy</Button>,
          <Button key="submit" type="primary" loading={quickSaving}
            disabled={selectedRowKeys.length === 0}
            style={{ background: '#276EF1', borderColor: '#276EF1' }}
            onClick={handleQuickOtSave}>
            Áp dụng cho {selectedRowKeys.length} ngày đã chọn
          </Button>,
        ] : [
          <Button key="cancel" onClick={() => setQuickModal(false)}>Đóng</Button>,
          <Popconfirm
            key="delete-confirm"
            title={`Xóa ${selectedDeleteKeys.length} ngày tăng ca?`}
            description="Hệ thống sẽ tự động tính toán lại tiền cơm cho các ngày này."
            onConfirm={handleBulkDeleteOt}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            disabled={selectedDeleteKeys.length === 0}
          >
            <Button key="delete" danger loading={quickDeleting}
              disabled={selectedDeleteKeys.length === 0}
              icon={<DeleteOutlined />}>
              Xóa {selectedDeleteKeys.length} ngày đã chọn
            </Button>
          </Popconfirm>,
        ]}
      >
        <Segmented
          value={quickTab}
          onChange={(val) => setQuickTab(val)}
          options={[
            { value: 'eligible', label: `Cần thêm (${eligibleList.length})`, icon: <ThunderboltOutlined /> },
            { value: 'added', label: `Đã thêm (${addedOtList.length})`, icon: <CheckCircleOutlined /> },
          ]}
          block
          style={{ marginBottom: 12 }}
        />

        {quickTab === 'eligible' ? (
          <>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
              <Tag color="orange">OT sau 17h50</Tag> → thêm 1 bữa ăn &nbsp;|&nbsp;
              <Tag color="blue">OT sau 23h</Tag> → thêm 1 bữa + PC ca đêm ({nightAllowanceRate.toLocaleString()}đ)
            </div>
            {eligibleList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 13 }}>
                Không có ngày OT nào cần xử lý trong khoảng thời gian này.<br />
                <span style={{ fontSize: 11 }}>Ô cam / xanh trên bảng mới xuất hiện ở đây.</span>
              </div>
            ) : (
              <AntTable
                dataSource={eligibleList}
                columns={quickOtColumns}
                rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
                size="small"
                pagination={false}
                scroll={{ y: 380 }}
              />
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
              Danh sách các ngày đã thêm tăng ca thủ công. Chọn để xóa nếu muốn hệ thống tính tự động lại.
            </div>
            {addedOtList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 13 }}>
                Chưa có ngày tăng ca thủ công nào.
              </div>
            ) : (
              <AntTable
                dataSource={addedOtList}
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
                    title: 'Ca',
                    key: 'shift',
                    width: 55,
                    render: (_, r) => <Tag style={{ fontSize: 10, margin: 0 }}>{r.cell.shift_code || '–'}</Tag>,
                    sorter: (a, b) => {
                      const codeA = a.cell.shift_code || '';
                      const codeB = b.cell.shift_code || '';
                      return codeA.localeCompare(codeB);
                    },
                    filters: uniqueShiftCodes,
                    onFilter: (value, record) => record.cell.shift_code === value,
                  },
                  {
                    title: 'Ngày',
                    key: 'date',
                    width: 75,
                    render: (_, r) => dayjs(r.cell.work_date).format('DD/MM'),
                  },
                  {
                    title: 'Bữa OT',
                    key: 'meals',
                    width: 65,
                    render: (_, r) => <span style={{ fontWeight: 600, color: '#d97706' }}>{r.cell.manual_meal_count || 0}</span>,
                  },
                  {
                    title: 'PC Đêm',
                    key: 'night',
                    width: 80,
                    render: (_, r) => r.has_night
                      ? <Tag color="blue" style={{ fontSize: 11 }}>Có</Tag>
                      : <span style={{ color: '#d1d5db', fontSize: 11 }}>Không</span>,
                  },
                  {
                    title: 'Giờ ra OT',
                    key: 'ot_end',
                    width: 80,
                    render: (_, r) => r.cell.manual_ot_end_time
                      ? <b style={{ color: r.has_night ? '#1d4ed8' : '#d97706' }}>{r.cell.manual_ot_end_time}</b>
                      : <span style={{ color: '#d1d5db' }}>–</span>,
                  },
                ]}
                rowSelection={{ selectedRowKeys: selectedDeleteKeys, onChange: setSelectedDeleteKeys }}
                size="small"
                pagination={false}
                scroll={{ y: 380 }}
              />
            )}
          </>
        )}
      </Modal>

      {/* Night OT action modal */}
      <Modal
        title={<><MoonOutlined style={{ color: '#1d4ed8', marginRight: 8 }} />Xử lý tăng ca qua 23h</>}
        open={!!nightOtTarget}
        onCancel={() => setNightOtTarget(null)}
        footer={[
          <Button key="cancel" onClick={() => setNightOtTarget(null)}>Hủy</Button>,
          <Button key="meal" loading={nightOtSaving} onClick={() => handleNightOtSave(false)}>
            Chỉ thêm bữa ăn
          </Button>,
          <Button key="meal-pccd" type="primary" loading={nightOtSaving}
            style={{ background: '#1d4ed8', borderColor: '#1d4ed8' }}
            onClick={() => handleNightOtSave(true)}>
            Thêm bữa + PC đêm
          </Button>,
        ]}
        centered
        width={400}
      >
        {nightOtTarget && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>Nhân viên: </span>
              <b>{nightOtTarget.employeeId}</b>
              &nbsp;—&nbsp;
              <span style={{ color: '#6b7280', fontSize: 13 }}>Ngày: </span>
              <b>{dayjs(nightOtTarget.cell.work_date).format('DD/MM/YYYY')}</b>
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>Giờ ra: </span>
              <b style={{ color: '#1d4ed8' }}>
                {nightOtTarget.cell.check_out ? dayjs(nightOtTarget.cell.check_out).format('HH:mm') : '--'}
              </b>
            </div>
            <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
              <div style={{ marginBottom: 6 }}>
                <b>Chỉ thêm bữa ăn</b> — cộng 1 suất ăn tăng ca (35k), không thêm PC đêm.
              </div>
              <div>
                <b>Thêm bữa + PC đêm</b> — cộng 1 suất ăn tăng ca và phụ cấp ca đêm ({nightAllowanceRate.toLocaleString()}đ).
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Night allowance modal */}
      <Modal
        title={<><MoonOutlined style={{ color: '#7c3aed', marginRight: 8 }} />Cấu hình phụ cấp ca đêm</>}
        open={nightModal}
        onCancel={() => setNightModal(false)}
        footer={null}
        centered
        width={400}
      >
        <Form layout="vertical" initialValues={{ rate: nightAllowanceRate }}
          onFinish={(v) => handleSaveNightAllowance(v.rate)}
          style={{ marginTop: 16 }}>
          <Form.Item name="rate" label="Số tiền phụ cấp cho 1 ca đêm (VND)">
            <InputNumber
              style={{ width: '100%' }} min={0} step={1000}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => v.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large"
            style={{ background: '#276EF1', borderColor: '#276EF1', borderRadius: 8 }}>
            Lưu cấu hình
          </Button>
        </Form>
      </Modal>

      {/* Modal Chỉnh sửa Tăng ca Thủ công */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DollarCircleOutlined style={{ color: '#276EF1' }} />
            <span>Chỉnh sửa Tăng ca Thủ công</span>
          </div>
        }
        open={editManualModal}
        onCancel={() => {
          setEditManualModal(false);
          setEditManualTarget(null);
        }}
        footer={[
          editManualTarget?.cell?.has_manual_xot && (
            <Popconfirm
              key="delete-confirm"
              title="Xóa tăng ca thủ công?"
              description="Hệ thống sẽ tự động tính toán lại công và tiền cơm dựa trên chấm công thực tế của ngày này."
              onConfirm={handleDeleteManualOverride}
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
            >
              <Button key="delete" danger style={{ float: 'left' }}>
                Xóa tăng ca
              </Button>
            </Popconfirm>
          ),
          <Button key="cancel" onClick={() => { setEditManualModal(false); setEditManualTarget(null); }}>Hủy</Button>,
          <Button key="submit" type="primary" loading={editManualSaving}
            style={{ background: '#276EF1', borderColor: '#276EF1' }}
            onClick={handleSaveManualOverride}>
            Lưu
          </Button>,
        ].filter(Boolean)}
        centered
        width={420}
      >
        {editManualTarget && (
          <div style={{ padding: '12px 0' }}>
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: '12px', marginBottom: 16, border: '1px solid #f3f4f6' }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Nhân viên: </span>
                <strong style={{ color: '#1f2937' }}>[{editManualTarget.row.employee_code}] {editManualTarget.row.full_name}</strong>
              </div>
              <div style={{ marginBottom: 6 }}>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Ngày làm việc: </span>
                <strong style={{ color: '#1f2937' }}>{dayjs(editManualTarget.cell.work_date).format('DD/MM/YYYY')} ({editManualTarget.cell.dow})</strong>
              </div>
              <div>
                <span style={{ color: '#6b7280', fontSize: 13 }}>Trạng thái hiện tại: </span>
                {editManualTarget.cell.has_manual_xot ? (
                  <Tag color="purple" style={{ fontWeight: 600 }}>Tăng ca thủ công</Tag>
                ) : (
                  <Tag color="default">Tính toán tự động</Tag>
                )}
              </div>
            </div>

            <Form layout="vertical">
              <Form.Item label="Số bữa ăn tăng ca (Meal count)">
                <InputNumber
                  min={0}
                  max={5}
                  value={editManualMealCount}
                  onChange={setEditManualMealCount}
                  style={{ width: '100%' }}
                />
              </Form.Item>

              <Form.Item label="Cung cấp Phụ cấp ca đêm (PCCD)?">
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Select
                      value={editManualWithNight ? 'yes' : 'no'}
                      onChange={(val) => setEditManualWithNight(val === 'yes')}
                      style={{ width: '100%' }}
                      options={[
                        { value: 'no', label: 'Không có phụ cấp ca đêm (0đ)' },
                        { value: 'yes', label: `Có phụ cấp ca đêm (+${nightAllowanceRate.toLocaleString()}đ)` },
                      ]}
                    />
                  </div>
                  <span style={{ color: '#9ca3af', fontSize: 11 }}>
                    * Khi bật phụ cấp ca đêm, hệ thống tự động gán giờ ra OT là 23:30 để cộng tiền phụ cấp đêm.
                  </span>
                </Space>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>

      {/* Modal Duyệt giờ bất thường */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ExclamationCircleOutlined style={{ color: '#d97706' }} />
            <span>Duyệt giờ làm bất thường</span>
          </div>
        }
        open={approvalModal}
        onCancel={() => setApprovalModal(false)}
        width={750}
        centered
        footer={approvalTab === 'pending' ? [
          <Button key="cancel" onClick={() => setApprovalModal(false)}>Hủy</Button>,
          <Popconfirm
            key="reject-confirm"
            title={`Từ chối ${selectedApprovalKeys.length} ngày?`}
            description="Nhân viên sẽ không được tính tiền ăn cho các ngày này."
            onConfirm={handleRejectIrregular}
            okText="Từ chối"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            disabled={selectedApprovalKeys.length === 0}
          >
            <Button key="reject" danger loading={approvalSaving}
              disabled={selectedApprovalKeys.length === 0}
              icon={<DeleteOutlined />}>
              Từ chối ({selectedApprovalKeys.length})
            </Button>
          </Popconfirm>,
          <Button key="approve" type="primary" loading={approvalSaving}
            disabled={selectedApprovalKeys.length === 0}
            style={{ background: '#16a34a', borderColor: '#16a34a' }}
            icon={<CheckCircleOutlined />}
            onClick={handleApproveIrregular}>
            Duyệt ({selectedApprovalKeys.length})
          </Button>,
        ] : [
          <Button key="cancel" onClick={() => setApprovalModal(false)}>Đóng</Button>,
        ]}
      >
        <Segmented
          value={approvalTab}
          onChange={(val) => setApprovalTab(val)}
          options={[
            { value: 'pending', label: `Chờ duyệt (${pendingIrregulars.length})`, icon: <ClockCircleOutlined /> },
            { value: 'approved', label: `Đã duyệt (${approvedIrregulars.length})`, icon: <CheckCircleOutlined /> },
          ]}
          block
          style={{ marginBottom: 12 }}
        />

        {approvalTab === 'pending' ? (
          <>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
              Các ngày nhân viên chấm công nhưng <b>giờ làm dưới 6 tiếng</b>. Mặc định không tính tiền ăn.
              <br/>Duyệt nếu sếp cho về sớm (hết hàng, lý do khác).
            </div>
            <div style={{ marginBottom: 12 }}>
              <Input
                placeholder="Lý do duyệt (VD: Hết hàng, sếp cho về sớm...)"
                value={approvalReason}
                onChange={(e) => setApprovalReason(e.target.value)}
                size="small"
                style={{ borderRadius: 6 }}
              />
            </div>
            {pendingIrregulars.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 13 }}>
                Không có ngày bất thường nào cần duyệt.
              </div>
            ) : (
              <AntTable
                dataSource={pendingIrregulars}
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
                    title: 'Ca',
                    key: 'shift',
                    width: 55,
                    render: (_, r) => <Tag style={{ fontSize: 10, margin: 0 }}>{r.cell.shift_code || '–'}</Tag>,
                  },
                  {
                    title: 'Ngày',
                    key: 'date',
                    width: 75,
                    render: (_, r) => dayjs(r.cell.work_date).format('DD/MM'),
                  },
                  {
                    title: 'Vào',
                    key: 'checkin',
                    width: 60,
                    render: (_, r) => r.cell.check_in
                      ? <b style={{ color: '#059669' }}>{dayjs(r.cell.check_in).format('HH:mm')}</b>
                      : <span style={{ color: '#d1d5db' }}>–</span>,
                  },
                  {
                    title: 'Ra',
                    key: 'checkout',
                    width: 60,
                    render: (_, r) => r.cell.check_out
                      ? <b style={{ color: '#dc2626' }}>{dayjs(r.cell.check_out).format('HH:mm')}</b>
                      : <span style={{ color: '#d1d5db' }}>–</span>,
                  },
                  {
                    title: 'Giờ làm',
                    key: 'hours',
                    width: 70,
                    render: (_, r) => {
                      const hours = r.cell.actual_hours || 0;
                      return <span style={{ fontWeight: 600, color: hours < 6 ? '#dc2626' : '#059669' }}>{hours.toFixed(1)}h</span>;
                    },
                  },
                  {
                    title: 'Trạng thái',
                    key: 'status',
                    width: 90,
                    render: () => <Tag color="warning" style={{ fontSize: 10 }}>Chờ duyệt</Tag>,
                  },
                ]}
                rowSelection={{ selectedRowKeys: selectedApprovalKeys, onChange: setSelectedApprovalKeys }}
                size="small"
                pagination={false}
                scroll={{ y: 350 }}
              />
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
              Danh sách các ngày bất thường đã được duyệt tính tiền ăn.
            </div>
            {approvedIrregulars.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 13 }}>
                Chưa có ngày nào được duyệt.
              </div>
            ) : (
              <AntTable
                dataSource={approvedIrregulars}
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
                    title: 'Ca',
                    key: 'shift',
                    width: 55,
                    render: (_, r) => <Tag style={{ fontSize: 10, margin: 0 }}>{r.cell.shift_code || '–'}</Tag>,
                  },
                  {
                    title: 'Ngày',
                    key: 'date',
                    width: 75,
                    render: (_, r) => dayjs(r.cell.work_date).format('DD/MM'),
                  },
                  {
                    title: 'Giờ',
                    key: 'time',
                    width: 100,
                    render: (_, r) => (
                      <span style={{ fontSize: 11 }}>
                        {r.cell.check_in ? dayjs(r.cell.check_in).format('HH:mm') : '–'}
                        {' → '}
                        {r.cell.check_out ? dayjs(r.cell.check_out).format('HH:mm') : '–'}
                      </span>
                    ),
                  },
                  {
                    title: 'Tiền ăn',
                    key: 'meal',
                    width: 80,
                    render: (_, r) => <b style={{ color: '#16a34a' }}>{(r.cell.meal_allowance || 0).toLocaleString()}đ</b>,
                  },
                  {
                    title: 'Trạng thái',
                    key: 'status',
                    width: 90,
                    render: () => <Tag color="success" style={{ fontSize: 10 }}>✓ Đã duyệt</Tag>,
                  },
                  {
                    title: '',
                    key: 'action',
                    width: 50,
                    align: 'center',
                    render: (_, r) => (
                      <Popconfirm
                        title="Xóa lượt duyệt này?"
                        description="Khôi phục trạng thái chờ duyệt."
                        onConfirm={() => handleDeleteApproval(r.approval_id)}
                        okText="Xóa"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          size="small"
                        />
                      </Popconfirm>
                    ),
                  },
                ]}
                size="small"
                pagination={false}
                scroll={{ y: 350 }}
              />
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
