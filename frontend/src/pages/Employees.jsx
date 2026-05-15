import { useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Switch, Space, message, Tag, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, CalendarOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../api/client';

export default function Employees() {
  const navigate = useNavigate();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['employees', page, search, monthKey],
    queryFn: () => api.get('/employees', {
      params: { page, page_size: 50, search: search || undefined, month_key: monthKey || undefined }
    }).then((r) => r.data),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/employees/departments').then((r) => r.data),
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.get('/shifts').then((r) => r.data),
  });

  const save = useMutation({
    mutationFn: (v) => {
      const p = { ...v };
      if (p.join_date) p.join_date = p.join_date.format('YYYY-MM-DD');
      if (p.leave_date) p.leave_date = p.leave_date.format('YYYY-MM-DD');
      return editing ? api.put(`/employees/${editing.id}`, p) : api.post('/employees', p);
    },
    onSuccess: () => { message.success('Luu thanh cong!'); qc.invalidateQueries(['employees']); setModal(false); setEditing(null); },
    onError: (e) => message.error(e.response?.data?.detail || 'Loi'),
  });

  const del = useMutation({
    mutationFn: (id) => api.delete(`/employees/${id}`),
    onSuccess: () => { message.success('Da xoa!'); qc.invalidateQueries(['employees']); },
  });

  const openEdit = (r) => {
    setEditing(r);
    form.setFieldsValue({
      ...r,
      join_date: r.join_date ? dayjs(r.join_date) : null,
      leave_date: r.leave_date ? dayjs(r.leave_date) : null,
    });
    setModal(true);
  };

  const getMonthStatus = (emp) => {
    if (!monthKey) return null;
    const monthStart = dayjs(`${monthKey}-01`);
    const monthEnd = monthStart.endOf('month');
    const joined = emp.join_date ? dayjs(emp.join_date) : null;
    const left = emp.leave_date ? dayjs(emp.leave_date) : null;
    if (left && left.isBefore(monthStart)) return 'left';
    if (joined && joined.isAfter(monthEnd)) return 'not_yet';
    if (left && left.isBefore(monthEnd)) return 'leaving';
    if (joined && joined.isAfter(monthStart)) return 'new';
    return 'active';
  };

  const statusMap = {
    active:  { color: 'success',   text: 'Đang làm' },
    new:     { color: 'processing', text: 'Mới vào' },
    leaving: { color: 'warning',   text: 'Sắp nghỉ' },
    left:    { color: 'error',     text: 'Đã nghỉ' },
    not_yet: { color: 'default',   text: 'Chưa vào' },
  };

  const items = data?.items || [];
  const activeCount = items.filter((e) => { const st = getMonthStatus(e); return st === 'active' || st === 'new'; }).length;
  const leftCount = items.filter((e) => getMonthStatus(e) === 'left').length;
  const newCount = items.filter((e) => getMonthStatus(e) === 'new').length;

  const columns = [
    {
      title: 'Mã NV',
      dataIndex: 'employee_code',
      width: 72,
      sorter: (a, b) => Number(a.employee_code) - Number(b.employee_code),
      render: (t) => <span className="emp-code">{t}</span>,
    },
    {
      title: 'Họ tên',
      dataIndex: 'full_name',
      width: 200,
      render: (t, r) => (
        <div className="emp-name-cell" onClick={() => navigate(`/employees/${r.id}`)}>
          <div className="emp-avatar">{(t || '?')[0].toUpperCase()}</div>
          <div>
            <div className="emp-name">{t}</div>
            {r.position && <div className="emp-pos">{r.position}</div>}
          </div>
        </div>
      ),
    },
    {
      title: 'Bộ phận',
      dataIndex: 'department',
      width: 130,
      render: (t) => t ? <span className="emp-dept">{t}</span> : <span className="emp-dash">—</span>,
    },
    {
      title: 'Ca',
      dataIndex: 'default_shift_code',
      width: 60,
      align: 'center',
      render: (t) => t ? <Tag color="blue" style={{ margin: 0, borderRadius: 4, fontSize: 11 }}>{t}</Tag> : <span className="emp-dash">—</span>,
    },
    {
      title: 'Lương cơ bản',
      key: 'salary',
      width: 130,
      align: 'right',
      render: (_, r) => {
        const val = r.month_salary !== null ? r.month_salary : r.base_salary;
        return val ? (
          <span style={{ fontWeight: r.month_salary !== null ? 600 : 400, color: r.month_salary !== null ? '#059669' : '#374151', fontSize: 12 }}>
            {Number(val).toLocaleString('vi-VN')}
          </span>
        ) : <span className="emp-dash">—</span>;
      },
    },
    {
      title: 'Ngày vào',
      dataIndex: 'join_date',
      width: 100,
      render: (d) => d ? <span style={{ fontSize: 12, color: '#6b7280' }}>{dayjs(d).format('DD/MM/YYYY')}</span> : <span className="emp-dash">—</span>,
    },
    {
      title: 'Ngày nghỉ',
      dataIndex: 'leave_date',
      width: 100,
      render: (d) => d ? <span style={{ fontSize: 12, color: '#ef4444' }}>{dayjs(d).format('DD/MM/YYYY')}</span> : <span className="emp-dash">—</span>,
    },
    {
      title: `T.${dayjs(monthKey).format('M/YY')}`,
      key: 'month_status',
      width: 90,
      align: 'center',
      render: (_, r) => {
        const st = getMonthStatus(r);
        if (!st) return '—';
        const { color, text } = statusMap[st];
        return <Tag color={color} style={{ margin: 0, fontSize: 11, borderRadius: 4 }}>{text}</Tag>;
      },
    },
    {
      title: '',
      width: 72,
      fixed: 'right',
      render: (_, r) => (
        <Space size={2}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} className="emp-act-btn" />
          <Popconfirm title="Xóa nhân viên này?" onConfirm={() => del.mutate(r.id)} okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }}>
            <Button type="text" size="small" icon={<DeleteOutlined />} danger className="emp-act-btn" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="emp-page">
      {/* Title bar */}
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <h2 className="emp-title">Nhân viên</h2>
          <div className="emp-stats">
            <div className="emp-stat-chip">
              <span className="emp-stat-dot emp-stat-dot--blue" />
              Tổng <strong>{data?.total || 0}</strong>
            </div>
            <div className="emp-stat-chip">
              <span className="emp-stat-dot emp-stat-dot--green" />
              Đang làm <strong>{activeCount}</strong>
            </div>
            <div className="emp-stat-chip">
              <span className="emp-stat-dot emp-stat-dot--red" />
              Đã nghỉ <strong>{leftCount}</strong>
            </div>
            {newCount > 0 && (
              <div className="emp-stat-chip">
                <span className="emp-stat-dot emp-stat-dot--orange" />
                Mới vào <strong>{newCount}</strong>
              </div>
            )}
          </div>
        </div>
        <Button
          type="primary" icon={<PlusOutlined />}
          className="emp-add-btn"
          onClick={() => { setEditing(null); form.resetFields(); setModal(true); }}
        >
          Thêm nhân viên
        </Button>
      </div>

      {/* Filter bar */}
      <div className="emp-filterbar">
        <DatePicker
          picker="month"
          value={dayjs(monthKey)}
          onChange={(d) => { if (d) { setMonthKey(d.format('YYYY-MM')); setPage(1); } }}
          format="[Tháng] M/YYYY"
          style={{ width: 140 }}
          suffixIcon={<CalendarOutlined style={{ color: '#9ca3af' }} />}
          size="middle"
        />
        <Input
          placeholder="Tìm mã NV, họ tên..."
          prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
          style={{ width: 220 }}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          allowClear
          size="middle"
        />
      </div>

      {/* Table card */}
      <div className="emp-table-card">
        <Table
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={isLoading}
          size="middle"
          scroll={{ x: 900 }}
          className="emp-table"
          pagination={{
            current: page,
            pageSize: 50,
            total: data?.total || 0,
            onChange: setPage,
            showTotal: (t) => `Tổng ${t} nhân viên`,
            size: 'small',
            showSizeChanger: false,
          }}
        />
      </div>

      {/* Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserOutlined style={{ color: '#276EF1' }} />
            {editing ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên mới'}
          </div>
        }
        open={modal}
        onCancel={() => setModal(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        width={640}
        okText="Lưu"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#276EF1', borderColor: '#276EF1' } }}
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}
          style={{ marginTop: 16 }} initialValues={{ is_active: true, base_salary: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="employee_code" label="Mã NV" rules={[{ required: true }]}>
              <Input disabled={!!editing} />
            </Form.Item>
            <Form.Item name="full_name" label="Họ tên" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="department" label="Bộ phận">
              <Select allowClear showSearch placeholder="Chọn bộ phận"
                options={departments.map((d) => ({ value: d, label: d }))} />
            </Form.Item>
            <Form.Item name="position" label="Chức vụ"><Input /></Form.Item>
            <Form.Item name="default_shift_code" label="Ca mặc định">
              <Select allowClear options={shifts.map((s) => ({ value: s.code, label: `${s.code} — ${s.name}` }))} />
            </Form.Item>
            <Form.Item name="base_salary" label="Lương cơ bản">
              <InputNumber min={0} step={100000} style={{ width: '100%' }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
            </Form.Item>
            <Form.Item name="join_date" label="Ngày vào"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item>
            <Form.Item name="leave_date" label="Ngày nghỉ"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item>
            <Form.Item name="gender" label="Giới tính">
              <Select options={[{ value: 'Nam' }, { value: 'Nữ' }]} allowClear />
            </Form.Item>
            <Form.Item name="is_active" label="Đang làm" valuePropName="checked"><Switch size="small" /></Form.Item>
          </div>
          <Form.Item name="notes" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
