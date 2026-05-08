import { useState } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, TimePicker, Switch, Space, message, Tag, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ScheduleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';

export default function Shifts() {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => api.get('/shifts').then((r) => r.data),
  });

  const save = useMutation({
    mutationFn: (v) => {
      const p = { ...v };
      if (p.start_time) p.start_time = p.start_time.format('HH:mm:ss');
      if (p.end_time) p.end_time = p.end_time.format('HH:mm:ss');
      return editing ? api.put(`/shifts/${editing.id}`, p) : api.post('/shifts', p);
    },
    onSuccess: () => { message.success('Luu thanh cong!'); qc.invalidateQueries(['shifts']); setModal(false); setEditing(null); },
    onError: (e) => message.error(e.response?.data?.detail || 'Loi'),
  });

  const del = useMutation({
    mutationFn: (id) => api.delete(`/shifts/${id}`),
    onSuccess: () => { message.success('Da xoa!'); qc.invalidateQueries(['shifts']); },
  });

  const openEdit = (r) => {
    setEditing(r);
    form.setFieldsValue({
      ...r,
      start_time: r.start_time ? dayjs(r.start_time, 'HH:mm:ss') : null,
      end_time: r.end_time ? dayjs(r.end_time, 'HH:mm:ss') : null,
    });
    setModal(true);
  };

  const columns = [
    { title: 'Ma ca', dataIndex: 'code', width: 70, render: (t) => <Tag color="blue" style={{ fontWeight: 600 }}>{t}</Tag> },
    { title: 'Ten ca', dataIndex: 'name', width: 130 },
    { title: 'Gio vao', dataIndex: 'start_time', width: 80, render: (t) => t || '-', align: 'center' },
    { title: 'Gio ra', dataIndex: 'end_time', width: 80, render: (t) => t || '-', align: 'center' },
    { title: 'Gio chuan', dataIndex: 'standard_hours', width: 80, align: 'center' },
    { title: 'OT', dataIndex: 'default_overtime_hours', width: 60, align: 'center' },
    { title: 'Tien an', dataIndex: 'meal_allowance', width: 100, render: (v) => v > 0 ? Number(v).toLocaleString('vi-VN') + 'd' : '-', align: 'right' },
    { title: 'Bua', dataIndex: 'meal_count', width: 50, align: 'center' },
    { title: 'Dem', dataIndex: 'is_night_shift', width: 55, render: (v) => v ? <Tag color="purple">Dem</Tag> : null, align: 'center' },
    { title: 'Nghi', dataIndex: 'is_leave_code', width: 55, render: (v) => v ? <Tag color="orange">Nghi</Tag> : null, align: 'center' },
    {
      title: '', width: 80, fixed: 'right', render: (_, r) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Xoa ma ca nay?" onConfirm={() => del.mutate(r.id)} okText="Xoa" cancelText="Huy">
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><ScheduleOutlined style={{ marginRight: 6 }} />Quan ly ma ca</h1>
          <div className="sub">Tao va quan ly cac loai ca lam viec, nghi phep</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModal(true); }}>
          Them ma ca
        </Button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Table columns={columns} dataSource={shifts} rowKey="id" loading={isLoading}
          size="small" pagination={false} scroll={{ x: 900 }} />
      </div>

      <Modal title={editing ? 'Sua ma ca' : 'Them ma ca moi'} open={modal} onCancel={() => setModal(false)}
        onOk={() => form.submit()} confirmLoading={save.isPending} width={600} okText="Luu" cancelText="Huy">
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} style={{ marginTop: 16 }}
          initialValues={{ standard_hours: 8, break_minutes: 60, default_overtime_hours: 0, meal_allowance: 0, meal_count: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="code" label="Ma ca" rules={[{ required: true }]}>
              <Input placeholder="VD: X, D, N..." disabled={!!editing} />
            </Form.Item>
            <Form.Item name="name" label="Ten ca" rules={[{ required: true }]}>
              <Input placeholder="VD: Ca ngay, Ca dem..." />
            </Form.Item>
            <Form.Item name="start_time" label="Gio vao">
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="end_time" label="Gio ra">
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="standard_hours" label="Gio chuan">
              <InputNumber min={0} max={24} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="default_overtime_hours" label="OT mac dinh (gio)">
              <InputNumber min={0} max={12} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="meal_allowance" label="Tien an (VND)">
              <InputNumber min={0} step={5000} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
            </Form.Item>
            <Form.Item name="meal_count" label="So bua an">
              <InputNumber min={0} max={3} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 28 }}>
            <Form.Item name="is_night_shift" label="Ca dem" valuePropName="checked"><Switch size="small" /></Form.Item>
            <Form.Item name="is_leave_code" label="Ma nghi" valuePropName="checked"><Switch size="small" /></Form.Item>
            <Form.Item name="is_paid_leave" label="Nghi co luong" valuePropName="checked"><Switch size="small" /></Form.Item>
          </div>
          <Form.Item name="notes" label="Ghi chu"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
