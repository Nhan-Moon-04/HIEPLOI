import { useState } from 'react';
import { Table, Button, Modal, Form, Input, DatePicker, Select, Switch, Space, message, Tag, Popconfirm, InputNumber } from 'antd';
import { PlusOutlined, DeleteOutlined, CalendarOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';

const typeColors = { national: 'red', company: 'blue', custom: 'orange' };
const typeLabels = { national: 'Le quoc gia', company: 'Cong ty', custom: 'Tuy chinh' };

export default function Holidays() {
  const [modal, setModal] = useState(false);
  const [genModal, setGenModal] = useState(false);
  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ['holidays', monthKey],
    queryFn: () => api.get('/holidays', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: (v) => {
      const p = { ...v };
      p.holiday_date = p.holiday_date.format('YYYY-MM-DD');
      return api.post('/holidays', p);
    },
    onSuccess: () => { message.success('Da tao ngay nghi!'); qc.invalidateQueries(['holidays']); setModal(false); form.resetFields(); },
    onError: (e) => message.error(e.response?.data?.detail || 'Loi'),
  });

  const toggleMut = useMutation({
    mutationFn: (id) => api.patch(`/holidays/${id}/toggle`),
    onSuccess: (res) => {
      const h = res.data;
      message.success(h.is_active ? 'Da bat nghi - ko tinh luong ngay nay' : 'Da mo lai - tinh luong binh thuong');
      qc.invalidateQueries(['holidays']);
    },
  });

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/holidays/${id}`),
    onSuccess: () => { message.success('Da xoa!'); qc.invalidateQueries(['holidays']); },
  });

  const genMut = useMutation({
    mutationFn: (month_key) => api.post('/holidays/generate-vn', { month_key }),
    onSuccess: (res) => {
      message.success(res.data.message);
      qc.invalidateQueries(['holidays']);
      setGenModal(false);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Loi'),
  });

  const columns = [
    {
      title: 'Ngay', dataIndex: 'holiday_date', width: 110,
      render: (d) => {
        const dd = dayjs(d);
        const dow = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dd.day()];
        return <span><b>{dd.format('DD/MM/YYYY')}</b> <span style={{ color: '#9ba8bf', fontSize: 11 }}>({dow})</span></span>;
      },
    },
    { title: 'Ten', dataIndex: 'name', width: 200, render: (t) => <span style={{ fontWeight: 500 }}>{t}</span> },
    {
      title: 'Loai', dataIndex: 'holiday_type', width: 100,
      render: (t) => <Tag color={typeColors[t] || 'default'}>{typeLabels[t] || t}</Tag>,
    },
    {
      title: 'Trang thai', dataIndex: 'is_active', width: 130, align: 'center',
      render: (active, record) => (
        <Switch
          checked={active}
          onChange={() => toggleMut.mutate(record.id)}
          checkedChildren="Nghi"
          unCheckedChildren="Lam"
          style={{ background: active ? '#ef4444' : '#22c55e' }}
        />
      ),
    },
    {
      title: 'Hieu luc', key: 'effect', width: 160,
      render: (_, r) => r.is_active
        ? <span style={{ color: '#ef4444', fontSize: 12 }}>Ko tinh luong & tien an</span>
        : <span style={{ color: '#22c55e', fontSize: 12 }}>Tinh luong binh thuong</span>,
    },
    { title: 'Ghi chu', dataIndex: 'notes', ellipsis: true },
    {
      title: '', width: 50, fixed: 'right',
      render: (_, r) => (
        <Popconfirm title="Xoa ngay le nay?" onConfirm={() => delMut.mutate(r.id)} okText="Xoa" cancelText="Huy">
          <Button type="text" size="small" icon={<DeleteOutlined />} danger />
        </Popconfirm>
      ),
    },
  ];

  const activeCount = holidays.filter((h) => h.is_active).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><CalendarOutlined style={{ marginRight: 6 }} />Ngay OFF va Le</h1>
          <div className="sub">
            Thang {dayjs(monthKey).format('M/YYYY')}: <b>{activeCount}</b> ngay nghi / <b>{holidays.length}</b> tong
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <DatePicker
            picker="month"
            value={dayjs(monthKey)}
            onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
            format="[Thang] M / YYYY"
            style={{ width: 155 }}
          />
          <Button icon={<ThunderboltOutlined />} onClick={() => setGenModal(true)}>
            Tao le VN
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal(true); }}>
            Them ngay nghi
          </Button>
        </div>
      </div>

      <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 12, color: '#8c6d1f' }}>
        <b>Luu y:</b> Khi ngay nghi <b>BAT</b> (do) = toan cong ty nghi, ko tinh luong va tien an.
        Khi <b>TAT</b> (xanh) = di lam binh thuong, du lieu cham cong ko bi xoa.
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Table columns={columns} dataSource={holidays} rowKey="id" loading={isLoading}
          size="small" pagination={false} scroll={{ x: 800 }}
          locale={{ emptyText: 'Chua co ngay le nao trong thang nay' }} />
      </div>

      {/* Create holiday modal */}
      <Modal title="Them ngay nghi" open={modal} onCancel={() => setModal(false)}
        onOk={() => form.submit()} confirmLoading={createMut.isPending} okText="Tao" cancelText="Huy">
        <Form form={form} layout="vertical" onFinish={(v) => createMut.mutate(v)} style={{ marginTop: 16 }}
          initialValues={{ holiday_type: 'company', is_active: true }}>
          <Form.Item name="holiday_date" label="Ngay" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="name" label="Ten ngay le/nghi" rules={[{ required: true }]}>
            <Input placeholder="VD: Tet Duong lich, Ngay nghi bu..." />
          </Form.Item>
          <Form.Item name="holiday_type" label="Loai">
            <Select options={[
              { value: 'national', label: 'Le quoc gia' },
              { value: 'company', label: 'Cong ty cho nghi' },
              { value: 'custom', label: 'Tuy chinh' },
            ]} />
          </Form.Item>
          <Form.Item name="is_active" label="Bat nghi ngay (ko tinh luong)" valuePropName="checked">
            <Switch checkedChildren="Nghi" unCheckedChildren="Lam" />
          </Form.Item>
          <Form.Item name="notes" label="Ghi chu"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Generate VN holidays modal */}
      <Modal title={`Tạo ngày lễ tháng ${dayjs(monthKey).format('M/YYYY')}`} open={genModal} onCancel={() => setGenModal(false)}
        onOk={() => genMut.mutate(monthKey)} confirmLoading={genMut.isPending} okText="Tao" cancelText="Huy">
        <p style={{ marginBottom: 16, color: '#6b7a99' }}>
          Hệ thống sẽ tự động tìm và tạo các ngày lễ cố định của Việt Nam (nếu có) trong tháng <b>{dayjs(monthKey).format('M/YYYY')}</b> này. Các ngày lễ đã tồn tại sẽ được bỏ qua.
        </p>
      </Modal>
    </div>
  );
}
