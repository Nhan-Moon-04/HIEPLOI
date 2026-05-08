import { useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Switch, Space, message, Tag, Popconfirm, Badge } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined, SearchOutlined, CalendarOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';

export default function Employees() {
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

  // Check if employee is actively working in the selected month
  const getMonthStatus = (emp) => {
    if (!monthKey) return null;
    const [y, m] = monthKey.split('-').map(Number);
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
    active: { color: 'green', text: 'Dang lam' },
    new: { color: 'blue', text: 'Moi vao' },
    leaving: { color: 'orange', text: 'Se nghi' },
    left: { color: 'red', text: 'Da nghi' },
    not_yet: { color: 'default', text: 'Chua vao' },
  };

  const columns = [
    { title: 'Ma', dataIndex: 'employee_code', width: 50, sorter: (a, b) => Number(a.employee_code) - Number(b.employee_code) },
    { title: 'Ho ten', dataIndex: 'full_name', width: 180, render: (t) => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: 'Bo phan', dataIndex: 'department', width: 120, render: (t) => t || '-' },
    { title: 'Ca', dataIndex: 'default_shift_code', width: 50, render: (t) => t ? <Tag color="blue">{t}</Tag> : '-', align: 'center' },
    { title: 'Luong co ban', dataIndex: 'base_salary', width: 115, render: (v) => v ? Number(v).toLocaleString('vi-VN') : '-', align: 'right' },
    { title: 'Ngay vao', dataIndex: 'join_date', width: 95, render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '-' },
    { title: 'Ngay nghi', dataIndex: 'leave_date', width: 95, render: (d) => d ? dayjs(d).format('DD/MM/YYYY') : '-' },
    {
      title: `T${dayjs(monthKey).format('M/YY')}`,
      key: 'month_status',
      width: 80,
      align: 'center',
      render: (_, r) => {
        const st = getMonthStatus(r);
        if (!st) return '-';
        const { color, text } = statusMap[st];
        return <Tag color={color} style={{ fontSize: 11 }}>{text}</Tag>;
      },
    },
    {
      title: '', width: 70, fixed: 'right', render: (_, r) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Xoa nhan vien nay?" onConfirm={() => del.mutate(r.id)} okText="Xoa" cancelText="Huy">
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Count active vs inactive this month
  const items = data?.items || [];
  const activeCount = items.filter((e) => {
    const st = getMonthStatus(e);
    return st === 'active' || st === 'new';
  }).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><TeamOutlined style={{ marginRight: 6 }} />Nhan vien</h1>
          <div className="sub">
            Thang {dayjs(monthKey).format('M/YYYY')}: <b>{activeCount}</b> dang lam / <b>{data?.total || 0}</b> tong
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <DatePicker
            picker="month"
            value={dayjs(monthKey)}
            onChange={(d) => { if (d) { setMonthKey(d.format('YYYY-MM')); setPage(1); } }}
            format="[Thang] M / YYYY"
            style={{ width: 155 }}
            suffixIcon={<CalendarOutlined />}
          />
          <Input placeholder="Tim ma NV, ho ten..." prefix={<SearchOutlined />} style={{ width: 200 }}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} allowClear />
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => { setEditing(null); form.resetFields(); setModal(true); }}>
            Them NV
          </Button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Table columns={columns} dataSource={items} rowKey="id" loading={isLoading}
          size="small" scroll={{ x: 900 }}
          pagination={{ current: page, pageSize: 50, total: data?.total || 0, onChange: setPage, showTotal: (t) => `Tong ${t}`, size: 'small' }} />
      </div>

      <Modal title={editing ? 'Sua nhan vien' : 'Them nhan vien moi'} open={modal} onCancel={() => setModal(false)}
        onOk={() => form.submit()} confirmLoading={save.isPending} width={640} okText="Luu" cancelText="Huy">
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} style={{ marginTop: 16 }}
          initialValues={{ is_active: true, base_salary: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="employee_code" label="Ma NV" rules={[{ required: true }]}>
              <Input disabled={!!editing} />
            </Form.Item>
            <Form.Item name="full_name" label="Ho ten" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="department" label="Bo phan">
              <Select allowClear showSearch placeholder="Chon bo phan"
                options={departments.map((d) => ({ value: d, label: d }))} />
            </Form.Item>
            <Form.Item name="position" label="Chuc vu"><Input /></Form.Item>
            <Form.Item name="default_shift_code" label="Ca mac dinh">
              <Select allowClear options={shifts.map((s) => ({ value: s.code, label: `${s.code} - ${s.name}` }))} />
            </Form.Item>
            <Form.Item name="base_salary" label="Luong co ban">
              <InputNumber min={0} step={100000} style={{ width: '100%' }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
            </Form.Item>
            <Form.Item name="join_date" label="Ngay vao"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item>
            <Form.Item name="leave_date" label="Ngay nghi"><DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" /></Form.Item>
            <Form.Item name="gender" label="Gioi tinh">
              <Select options={[{ value: 'Nam' }, { value: 'Nu' }]} allowClear />
            </Form.Item>
            <Form.Item name="is_active" label="Dang lam" valuePropName="checked"><Switch size="small" /></Form.Item>
          </div>
          <Form.Item name="notes" label="Ghi chu"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
