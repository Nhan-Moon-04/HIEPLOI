import React, { useState, useEffect } from 'react';
import {
  Modal,
  Table,
  Input,
  Button,
  Tag,
  Tooltip,
  Alert,
  Space,
  Typography,
  message,
  Popconfirm,
  Select,
} from 'antd';
import {
  CalendarOutlined,
  CloseCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Text } = Typography;

export default function FixedScansModal({ visible, onClose, monthKey, onSaveSuccess }) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [deptQuery, setDeptQuery] = useState(null);

  // Inline editing states
  const [editingKey, setEditingKey] = useState('');
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');

  const fetchFixedScans = async () => {
    if (!visible || !monthKey) return;
    setLoading(true);
    try {
      const res = await api.get('/attendance/forgot-scans/fixed', {
        params: { month_key: monthKey },
      });
      setScans(res.data || []);
      // Reset edit states
      setEditingKey('');
      setEditCheckIn('');
      setEditCheckOut('');
    } catch (error) {
      message.error(error.response?.data?.detail || 'Lỗi khi tải danh sách chấm công đã sửa');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFixedScans();
  }, [visible, monthKey]);

  const isEditing = (record) => record.id === editingKey;

  const startEdit = (record) => {
    setEditingKey(record.id);
    setEditCheckIn(record.first_check_in || '');
    setEditCheckOut(record.last_check_out || '');
  };

  const cancelEdit = () => {
    setEditingKey('');
    setEditCheckIn('');
    setEditCheckOut('');
  };

  const fillDefaultShiftTime = (record) => {
    if (!record.shift_start_end || record.shift_start_end === 'Chưa xếp ca') {
      message.warning('Mã ca này không có giờ quy định');
      return;
    }
    const parts = record.shift_start_end.split('-');
    if (parts.length < 2) return;

    setEditCheckIn(parts[0].trim());
    setEditCheckOut(parts[1].trim());
  };

  const handleSaveEdit = async (record) => {
    setSubmitting(true);
    try {
      await api.post('/attendance/forgot-scans/fixed/update', {
        attendance_id: record.id,
        check_in: editCheckIn || null,
        check_out: editCheckOut || null,
      });
      message.success('Cập nhật giờ chấm công thành công');
      setEditingKey('');
      fetchFixedScans();
      if (onSaveSuccess) onSaveSuccess();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Lỗi khi cập nhật thông tin');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (record) => {
    setLoading(true);
    try {
      await api.post('/attendance/forgot-scans/fixed/delete', {
        attendance_id: record.id,
      });
      message.success('Đã hoàn tác và xoá bản ghi chấm công đã sửa');
      fetchFixedScans();
      if (onSaveSuccess) onSaveSuccess();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Lỗi khi xoá bản ghi');
    } finally {
      setLoading(false);
    }
  };

  // Extract unique departments for dropdown filtering
  const departments = [...new Set(scans.map((s) => s.department).filter(Boolean))];

  // Filtering scans on client side
  const filteredScans = scans.filter((s) => {
    const nameMatch =
      !searchQuery ||
      s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.employee_code.toLowerCase().includes(searchQuery.toLowerCase());
    const deptMatch = !deptQuery || s.department === deptQuery;
    return nameMatch && deptMatch;
  });

  const columns = [
    {
      title: 'STT',
      key: 'index',
      width: 50,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Mã NV',
      dataIndex: 'employee_code',
      key: 'employee_code',
      width: 80,
      align: 'center',
    },
    {
      title: 'Họ tên',
      dataIndex: 'full_name',
      key: 'full_name',
      width: 150,
      render: (text, r) => (
        <div>
          <div style={{ fontWeight: '600', color: '#1f2937' }}>{text}</div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>{r.department}</div>
        </div>
      ),
    },
    {
      title: 'Ngày làm',
      dataIndex: 'work_date',
      key: 'work_date',
      width: 110,
      align: 'center',
      render: (date, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontWeight: '500' }}>{dayjs(date).format('DD/MM/YYYY')}</span>
          <Tag color={r.dow === 'CN' ? 'red' : 'blue'} style={{ margin: 0, fontSize: '10px', scale: '0.9' }}>
            {r.dow}
          </Tag>
        </div>
      ),
    },
    {
      title: 'Ca quy định',
      key: 'shift_info',
      width: 130,
      align: 'center',
      render: (_, r) => (
        <Space direction="vertical" size={2} style={{ width: '100%', alignItems: 'center' }}>
          <Tag color="purple">{r.shift_code || '–'}</Tag>
          <span style={{ color: '#4b5563', fontSize: '11px' }}>{r.shift_start_end}</span>
        </Space>
      ),
    },
    {
      title: 'Giờ vào',
      key: 'first_check_in',
      width: 130,
      align: 'center',
      render: (_, record) => {
        const editable = isEditing(record);
        return editable ? (
          <Input
            size="small"
            placeholder="HH:mm (VD: 07:30)"
            value={editCheckIn}
            onChange={(e) => setEditCheckIn(e.target.value)}
            style={{ width: '100px', borderRadius: '4px', textAlign: 'center' }}
          />
        ) : (
          <span style={{ fontWeight: '600', color: '#10b981' }}>{record.first_check_in || '--:--'}</span>
        );
      },
    },
    {
      title: 'Giờ ra',
      key: 'last_check_out',
      width: 130,
      align: 'center',
      render: (_, record) => {
        const editable = isEditing(record);
        return editable ? (
          <Input
            size="small"
            placeholder="HH:mm (VD: 16:30)"
            value={editCheckOut}
            onChange={(e) => setEditCheckOut(e.target.value)}
            style={{ width: '100px', borderRadius: '4px', textAlign: 'center' }}
          />
        ) : (
          <span style={{ fontWeight: '600', color: '#10b981' }}>{record.last_check_out || '--:--'}</span>
        );
      },
    },
    {
      title: 'Tổng giờ',
      dataIndex: 'total_hours',
      key: 'total_hours',
      width: 90,
      align: 'center',
      render: (hours) => (
        <span style={{ fontWeight: '700', color: '#276EF1' }}>{hours ? `${hours.toFixed(2)}h` : '0h'}</span>
      ),
    },
    {
      title: 'Nguồn sửa',
      dataIndex: 'source',
      key: 'source',
      width: 110,
      align: 'center',
      render: (src) => {
        const colorMap = {
          'Sửa nhanh': 'orange',
          'Nhập Excel': 'blue',
          'Thủ công': 'green',
        };
        return <Tag color={colorMap[src] || 'default'}>{src}</Tag>;
      },
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 120,
      align: 'center',
      render: (_, record) => {
        const editable = isEditing(record);
        if (editable) {
          return (
            <Space size="middle">
              <Tooltip title="Lưu thay đổi">
                <Button
                  type="text"
                  size="small"
                  icon={<SaveOutlined style={{ color: '#10b981', fontSize: '15px' }} />}
                  onClick={() => handleSaveEdit(record)}
                  loading={submitting}
                />
              </Tooltip>
              <Tooltip title="Điền nhanh giờ quy định của ca">
                <Button
                  type="text"
                  size="small"
                  icon={<ThunderboltOutlined style={{ color: '#f59e0b', fontSize: '15px' }} />}
                  onClick={() => fillDefaultShiftTime(record)}
                />
              </Tooltip>
              <Tooltip title="Huỷ chỉnh sửa">
                <Button
                  type="text"
                  size="small"
                  icon={<RollbackOutlined style={{ color: '#ef4444', fontSize: '15px' }} />}
                  onClick={cancelEdit}
                />
              </Tooltip>
            </Space>
          );
        }

        return (
          <Space size="middle">
            <Tooltip title="Sửa lại giờ vào/ra">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined style={{ color: '#276EF1', fontSize: '15px' }} />}
                onClick={() => startEdit(record)}
              />
            </Tooltip>
            <Tooltip title="Xoá bản ghi sửa, khôi phục trạng thái chưa sửa">
              <Popconfirm
                title="Xác nhận xoá bản ghi này?"
                description="Bản ghi chấm công đã sửa sẽ bị xoá và khôi phục về trạng thái gốc."
                onConfirm={() => handleDelete(record)}
                okText="Xoá"
                cancelText="Không"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined style={{ color: '#ef4444', fontSize: '15px' }} />}
                />
              </Popconfirm>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarOutlined style={{ color: '#276EF1' }} />
          <span>Lịch sử & Quản lý chấm công đã sửa - Tháng {monthKey ? dayjs(monthKey).format('MM/YYYY') : ''}</span>
        </div>
      }
      width={1200}
      footer={[
        <Button key="close" onClick={onClose} icon={<CloseCircleOutlined />}>
          Đóng
        </Button>,
      ]}
      bodyStyle={{ padding: '16px' }}
      className="fixed-scans-modal"
    >
      <style>{`
        .fixed-scans-modal .ant-modal-header {
          border-bottom: 1px solid #f3f4f6;
          padding: 16px 24px;
        }
        .fixed-scans-modal .ant-modal-footer {
          border-top: 1px solid #f3f4f6;
          padding: 16px 24px;
        }
        .fixed-scans-modal .ant-table-thead > tr > th {
          background-color: #f9fafb;
          font-weight: 600;
        }
      `}</style>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Alert
          message={
            <div style={{ fontSize: '13px' }}>
              <strong>Hướng dẫn quản lý chấm công đã sửa:</strong>
              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                <li>Danh sách hiển thị các ngày làm việc đã được sửa thủ công hoặc sửa nhanh (từ chức năng xử lý quên quẹt thẻ).</li>
                <li>Bấm biểu tượng <strong>Sửa</strong> (<EditOutlined />) để đổi Giờ vào / Giờ ra. Bấm nút sấm sét (<ThunderboltOutlined style={{ color: '#f59e0b' }} />) để điền nhanh giờ quy định ca.</li>
                <li>Bấm biểu tượng <strong>Xoá</strong> (<DeleteOutlined />) để hoàn tác (xoá bản ghi sửa thủ công, khôi phục lại trạng thái ban đầu).</li>
              </ul>
            </div>
          }
          type="info"
          showIcon
          style={{ borderRadius: '6px' }}
        />

        {/* Filters and Search Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <Space size="middle" style={{ flex: 1, minWidth: '300px' }}>
            <Input
              placeholder="Nhập mã hoặc họ tên nhân viên..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              style={{ width: '250px', borderRadius: '5px' }}
              allowClear
            />
            <Select
              placeholder="Lọc bộ phận"
              allowClear
              style={{ width: '180px' }}
              value={deptQuery}
              onChange={setDeptQuery}
              options={departments.map((d) => ({ value: d, label: d }))}
              suffixIcon={<TeamOutlined style={{ color: '#9ca3af' }} />}
            />
          </Space>
          <div>
            <Text type="secondary">
              Hiển thị <strong>{filteredScans.length}</strong> / <strong>{scans.length}</strong> bản ghi đã sửa
            </Text>
          </div>
        </div>

        <Table
          dataSource={filteredScans}
          columns={columns}
          rowKey={(record) => record.id}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          size="middle"
          bordered
          style={{ borderRadius: '6px', overflow: 'hidden' }}
        />
      </Space>
    </Modal>
  );
}
