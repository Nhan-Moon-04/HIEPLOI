import { useState, useMemo } from 'react';
import {
  Tabs, DatePicker, Button, Table, Tag, message, Modal, Form, Input, InputNumber,
  Select, Popconfirm, Upload, Badge, Tooltip, Statistic, Spin, Empty,
} from 'antd';
import {
  BankOutlined, WalletOutlined, GiftOutlined, UsergroupAddOutlined, UploadOutlined,
  PlusOutlined, DeleteOutlined, EyeOutlined, ManOutlined, WomanOutlined,
  DollarOutlined, ArrowUpOutlined, ArrowDownOutlined, FileExcelOutlined,
  CalendarOutlined, TeamOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

const { Option } = Select;

const CATEGORY_LABELS = {
  doan_phi: { text: 'Đoàn phí', color: '#3b82f6' },
  kinh_phi: { text: 'Kinh phí', color: '#8b5cf6' },
  luong_bch: { text: 'Lương BCH', color: '#f59e0b' },
  phi_ql: { text: 'Phí QL', color: '#6b7280' },
  lai: { text: 'Lãi', color: '#10b981' },
  rut_sec: { text: 'Rút Séc', color: '#ef4444' },
  thuong_le: { text: 'Thưởng lễ', color: '#ec4899' },
  tham_hoi: { text: 'Thăm hỏi', color: '#f97316' },
  nop_cap_tren: { text: 'Nộp cấp trên', color: '#64748b' },
  phi_ck: { text: 'Phí CK', color: '#9ca3af' },
  other: { text: 'Khác', color: '#94a3b8' },
};

const EVENT_TYPE_LABELS = {
  tet_duong: { text: 'Tết Dương lịch', color: '#ef4444', icon: '🎆' },
  tat_nien: { text: 'Tất niên', color: '#dc2626', icon: '🧧' },
  quocte_phunu: { text: 'Quốc tế Phụ nữ 8/3', color: '#ec4899', icon: '🌸' },
  gio_to: { text: 'Giỗ Tổ Hùng Vương', color: '#f59e0b', icon: '🏯' },
  le_304_105: { text: 'Lễ 30/4 & 1/5', color: '#22c55e', icon: '⭐' },
  quoc_khanh: { text: 'Quốc khánh 2/9', color: '#ef4444', icon: '🇻🇳' },
  trung_thu: { text: 'Trung thu', color: '#f59e0b', icon: '🥮' },
  phunu_vn: { text: 'Phụ nữ VN 20/10', color: '#ec4899', icon: '💐' },
  ngay_nam: { text: 'Ngày Nam giới 19/11', color: '#3b82f6', icon: '👨' },
  other: { text: 'Khác', color: '#6b7280', icon: '📋' },
};

function fmt(n) {
  if (!n && n !== 0) return '–';
  return Math.round(n).toLocaleString('vi-VN');
}

// ─── Transaction Tab ──────────────────────────────────────────────────────────
function TransactionTab({ year }) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'accountant';
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState(null);
  const [filterQuarter, setFilterQuarter] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [form] = Form.useForm();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['union-transactions', year, filterType, filterQuarter],
    queryFn: () => api.get('/union/transactions', {
      params: { year, ...(filterType ? { transaction_type: filterType } : {}), ...(filterQuarter ? { quarter: filterQuarter } : {}) },
    }).then(r => r.data),
  });

  const { data: summary } = useQuery({
    queryKey: ['union-summary', year],
    queryFn: () => api.get('/union/summary', { params: { year } }).then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: (vals) => api.post('/union/transactions', vals),
    onSuccess: () => {
      message.success('Đã thêm giao dịch');
      setCreateModal(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['union-transactions'] });
      qc.invalidateQueries({ queryKey: ['union-summary'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi'),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/union/transactions/${id}`),
    onSuccess: () => {
      message.success('Đã xóa giao dịch');
      qc.invalidateQueries({ queryKey: ['union-transactions'] });
      qc.invalidateQueries({ queryKey: ['union-summary'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi'),
  });

  const totals = useMemo(() => {
    const dep = transactions.reduce((s, t) => s + t.deposit, 0);
    const wd = transactions.reduce((s, t) => s + t.withdrawal, 0);
    return { deposit: dep, withdrawal: wd };
  }, [transactions]);

  const columns = [
    {
      title: 'Ngày', dataIndex: 'transaction_date', width: 100,
      render: (v) => v ? dayjs(v).format('DD/MM/YY') : '–',
    },
    {
      title: 'Nội dung', dataIndex: 'description', ellipsis: true,
      render: (v) => <span style={{ fontSize: 13 }}>{v}</span>,
    },
    {
      title: 'Loại', dataIndex: 'category', width: 110,
      render: (v) => {
        const cat = CATEGORY_LABELS[v] || CATEGORY_LABELS.other;
        return <Tag style={{ borderRadius: 4 }} color={cat.color}>{cat.text}</Tag>;
      },
    },
    {
      title: 'Hình thức', dataIndex: 'transaction_type', width: 90, align: 'center',
      render: (v) => v === 'bank'
        ? <Tag icon={<BankOutlined />} color="blue">NH</Tag>
        : <Tag icon={<WalletOutlined />} color="green">TM</Tag>,
    },
    {
      title: 'Thu', dataIndex: 'deposit', width: 130, align: 'right',
      render: (v) => v > 0 ? <span style={{ color: '#10b981', fontWeight: 600 }}>{fmt(v)}</span> : '–',
    },
    {
      title: 'Chi', dataIndex: 'withdrawal', width: 130, align: 'right',
      render: (v) => v > 0 ? <span style={{ color: '#ef4444', fontWeight: 600 }}>{fmt(v)}</span> : '–',
    },
    {
      title: 'Số dư', dataIndex: 'balance', width: 140, align: 'right',
      render: (v) => <b style={{ color: '#1e293b' }}>{fmt(v)}</b>,
    },
    ...(isAdmin ? [{
      title: '', width: 50, fixed: 'right',
      render: (_, r) => (
        <Popconfirm title="Xóa giao dịch này?" okText="Xóa" cancelText="Hủy" onConfirm={() => deleteMut.mutate(r.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} type="text" />
        </Popconfirm>
      ),
    }] : []),
  ];

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, #dbeafe, #eff6ff)', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, marginBottom: 4 }}>SỐ DƯ NGÂN HÀNG</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1e40af' }}>{fmt(summary?.bank_balance || 0)}<span style={{ fontSize: 12, fontWeight: 400 }}> đ</span></div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #dcfce7, #f0fdf4)', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginBottom: 4 }}>TỔNG THU</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#15803d' }}>{fmt(totals.deposit)}<span style={{ fontSize: 12, fontWeight: 400 }}> đ</span></div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #fee2e2, #fef2f2)', border: '1px solid #fecaca', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>TỔNG CHI</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#b91c1c' }}>{fmt(totals.withdrawal)}<span style={{ fontSize: 12, fontWeight: 400 }}> đ</span></div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #f3e8ff, #faf5ff)', border: '1px solid #e9d5ff', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, marginBottom: 4 }}>TỒN QUỸ TIỀN MẶT</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#6d28d9' }}>{fmt(summary?.cash_balance || 0)}<span style={{ fontSize: 12, fontWeight: 400 }}> đ</span></div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <Select value={filterType} onChange={setFilterType} allowClear placeholder="Hình thức" style={{ width: 140 }}>
          <Option value="bank">🏦 Ngân hàng</Option>
          <Option value="cash">💵 Tiền mặt</Option>
        </Select>
        <Select value={filterQuarter} onChange={setFilterQuarter} allowClear placeholder="Quý" style={{ width: 110 }}>
          <Option value="Q1">Q1</Option>
          <Option value="Q2">Q2</Option>
          <Option value="Q3">Q3</Option>
          <Option value="Q4">Q4</Option>
        </Select>
        <div style={{ flex: 1 }} />
        <Tag color="default" style={{ fontSize: 12 }}>{transactions.length} giao dịch</Tag>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}
            style={{ background: '#276EF1' }}>
            Thêm giao dịch
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Table
          columns={columns}
          dataSource={transactions}
          rowKey="id"
          loading={isLoading}
          size="small"
          pagination={{ pageSize: 50 }}
          scroll={{ x: 900 }}
          locale={{ emptyText: 'Chưa có dữ liệu. Nhấn "Import Excel" để nhập.' }}
        />
      </div>

      {/* Create Modal */}
      <Modal
        title={<><DollarOutlined style={{ color: '#276EF1', marginRight: 8 }} />Thêm giao dịch công đoàn</>}
        open={createModal}
        onCancel={() => setCreateModal(false)}
        onOk={() => form.submit()}
        okText="Tạo giao dịch"
        confirmLoading={createMut.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(vals) => {
          createMut.mutate({
            ...vals,
            transaction_date: vals.transaction_date.format('YYYY-MM-DD'),
          });
        }} initialValues={{ transaction_type: 'bank', category: 'other', deposit: 0, withdrawal: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="transaction_date" label="Ngày" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item name="transaction_type" label="Hình thức" rules={[{ required: true }]}>
              <Select>
                <Option value="bank">Ngân hàng</Option>
                <Option value="cash">Tiền mặt</Option>
              </Select>
            </Form.Item>
          </div>
          <Form.Item name="description" label="Nội dung" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="deposit" label="Thu (đ)">
              <InputNumber style={{ width: '100%' }} min={0} step={100000}
                formatter={(v) => v ? Number(v).toLocaleString('vi-VN') : ''}
                parser={(v) => v?.replace(/[^\d]/g, '') || 0} />
            </Form.Item>
            <Form.Item name="withdrawal" label="Chi (đ)">
              <InputNumber style={{ width: '100%' }} min={0} step={100000}
                formatter={(v) => v ? Number(v).toLocaleString('vi-VN') : ''}
                parser={(v) => v?.replace(/[^\d]/g, '') || 0} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="category" label="Phân loại">
              <Select>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <Option key={k} value={k}>{v.text}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="receipt_no" label="Số phiếu">
              <Input placeholder="PT / PC" />
            </Form.Item>
          </div>
          <Form.Item name="notes" label="Ghi chú">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}


// ─── Events Tab ───────────────────────────────────────────────────────────────
function EventsTab({ year }) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'accountant';
  const qc = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [form] = Form.useForm();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['union-events', year],
    queryFn: () => api.get('/union/events', { params: { year } }).then(r => r.data),
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['union-event-members', selectedEvent?.id],
    queryFn: () => api.get(`/union/events/${selectedEvent.id}/members`).then(r => r.data),
    enabled: !!selectedEvent?.id,
  });

  const createMut = useMutation({
    mutationFn: (vals) => api.post('/union/events', vals),
    onSuccess: () => {
      message.success('Đã tạo sự kiện');
      setCreateModal(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['union-events'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi'),
  });

  const deleteEvMut = useMutation({
    mutationFn: (id) => api.delete(`/union/events/${id}`),
    onSuccess: () => {
      message.success('Đã xóa sự kiện');
      setSelectedEvent(null);
      qc.invalidateQueries({ queryKey: ['union-events'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi'),
  });

  const totalAmount = events.reduce((s, e) => s + e.total_amount, 0);
  const totalMembers = events.reduce((s, e) => s + e.total_members, 0);

  const memberColumns = [
    { title: 'STT', width: 55, align: 'center', render: (_, __, i) => i + 1 },
    {
      title: 'Họ và Tên', dataIndex: 'full_name', width: 220,
      render: (v, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {r.gender === 'male' ? <ManOutlined style={{ color: '#3b82f6' }} /> : <WomanOutlined style={{ color: '#ec4899' }} />}
          <span style={{ fontWeight: 500 }}>{v}</span>
          {r.employee_id && <Tooltip title="Đã liên kết NV"><Badge status="success" /></Tooltip>}
        </div>
      ),
    },
    {
      title: 'Giới tính', dataIndex: 'gender', width: 90, align: 'center',
      render: (v) => v === 'male' ? <Tag color="blue">Nam</Tag> : <Tag color="pink">Nữ</Tag>,
    },
    {
      title: 'Số tiền', dataIndex: 'amount', width: 120, align: 'right',
      render: (v) => <b style={{ color: '#059669' }}>{fmt(v)} đ</b>,
    },
    {
      title: 'Ghi chú', dataIndex: 'notes', ellipsis: true,
      render: (v) => v || '–',
    },
  ];

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'linear-gradient(135deg, #fef3c7, #fffbeb)', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: '#d97706', fontWeight: 600, marginBottom: 4 }}>SỐ SỰ KIỆN</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#b45309' }}>{events.length}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #dbeafe, #eff6ff)', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, marginBottom: 4 }}>TỔNG CHI THƯỞNG</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8' }}>{fmt(totalAmount)}<span style={{ fontSize: 12, fontWeight: 400 }}> đ</span></div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #dcfce7, #f0fdf4)', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginBottom: 4 }}>TỔNG ĐOÀN VIÊN</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#15803d' }}>{totalMembers}</div>
        </div>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#6b7280' }}>{events.length} sự kiện trong năm {year}</div>
        {isAdmin && (
          <Button icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>Tạo sự kiện</Button>
        )}
      </div>

      {/* Event Cards Grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
      ) : events.length === 0 ? (
        <Empty description="Chưa có sự kiện nào" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 20 }}>
          {events.map((ev) => {
            const meta = EVENT_TYPE_LABELS[ev.event_type] || EVENT_TYPE_LABELS.other;
            const isSelected = selectedEvent?.id === ev.id;
            return (
              <div
                key={ev.id}
                onClick={() => setSelectedEvent(isSelected ? null : ev)}
                style={{
                  background: isSelected ? '#f0f5ff' : '#fff',
                  border: isSelected ? '2px solid #276EF1' : '1px solid #e5e7eb',
                  borderRadius: 10, padding: '14px 16px', cursor: 'pointer',
                  transition: 'all 0.2s', position: 'relative',
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = '#93c5fd'; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = '#e5e7eb'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22 }}>{meta.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{ev.event_name}</div>
                      <Tag color={meta.color} style={{ fontSize: 10, marginTop: 4, borderRadius: 4 }}>{meta.text}</Tag>
                    </div>
                  </div>
                  {isAdmin && (
                    <Popconfirm title="Xóa sự kiện này?" okText="Xóa" onConfirm={(e) => { e.stopPropagation(); deleteEvMut.mutate(ev.id); }}>
                      <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                    </Popconfirm>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>Số người</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#374151' }}>
                      {ev.total_members}
                      <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>
                        ({ev.total_male}♂ {ev.total_female}♀)
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>Tổng tiền</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#059669' }}>{fmt(ev.total_amount)}đ</div>
                  </div>
                </div>
                {ev.amount_per_person > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280', background: '#f8fafc', borderRadius: 6, padding: '4px 8px', textAlign: 'center' }}>
                    {fmt(ev.amount_per_person)}đ / người
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Member Detail */}
      {selectedEvent && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{selectedEvent.event_name}</span>
              <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 8 }}>— {members.length} đoàn viên</span>
            </div>
            <Button size="small" onClick={() => setSelectedEvent(null)}>Đóng</Button>
          </div>
          <Table
            columns={memberColumns}
            dataSource={members}
            rowKey="id"
            loading={membersLoading}
            size="small"
            pagination={false}
            scroll={{ y: 400 }}
            locale={{ emptyText: 'Chưa có đoàn viên' }}
          />
        </div>
      )}

      {/* Create Event Modal */}
      <Modal
        title={<><GiftOutlined style={{ color: '#276EF1', marginRight: 8 }} />Tạo sự kiện công đoàn</>}
        open={createModal}
        onCancel={() => setCreateModal(false)}
        onOk={() => form.submit()}
        okText="Tạo sự kiện"
        confirmLoading={createMut.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(vals) => {
          createMut.mutate({
            ...vals,
            event_date: vals.event_date ? vals.event_date.format('YYYY-MM-DD') : null,
          });
        }} initialValues={{ year, event_type: 'other', amount_per_person: 0 }}>
          <Form.Item name="event_name" label="Tên sự kiện" rules={[{ required: true }]}>
            <Input placeholder="VD: Tết Dương lịch 01/01/2026" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="event_date" label="Ngày sự kiện">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
            <Form.Item name="event_type" label="Loại sự kiện">
              <Select>
                {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
                  <Option key={k} value={k}>{v.icon} {v.text}</Option>
                ))}
              </Select>
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="year" label="Năm" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="amount_per_person" label="Số tiền / người (đ)">
              <InputNumber style={{ width: '100%' }} min={0} step={50000}
                formatter={(v) => v ? Number(v).toLocaleString('vi-VN') : ''}
                parser={(v) => v?.replace(/[^\d]/g, '') || 0} />
            </Form.Item>
          </div>
          <Form.Item name="notes" label="Ghi chú">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────
export default function Union() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [year, setYear] = useState(2025);
  const qc = useQueryClient();

  const importMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/union/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      message.success(res.data.message);
      qc.invalidateQueries({ queryKey: ['union-transactions'] });
      qc.invalidateQueries({ queryKey: ['union-events'] });
      qc.invalidateQueries({ queryKey: ['union-summary'] });
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi import'),
  });

  const tabItems = [
    {
      key: 'transactions',
      label: <span><BankOutlined style={{ marginRight: 6 }} />Sổ Thu Chi</span>,
      children: <TransactionTab year={year} />,
    },
    {
      key: 'events',
      label: <span><GiftOutlined style={{ marginRight: 6 }} />Sự kiện & Thưởng</span>,
      children: <EventsTab year={year} />,
    },
  ];

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
            <UsergroupAddOutlined style={{ color: '#276EF1' }} />
            Quản lý Công đoàn
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
            CĐCS Công ty TNHH Hiệp Lợi — Sổ tài chính & sự kiện
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select value={year} onChange={setYear} style={{ width: 100 }}>
            <Option value={2024}>2024</Option>
            <Option value={2025}>2025</Option>
            <Option value={2026}>2026</Option>
          </Select>
          {isAdmin && (
            <Upload accept=".xls,.xlsx" showUploadList={false}
              beforeUpload={(file) => { importMut.mutate(file); return false; }}>
              <Button icon={<FileExcelOutlined />} loading={importMut.isPending}
                style={{ background: '#059669', borderColor: '#059669', color: '#fff' }}>
                Import Excel CĐ
              </Button>
            </Upload>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs items={tabItems} defaultActiveKey="transactions" size="middle" />
    </div>
  );
}
