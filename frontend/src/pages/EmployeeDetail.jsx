import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DatePicker, Button, Table, Spin, Modal, Form, Input, Space, message, Select, Tag, Alert } from 'antd';
import {
  ArrowLeftOutlined,
  UserOutlined,
  TeamOutlined,
  CalendarOutlined,
  CoffeeOutlined,
  MoonOutlined,
  DollarCircleOutlined,
  BankOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

const STATUS_LABELS = {
  full: { text: 'Đủ giờ', color: 'success' },
  early_leave: { text: 'Về sớm', color: 'warning' },
  short: { text: 'Thiếu giờ', color: 'orange' },
  absent: { text: 'Vắng', color: 'error' },
  forgot_scan: { text: 'Quên quẹt', color: 'orange' },
  holiday: { text: 'Ngày lễ', color: 'purple' },
  off: { text: 'Nghỉ phép', color: 'default' },
  no_data: { text: '–', color: 'default' },
};

export default function EmployeeDetail() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const { id } = useParams();
  const navigate = useNavigate();
  const employeeId = Number(id);

  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const [nightAllowanceRate, setNightAllowanceRate] = useState(0);
  const [actionModal, setActionModal] = useState(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  useEffect(() => {
    const saved = localStorage.getItem('nightAllowanceRate');
    if (saved) setNightAllowanceRate(Number(saved));
  }, []);

  const { data: emp, isLoading: empLoading } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => api.get(`/employees/${employeeId}`).then((r) => r.data),
    enabled: Number.isFinite(employeeId),
  });

  const { data: attendance, isLoading: attLoading } = useQuery({
    queryKey: ['attendance', employeeId, monthKey, nightAllowanceRate],
    queryFn: () => api.get('/attendance', {
      params: { month_key: monthKey, employee_id: employeeId, night_allowance_rate: nightAllowanceRate },
    }).then((r) => r.data),
    enabled: Number.isFinite(employeeId),
  });

  const { data: salaryHistory = [], isLoading: salaryLoading } = useQuery({
    queryKey: ['salary-history', employeeId],
    queryFn: () => api.get('/salaries/history', { params: { employee_id: employeeId } }).then((r) => r.data),
    enabled: Number.isFinite(employeeId),
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.get('/shifts').then((r) => r.data),
  });

  const row = attendance?.rows?.[0];
  const days = row?.days || [];
  const summary = row?.summary || {};
  const isLocked = !!attendance?.is_locked;

  const mealDays = summary.total_meal_count || days.filter((d) => (d.meal_allowance || 0) > 0).length;
  const nightDays = days.filter((d) => (d.night_allowance || 0) > 0).length;
  const totalMeal = summary.total_meal_allowance || 0;
  const totalNight = summary.total_night_allowance || 0;

  const currentSalary = salaryHistory.find((s) => s.month_key === monthKey);
  const baseSalary = currentSalary?.base_salary ?? emp?.base_salary ?? 0;
  const allowance = currentSalary?.allowance ?? 0;
  const totalSalary = baseSalary + allowance;

  const fmt = (v) => Number(v || 0).toLocaleString('vi-VN');

  const actionMut = useMutation({
    mutationFn: (payload) => api.post('/attendance/manual-action', payload),
    onSuccess: (res) => {
      message.success(res.data?.message || 'Đã cập nhật');
      setActionModal(null);
      form.resetFields();
      qc.invalidateQueries(['attendance', employeeId, monthKey, nightAllowanceRate]);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi cập nhật'),
  });

  const shiftSummaryData = useMemo(() => {
    const map = {};
    days.forEach((cell) => {
      if (!cell.shift_code) return;
      if (!map[cell.shift_code]) map[cell.shift_code] = { code: cell.shift_code, name: cell.shift_name, days: 0, totalMeal: 0 };
      map[cell.shift_code].days += 1;
      map[cell.shift_code].totalMeal += (cell.meal_allowance || 0) + (cell.night_allowance || 0);
    });
    return Object.values(map);
  }, [days]);

  const dayColumns = [
    {
      title: 'Ngày', dataIndex: 'work_date', key: 'work_date', width: 100,
      render: (t) => t ? dayjs(t).format('DD/MM') : '–',
    },
    {
      title: 'Ca', dataIndex: 'shift_code', key: 'shift_code', width: 70,
      render: (v) => v ? <span className="att-shift-badge">{v}</span> : '–',
    },
    {
      title: 'Vào', dataIndex: 'check_in', key: 'check_in', width: 80,
      render: (t) => t ? dayjs(t).format('HH:mm') : '–',
    },
    {
      title: 'Ra', dataIndex: 'check_out', key: 'check_out', width: 80,
      render: (t) => t ? dayjs(t).format('HH:mm') : '–',
    },
    {
      title: 'Thực', dataIndex: 'actual_hours', key: 'actual_hours', width: 70, align: 'center',
      render: (v) => v > 0 ? `${v.toFixed(1)}h` : '–',
    },
    {
      title: 'OT', dataIndex: 'ot_hours', key: 'ot_hours', width: 60, align: 'center',
      render: (v) => v > 0 ? <span style={{ color: '#4f46e5', fontWeight: 700 }}>{v.toFixed(1)}h</span> : '–',
    },
    {
      title: 'Bữa', dataIndex: 'meal_count', key: 'meal_count', width: 55, align: 'center',
      render: (v) => v > 0 ? v : '–',
    },
    {
      title: 'Tiền ăn', dataIndex: 'meal_allowance', key: 'meal_allowance', width: 90, align: 'right',
      render: (v) => v > 0 ? <span style={{ color: '#10b981', fontWeight: 600 }}>{fmt(v)}</span> : '–',
    },
    {
      title: 'PC Đêm', dataIndex: 'night_allowance', key: 'night_allowance', width: 90, align: 'right',
      render: (v) => v > 0 ? <span style={{ color: '#7c3aed', fontWeight: 600 }}>{fmt(v)}</span> : '–',
    },
    {
      title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 100,
      render: (v) => {
        const s = STATUS_LABELS[v] || STATUS_LABELS.no_data;
        return <Tag color={s.color} style={{ fontSize: 10, padding: '0 5px' }}>{s.text}</Tag>;
      },
    },
    {
      title: 'Ghi chú', dataIndex: 'notes', key: 'notes',
      render: (v) => v || '–',
    },
  ];

  const dayColumnsWithActions = (isAdmin && !isLocked) ? [
    ...dayColumns,
    {
      title: 'Thao tác', key: 'actions', width: 160,
      render: (_, r) => {
        const hasMissingScan = (!!r.check_in && !r.check_out) || (!r.check_in && !!r.check_out);
        const sameScan = r.check_in && r.check_out && dayjs(r.check_in).isSame(dayjs(r.check_out));
        const isForgotScan = r.status === 'forgot_scan' || hasMissingScan || sameScan;
        const isAbsent = r.status === 'absent';
        if (!isAbsent && !isForgotScan) return '–';
        return (
          <Space size={4}>
            {isAbsent && (
              <>
                <Button size="small" onClick={() => { form.resetFields(); setActionModal({ action: 'convert_paid_leave', record: r }); }}>
                  Có phép
                </Button>
                <Button size="small" onClick={() => { form.resetFields(); setActionModal({ action: 'mark_worked', record: r }); }}>
                  Đi làm
                </Button>
              </>
            )}
            <Button size="small" type="primary" ghost onClick={() => {
              form.resetFields();
              form.setFieldsValue({ shift_code: r.shift_code });
              setActionModal({ action: 'change_shift', record: r });
            }}>
              Đổi ca
            </Button>
          </Space>
        );
      },
    },
  ] : dayColumns;

  const salaryColumns = [
    { title: 'Tháng', dataIndex: 'month_key', key: 'month_key', width: 90 },
    { title: 'Lương cơ bản', dataIndex: 'base_salary', key: 'base_salary', width: 130, align: 'right', render: (v) => fmt(v) },
    { title: 'Phụ cấp', dataIndex: 'allowance', key: 'allowance', width: 110, align: 'right', render: (v) => fmt(v) },
    {
      title: 'Tổng', key: 'total', width: 130, align: 'right',
      render: (_, r) => <b style={{ color: '#276EF1' }}>{fmt((r.base_salary || 0) + (r.allowance || 0))}</b>,
    },
    { title: 'Lương/ngày', dataIndex: 'base_daily_wage', key: 'base_daily_wage', width: 110, align: 'right', render: (v) => fmt(v) },
    { title: 'Hệ số', dataIndex: 'salary_coefficient', key: 'salary_coefficient', width: 80, align: 'center', render: (v) => v ? Number(v).toFixed(2) : '1.00' },
    { title: 'Hình thức', dataIndex: 'pay_method', key: 'pay_method', width: 110, render: (v) => v || '–' },
    { title: 'Cập nhật', dataIndex: 'updated_at', key: 'updated_at', width: 120, render: (v) => v ? dayjs(v).format('DD/MM/YYYY') : '–' },
  ];

  if (empLoading) {
    return <div className="ma-loading"><Spin size="large" /></div>;
  }

  const avatarLetter = (emp?.full_name || '?')[0].toUpperCase();

  return (
    <div className="att-page">
      {/* Title bar */}
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <button className="mad-back-btn" onClick={() => navigate(-1)}>
            <ArrowLeftOutlined />
          </button>
          <div className="ed-avatar">{avatarLetter}</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 className="emp-title" style={{ margin: 0 }}>{emp?.full_name || '–'}</h2>
              {isLocked && <Tag color="red" icon={<LockOutlined />} style={{ borderRadius: 6 }}>Đã chốt</Tag>}
            </div>
            <div className="emp-stats" style={{ marginTop: 4 }}>
              <div className="emp-stat-chip" style={{ fontFamily: 'monospace', color: '#276EF1', fontWeight: 700 }}>
                #{emp?.employee_code}
              </div>
              {emp?.department && (
                <div className="emp-stat-chip">
                  <TeamOutlined style={{ fontSize: 10 }} /> {emp.department}
                </div>
              )}
              {emp?.position && (
                <div className="emp-stat-chip">{emp.position}</div>
              )}
              {emp?.join_date && (
                <div className="emp-stat-chip">
                  <CalendarOutlined style={{ fontSize: 10 }} />
                  Vào: {dayjs(emp.join_date).format('DD/MM/YYYY')}
                </div>
              )}
              <div className="emp-stat-chip">
                <span className="emp-stat-dot emp-stat-dot--blue" />
                Ca mặc định: <strong>{emp?.default_shift_code || '–'}</strong>
              </div>
            </div>
          </div>
        </div>
        <DatePicker
          picker="month"
          value={dayjs(monthKey)}
          onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
          format="[Tháng] MM/YYYY"
          style={{ width: 155 }}
          allowClear={false}
          size="middle"
        />
      </div>
      
      {isLocked && (
        <Alert
          message={`Dữ liệu chấm công tháng ${dayjs(monthKey).format('MM/YYYY')} đã được chốt (khóa dữ liệu).`}
          description="Hệ thống đang hoạt động ở chế độ xem chi tiết. Mọi thao tác chỉnh sửa (đổi ca, báo phép, báo đi làm) đều bị khóa đối với tháng này."
          type="warning"
          showIcon
          icon={<LockOutlined />}
          style={{ margin: '0 24px 16px 24px', borderRadius: 8 }}
        />
      )}

      {/* KPI row */}
      <div className="att-kpi-row att-kpi-row--5">
        <div className="att-kpi-card att-kpi--blue">
          <UserOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">NGÀY LÀM</div>
            <div className="att-kpi-value">{summary.total_present || 0}</div>
          </div>
        </div>
        <div className="att-kpi-card att-kpi--green">
          <CoffeeOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">SỐ BỮA ĂN</div>
            <div className="att-kpi-value">{mealDays}</div>
          </div>
        </div>
        <div className="att-kpi-card att-kpi--purple">
          <MoonOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">CA ĐÊM</div>
            <div className="att-kpi-value">{nightDays}</div>
          </div>
        </div>
        <div className="att-kpi-card att-kpi--indigo">
          <DollarCircleOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">TIỀN ĂN + PC ĐÊM</div>
            <div className="att-kpi-value" style={{ fontSize: 18 }}>{fmt(totalMeal + totalNight)}</div>
          </div>
        </div>
        <div className="att-kpi-card att-kpi--orange">
          <BankOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">LƯƠNG THÁNG</div>
            <div className="att-kpi-value" style={{ fontSize: 18 }}>{fmt(totalSalary)}</div>
          </div>
        </div>
      </div>

      {/* Shift summary */}
      <div className="ed-section">
        <div className="ed-section-title">Tổng hợp ca làm — Tháng {dayjs(monthKey).format('MM/YYYY')}</div>
        <Table
          dataSource={shiftSummaryData}
          rowKey="code"
          pagination={false}
          size="small"
          columns={[
            { title: 'Mã ca', dataIndex: 'code', key: 'code', width: 90, render: (v) => <span className="att-shift-badge">{v}</span> },
            { title: 'Tên ca', dataIndex: 'name', key: 'name' },
            { title: 'Số ngày', dataIndex: 'days', key: 'days', width: 90, align: 'center', render: (v) => <b>{v}</b> },
            {
              title: 'Tiền ăn + PC Đêm', dataIndex: 'totalMeal', key: 'totalMeal', width: 180, align: 'right',
              render: (v) => <b style={{ color: '#10b981' }}>{fmt(v)} đ</b>,
            },
          ]}
          locale={{ emptyText: 'Chưa có dữ liệu ca làm' }}
        />
      </div>

      {/* Attendance log */}
      <div className="ed-section">
        <div className="ed-section-title">Lịch chấm công — Tháng {dayjs(monthKey).format('MM/YYYY')}</div>
        {attLoading ? (
          <div className="ma-loading"><Spin /></div>
        ) : (
          <Table
            dataSource={days}
            rowKey="day"
            pagination={false}
            size="small"
            scroll={{ y: 380 }}
            columns={dayColumnsWithActions}
            rowClassName={(r) => r.status === 'absent' ? 'ed-row-absent' : r.is_sunday || r.is_holiday ? 'ed-row-off' : ''}
            locale={{ emptyText: 'Chưa có dữ liệu chấm công' }}
          />
        )}
      </div>

      {/* Salary history */}
      <div className="ed-section">
        <div className="ed-section-title">Lịch sử lương</div>
        {salaryLoading ? (
          <div className="ma-loading"><Spin /></div>
        ) : (
          <Table
            dataSource={salaryHistory}
            rowKey="month_key"
            pagination={{ pageSize: 12 }}
            size="small"
            columns={salaryColumns}
            locale={{ emptyText: 'Chưa có dữ liệu lương' }}
          />
        )}
      </div>

      {/* Action modal */}
      <Modal
        title={
          actionModal?.action === 'convert_paid_leave' ? 'Chuyển sang nghỉ phép có phép (P)' :
          actionModal?.action === 'change_shift' ? 'Thay đổi mã ca làm việc' : 'Đánh dấu đi làm'
        }
        open={!!actionModal}
        onCancel={() => { setActionModal(null); form.resetFields(); }}
        okText="Xác nhận"
        onOk={() => form.submit()}
        confirmLoading={actionMut.isPending}
        centered
      >
        <div style={{ marginBottom: 12, fontSize: 12, color: '#6b7280' }}>
          Ngày: <b>{actionModal?.record?.work_date ? dayjs(actionModal.record.work_date).format('DD/MM/YYYY') : '–'}</b>
        </div>
        <Form form={form} layout="vertical" onFinish={(v) => {
          if (!actionModal) return;
          actionMut.mutate({
            employee_id: employeeId,
            work_date: actionModal.record.work_date,
            action: actionModal.action,
            reason: v.reason,
            shift_code: v.shift_code,
          });
        }}>
          {actionModal?.action === 'change_shift' && (
            <Form.Item name="shift_code" label="Mã ca mới" rules={[{ required: true, message: 'Chọn mã ca' }]}>
              <Select placeholder="Chọn mã ca" showSearch optionFilterProp="children">
                {shifts.map((s) => (
                  <Select.Option key={s.id} value={s.code}>{s.code} – {s.name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
          <Form.Item name="reason" label="Lý do" rules={[{ required: true, message: 'Nhập lý do' }]}>
            <Input.TextArea rows={3} placeholder="Nhập lý do..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
