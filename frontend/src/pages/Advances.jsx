import { useState, useMemo } from 'react';
import {
  DatePicker, Select, Button, Modal, Form, Input, InputNumber,
  Table, Tag, Tooltip, message, Popconfirm, Descriptions, Badge,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, InfoCircleOutlined, BankOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';

const { Option } = Select;

const ADVANCE_TYPE_LABEL = {
  cash: 'Tiền mặt',
  half_month: 'Nửa tháng lương',
  full_month: '1 tháng lương',
  multi_month: '2-3 tháng lương',
};

const STATUS_COLOR = { active: 'processing', completed: 'success', cancelled: 'default' };
const STATUS_LABEL = { active: 'Đang trả', completed: 'Hoàn thành', cancelled: 'Đã hủy' };

function fmt(n) {
  if (!n && n !== 0) return '–';
  return Math.round(n).toLocaleString('vi-VN') + 'đ';
}

// ─── Installment Detail Modal ─────────────────────────────────────────────────
function InstallmentModal({ loanId, onClose }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['loan-installments', loanId],
    queryFn: () => api.get(`/salaries/loans/${loanId}/installments`).then((r) => r.data),
    enabled: !!loanId,
  });

  const cols = [
    { title: 'Kỳ', dataIndex: 'installment_no', width: 50, align: 'center' },
    { title: 'Tháng', dataIndex: 'month_key', width: 90 },
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      width: 120,
      render: (v) => <b>{fmt(v)}</b>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'paid',
      width: 110,
      render: (paid) => paid
        ? <Tag color="success">Đã trừ lương</Tag>
        : <Tag color="default">Chờ trừ</Tag>,
    },
    { title: 'Ghi chú', dataIndex: 'notes', ellipsis: true },
  ];

  return (
    <Modal
      title={<><InfoCircleOutlined style={{ color: '#276EF1', marginRight: 8 }} />Kế hoạch trả nợ</>}
      open={!!loanId}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Đóng</Button>}
      width={560}
    >
      <Table
        dataSource={data}
        columns={cols}
        rowKey="id"
        size="small"
        loading={isLoading}
        pagination={false}
        rowClassName={(r) => r.paid ? '' : 'ant-table-row-future'}
      />
    </Modal>
  );
}

