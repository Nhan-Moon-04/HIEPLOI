import { useState } from 'react';
import { Table, Button, Modal, Switch, Space, message, Tag, Popconfirm, Tooltip, DatePicker } from 'antd';
import { PlusOutlined, DeleteOutlined, CalendarOutlined, ThunderboltOutlined, UserAddOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import HolidayExceptionsModal from '../components/Holidays/HolidayExceptionsModal';
import HolidayFormModal from '../components/Holidays/HolidayFormModal';

const typeColors = { national: 'red', company: 'blue', custom: 'orange' };
const typeLabels = { national: 'Lễ quốc gia', company: 'Công ty', custom: 'Tùy chỉnh' };

export default function Holidays() {
  const [genModal, setGenModal] = useState(false);
  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const qc = useQueryClient();
  const [selectedHoliday, setSelectedHoliday] = useState(null);
  const [exceptionModalVisible, setExceptionModalVisible] = useState(false);
  const [formModalVisible, setFormModalVisible] = useState(false);

  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ['holidays', monthKey],
    queryFn: () => api.get('/holidays', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  const toggleMut = useMutation({
    mutationFn: (id) => api.patch(`/holidays/${id}/toggle`),
    onSuccess: (res) => {
      const h = res.data;
      message.success(h.is_active ? 'Đã bật nghỉ - không tính lương ngày này' : 'Đã mở lại - tính lương bình thường');
      qc.invalidateQueries(['holidays']);
      qc.invalidateQueries(['attendance']);
      qc.invalidateQueries(['overtime']);
      qc.invalidateQueries(['meal-allowance']);
    },
  });

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/holidays/${id}`),
    onSuccess: () => {
      message.success('Đã xóa ngày nghỉ thành công!');
      qc.invalidateQueries(['holidays']);
      qc.invalidateQueries(['attendance']);
      qc.invalidateQueries(['overtime']);
      qc.invalidateQueries(['meal-allowance']);
    },
  });

  const genMut = useMutation({
    mutationFn: (month_key) => api.post('/holidays/generate-vn', { month_key }),
    onSuccess: (res) => {
      message.success(res.data.message);
      qc.invalidateQueries(['holidays']);
      qc.invalidateQueries(['attendance']);
      qc.invalidateQueries(['overtime']);
      qc.invalidateQueries(['meal-allowance']);
      setGenModal(false);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi'),
  });

  const handleEdit = (record) => {
    setSelectedHoliday(record);
    setFormModalVisible(true);
  };

  const columns = [
    {
      title: 'Ngày', dataIndex: 'holiday_date', width: 110,
      render: (d) => {
        const dd = dayjs(d);
        const dow = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dd.day()];
        return <span><b>{dd.format('DD/MM/YYYY')}</b> <span style={{ color: '#9ba8bf', fontSize: 11 }}>({dow})</span></span>;
      },
    },
    { title: 'Tên ngày nghỉ', dataIndex: 'name', width: 180, render: (t) => <span style={{ fontWeight: 500 }}>{t}</span> },
    {
      title: 'Loại', dataIndex: 'holiday_type', width: 110,
      render: (t) => <Tag color={typeColors[t] || 'default'}>{typeLabels[t] || t}</Tag>,
    },
    {
      title: 'Thời lượng', dataIndex: 'duration', width: 110,
      render: (d) => d === 'half' ? <Tag color="orange">Nửa ngày</Tag> : <Tag color="blue">Cả ngày</Tag>,
    },
    {
      title: 'Phạm vi áp dụng', dataIndex: 'scope', width: 220,
      render: (s, r) => {
        if (s === 'department') {
          return <Tag color="geekblue">Bộ phận: {r.departments}</Tag>;
        }
        if (s === 'employee') {
          return <Tag color="purple">Cá nhân ({r.target_employee_ids?.length || 0} NV)</Tag>;
        }
        return <Tag color="cyan">Toàn công ty</Tag>;
      }
    },
    {
      title: 'Trạng thái', dataIndex: 'is_active', width: 110, align: 'center',
      render: (active, record) => (
        <Switch
          checked={active}
          onChange={() => toggleMut.mutate(record.id)}
          checkedChildren="Nghỉ"
          unCheckedChildren="Làm"
          style={{ background: active ? '#ef4444' : '#22c55e' }}
        />
      ),
    },
    {
      title: 'Hiệu lực', key: 'effect', width: 160,
      render: (_, r) => r.is_active
        ? <span style={{ color: '#ef4444', fontSize: 12 }}>{r.duration === 'half' ? 'Tính 8h công nếu đi làm' : 'Ko tính công & tiền ăn'}</span>
        : <span style={{ color: '#22c55e', fontSize: 12 }}>Tính lương bình thường</span>,
    },
    { title: 'Ghi chú', dataIndex: 'notes', ellipsis: true },
    {
      title: 'Thao tác', width: 130, fixed: 'right', align: 'center',
      render: (_, r) => (
        <Space size="middle">
          {r.is_active && (
            <Tooltip title="Nhân viên ngoại lệ đi làm">
              <Button 
                type="text" 
                size="small" 
                icon={<UserAddOutlined style={{ color: '#f59e0b', fontSize: '15px' }} />} 
                onClick={() => { setSelectedHoliday(r); setExceptionModalVisible(true); }} 
              />
            </Tooltip>
          )}
          <Tooltip title="Chỉnh sửa ngày nghỉ">
            <Button 
              type="text" 
              size="small" 
              icon={<EditOutlined style={{ color: '#1677ff', fontSize: '15px' }} />} 
              onClick={() => handleEdit(r)} 
            />
          </Tooltip>
          <Popconfirm title="Xóa ngày lễ này?" onConfirm={() => delMut.mutate(r.id)} okText="Xóa" cancelText="Hủy">
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const activeCount = holidays.filter((h) => h.is_active).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><CalendarOutlined style={{ marginRight: 6 }} />Ngày OFF và Lễ</h1>
          <div className="sub">
            Tháng {dayjs(monthKey).format('M/YYYY')}: <b>{activeCount}</b> ngày nghỉ / <b>{holidays.length}</b> tổng số
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <DatePicker
            picker="month"
            value={dayjs(monthKey)}
            onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
            format="[Tháng] M / YYYY"
            style={{ width: 155 }}
          />
          <Button icon={<ThunderboltOutlined />} onClick={() => setGenModal(true)}>
            Tạo lễ VN
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setSelectedHoliday(null); setFormModalVisible(true); }}>
            Thêm ngày nghỉ
          </Button>
        </div>
      </div>

      <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 12, color: '#8c6d1f' }}>
        <b>Lưu ý:</b> Khi ngày nghỉ <b>BẬT Nghỉ</b> (Màu đỏ) = Áp dụng quy tắc nghỉ (tùy thuộc vào phạm vi & thời lượng cấu hình). 
        Khi <b>TẮT Nghỉ</b> (Màu xanh) = Đi làm bình thường, dữ liệu chấm công không bị ảnh hưởng bởi ngày nghỉ.
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Table columns={columns} dataSource={holidays} rowKey="id" loading={isLoading}
          size="small" pagination={false} scroll={{ x: 1000 }}
          locale={{ emptyText: 'Chưa có ngày lễ nào trong tháng này' }} />
      </div>

      {/* Holiday form modal for Create/Edit */}
      <HolidayFormModal
        visible={formModalVisible}
        onClose={() => { setFormModalVisible(false); setSelectedHoliday(null); }}
        holiday={selectedHoliday}
        onSaveSuccess={() => {
          qc.invalidateQueries(['holidays']);
          qc.invalidateQueries(['attendance']);
          qc.invalidateQueries(['overtime']);
          qc.invalidateQueries(['meal-allowance']);
        }}
      />

      {/* Generate VN holidays modal */}
      <Modal title={`Tạo ngày lễ tháng ${dayjs(monthKey).format('M/YYYY')}`} open={genModal} onCancel={() => setGenModal(false)}
        onOk={() => genMut.mutate(monthKey)} confirmLoading={genMut.isPending} okText="Tạo" cancelText="Hủy">
        <p style={{ marginBottom: 16, color: '#6b7a99' }}>
          Hệ thống sẽ tự động tìm và tạo các ngày lễ cố định của Việt Nam (nếu có) trong tháng <b>{dayjs(monthKey).format('M/YYYY')}</b> này. Các ngày lễ đã tồn tại sẽ được bỏ qua.
        </p>
      </Modal>

      <HolidayExceptionsModal
        visible={exceptionModalVisible}
        onClose={() => { setExceptionModalVisible(false); setSelectedHoliday(null); }}
        holiday={selectedHoliday}
        onSaveSuccess={() => {
          qc.invalidateQueries(['holidays']);
          qc.invalidateQueries(['attendance']);
          qc.invalidateQueries(['overtime']);
          qc.invalidateQueries(['meal-allowance']);
        }}
      />
    </div>
  );
}