// ─── Create Loan Modal ────────────────────────────────────────────────────────
function CreateLoanModal({ employees, salariesData, open, onClose, onCreated }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [repayType, setRepayType] = useState('lump');   // lump | installment
  const [advType, setAdvType] = useState('cash');

  const empOptions = useMemo(() => employees.map((e) => ({
    value: e.id,
    label: `${e.employee_code} – ${e.full_name}`,
    base_salary: e.base_salary || 0,
  })), [employees]);

  const handleAdvTypeChange = (val) => {
    setAdvType(val);
    const empId = form.getFieldValue('employee_id');
    if (!empId || val === 'cash') return;

    // Auto-fill amount from salary
    const sal = salariesData?.rows?.find((r) => r.employee_id === empId);
    if (!sal) return;
    const base = sal.base_salary || 0;
    const std = salariesData?.standard_days || 26;
    const daily = base / std;
    const amounts = {
      half_month: Math.round(daily * (std / 2)),
      full_month: Math.round(base),
      multi_month: Math.round(base * 2),
    };
    if (amounts[val]) form.setFieldValue('total_amount', amounts[val]);
  };

  const handleSubmit = async () => {
    const vals = await form.validateFields();
    setSaving(true);
    try {
      const months = repayType === 'lump' ? 1 : (vals.repayment_months || 1);
      const payload = {
        employee_id: vals.employee_id,
        loan_date: vals.loan_date.format('YYYY-MM-DD'),
        total_amount: vals.total_amount,
        advance_type: vals.advance_type,
        repayment_months: months,
        monthly_repayment: repayType === 'lump' ? vals.total_amount : (vals.monthly_repayment || null),
        start_month: vals.start_month.format('YYYY-MM'),
        notes: vals.notes || '',
      };
      await api.post('/salaries/loans', payload);
      message.success('Tạo khoản ứng thành công');
      form.resetFields();
      setRepayType('lump');
      setAdvType('cash');
      onCreated();
    } catch (e) {
      message.error(e.response?.data?.detail || 'Lỗi tạo khoản ứng');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={<><BankOutlined style={{ color: '#276EF1', marginRight: 8 }} />Tạo khoản tạm ứng</>}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Tạo khoản ứng"
      cancelText="Hủy"
      confirmLoading={saving}
      width={520}
      destroyOnClose
    >
      <Form form={form} layout="vertical" size="middle" initialValues={{
        loan_date: dayjs(),
        start_month: dayjs().add(1, 'month'),
        advance_type: 'cash',
      }}>
        <Form.Item name="employee_id" label="Nhân viên" rules={[{ required: true }]}>
          <Select
            showSearch
            placeholder="Chọn nhân viên"
            optionFilterProp="label"
            options={empOptions}
            onChange={() => {
              if (advType !== 'cash') handleAdvTypeChange(advType);
            }}
          />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="loan_date" label="Ngày ứng" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="advance_type" label="Loại ứng" rules={[{ required: true }]}>
            <Select onChange={handleAdvTypeChange}>
              <Option value="cash">Tiền mặt</Option>
              <Option value="half_month">Nửa tháng lương</Option>
              <Option value="full_month">1 tháng lương</Option>
              <Option value="multi_month">2-3 tháng lương</Option>
            </Select>
          </Form.Item>
        </div>

        <Form.Item name="total_amount" label="Số tiền ứng (đ)" rules={[{ required: true }]}>
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            step={500000}
            formatter={(v) => v ? Number(v).toLocaleString('vi-VN') : ''}
            parser={(v) => v?.replace(/[^\d]/g, '') || 0}
            addonAfter="đ"
          />
        </Form.Item>

        <Form.Item label="Hình thức trả" required>
          <Select value={repayType} onChange={setRepayType}>
            <Option value="lump">Trả 1 lần (tháng tiếp theo)</Option>
            <Option value="installment">Trả góp từng tháng</Option>
          </Select>
        </Form.Item>

        {repayType === 'installment' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="repayment_months" label="Số tháng trả" rules={[{ required: true }]}>
              <InputNumber min={2} max={36} style={{ width: '100%' }} addonAfter="tháng" />
            </Form.Item>
            <Form.Item name="monthly_repayment" label="Mỗi tháng trừ (để trống = tự chia đều)">
              <InputNumber
                style={{ width: '100%' }}
                min={0}
                step={500000}
                formatter={(v) => v ? Number(v).toLocaleString('vi-VN') : ''}
                parser={(v) => v?.replace(/[^\d]/g, '') || 0}
                addonAfter="đ"
              />
            </Form.Item>
          </div>
        )}

        <Form.Item name="start_month" label="Tháng bắt đầu trừ lương" rules={[{ required: true }]}>
          <DatePicker picker="month" style={{ width: '100%' }} format="MM/YYYY" />
        </Form.Item>

        <Form.Item name="notes" label="Ghi chú">
          <Input.TextArea rows={2} placeholder="VD: Ứng mua xe, sửa nhà..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Advances() {
  const qc = useQueryClient();
  const [filterEmp, setFilterEmp] = useState(null);
  const [filterStatus, setFilterStatus] = useState('active');
  const [monthKey] = useState(dayjs().format('YYYY-MM'));
  const [createOpen, setCreateOpen] = useState(false);
  const [detailLoanId, setDetailLoanId] = useState(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => api.get('/employees', { params: { page_size: 500 } }).then((r) => r.data?.items || r.data || []),
  });

  const { data: salariesData } = useQuery({
    queryKey: ['payroll-sal', monthKey],
    queryFn: () => api.get('/salaries/base', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  const { data: loans = [], isLoading } = useQuery({
    queryKey: ['advance-loans', filterEmp, filterStatus],
    queryFn: () => api.get('/salaries/loans', {
      params: {
        ...(filterEmp ? { employee_id: filterEmp } : {}),
        ...(filterStatus ? { status: filterStatus } : {}),
      },
    }).then((r) => r.data),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => api.delete(`/salaries/loans/${id}`),
    onSuccess: () => {
      message.success('Đã hủy khoản ứng');
      qc.invalidateQueries({ queryKey: ['advance-loans'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi hủy'),
  });

  const empOptions = employees.map((e) => ({ value: e.id, label: `${e.employee_code} – ${e.full_name}` }));

  // Thống kê tổng
  const stats = useMemo(() => {
    const total = loans.reduce((s, l) => s + l.total_amount, 0);
    const remaining = loans.reduce((s, l) => s + l.remaining, 0);
    const paid = loans.reduce((s, l) => s + l.paid_amount, 0);
    return { total, remaining, paid, count: loans.length };
  }, [loans]);

  const columns = [
    {
      title: 'Nhân viên',
      width: 200,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.full_name}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.employee_code} · {r.department || '–'}</div>
        </div>
      ),
    },
    {
      title: 'Ngày ứng',
      dataIndex: 'loan_date',
      width: 100,
      render: (v) => dayjs(v).format('DD/MM/YYYY'),
    },
    {
      title: 'Loại',
      dataIndex: 'advance_type',
      width: 130,
      render: (v) => <Tag color="blue">{ADVANCE_TYPE_LABEL[v] || v}</Tag>,
    },
    {
      title: 'Tổng ứng',
      dataIndex: 'total_amount',
      width: 120,
      render: (v) => <b style={{ color: '#374151' }}>{fmt(v)}</b>,
    },
    {
      title: 'Kế hoạch trả',
      width: 130,
      render: (_, r) => r.repayment_months === 1
        ? <span style={{ color: '#6b7280' }}>1 lần</span>
        : (
          <span>
            {r.repayment_months} tháng
            <br />
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{fmt(r.monthly_repayment)}/tháng</span>
          </span>
        ),
    },
    {
      title: 'Bắt đầu trừ',
      dataIndex: 'start_month',
      width: 90,
      render: (v) => dayjs(v).format('MM/YYYY'),
    },
    {
      title: 'Đã trả',
      width: 110,
      render: (_, r) => (
        <div>
          <div style={{ color: '#10b981', fontWeight: 600 }}>{fmt(r.paid_amount)}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>
            Còn: <span style={{ color: r.remaining > 0 ? '#ef4444' : '#10b981' }}>{fmt(r.remaining)}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 100,
      render: (v) => <Badge status={STATUS_COLOR[v]} text={STATUS_LABEL[v]} />,
    },
    {
      title: '',
      width: 80,
      fixed: 'right',
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Tooltip title="Xem kế hoạch trả">
            <Button size="small" icon={<InfoCircleOutlined />} onClick={() => setDetailLoanId(r.id)} />
          </Tooltip>
          {r.status === 'active' && (
            <Popconfirm
              title="Hủy các kỳ trả chưa đến hạn?"
              okText="Hủy khoản ứng"
              cancelText="Không"
              okButtonProps={{ danger: true }}
              onConfirm={() => cancelMutation.mutate(r.id)}
            >
              <Tooltip title="Hủy khoản ứng">
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>Quản lý Tạm ứng</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Theo dõi khoản ứng và kế hoạch trả lương</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} style={{ background: '#276EF1' }}
          onClick={() => setCreateOpen(true)}>
          Tạo tạm ứng
        </Button>
      </div>

      {/* Thống kê */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Số khoản ứng', value: stats.count, color: '#374151' },
          { label: 'Tổng đã ứng', value: fmt(stats.total), color: '#276EF1' },
          { label: 'Đã thu hồi', value: fmt(stats.paid), color: '#10b981' },
          { label: 'Còn phải thu', value: fmt(stats.remaining), color: '#ef4444' },
        ].map((s) => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <Select
          allowClear
          placeholder="Lọc theo nhân viên"
          style={{ width: 240 }}
          options={empOptions}
          value={filterEmp}
          onChange={setFilterEmp}
          showSearch
          optionFilterProp="label"
        />
        <Select
          value={filterStatus}
          onChange={setFilterStatus}
          style={{ width: 140 }}
          allowClear
          placeholder="Trạng thái"
        >
          <Option value="active">Đang trả</Option>
          <Option value="completed">Hoàn thành</Option>
          <Option value="cancelled">Đã hủy</Option>
        </Select>
      </div>

      {/* Table */}
      <Table
        dataSource={loans}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        size="small"
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        locale={{ emptyText: 'Không có khoản tạm ứng nào' }}
        expandable={{
          expandedRowRender: (r) => (
            <Descriptions size="small" column={3} style={{ padding: '4px 24px' }}>
              <Descriptions.Item label="Ghi chú">{r.notes || '–'}</Descriptions.Item>
              <Descriptions.Item label="Ngày tạo">
                {r.created_at ? dayjs(r.created_at).format('DD/MM/YYYY HH:mm') : '–'}
              </Descriptions.Item>
            </Descriptions>
          ),
          rowExpandable: (r) => !!r.notes,
        }}
      />

      {/* Modals */}
      <CreateLoanModal
        employees={employees}
        salariesData={salariesData}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ['advance-loans'] });
          qc.invalidateQueries({ queryKey: ['payroll-adv'] });
        }}
      />

      <InstallmentModal
        loanId={detailLoanId}
        onClose={() => setDetailLoanId(null)}
      />
    </div>
  );
}
