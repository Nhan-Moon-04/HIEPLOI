import React, { useState, useEffect } from 'react';
import { Modal, Table, Input, Select, Button, Space, Typography, message } from 'antd';
import {
  UserAddOutlined,
  SearchOutlined,
  SaveOutlined,
  CloseCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import api from '../../api/client';
import dayjs from 'dayjs';

const { Text } = Typography;

export default function HolidayExceptionsModal({ visible, onClose, holiday, onSaveSuccess }) {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState(null);

  const fetchData = async () => {
    if (!visible || !holiday) return;
    setLoading(true);
    try {
      // 1. Fetch all active employees
      const empRes = await api.get('/employees', { params: { page_size: 1000, is_active: true } });
      const empList = empRes.data?.items || empRes.data || [];
      setEmployees(empList);

      // Extract departments for filter
      const depts = [...new Set(empList.map(e => e.department).filter(Boolean))];
      setDepartments(depts);

      // 2. Fetch current exceptions for this holiday
      const excRes = await api.get(`/holidays/${holiday.id}/exceptions`);
      const excList = excRes.data || [];
      setSelectedRowKeys(excList.map(exc => exc.employee_id));
    } catch (error) {
      message.error('Lỗi khi tải dữ liệu nhân viên ngoại lệ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [visible, holiday]);

  const handleSave = async () => {
    if (!holiday) return;
    setSaving(true);
    try {
      await api.post(`/holidays/${holiday.id}/exceptions`, {
        employee_ids: selectedRowKeys
      });
      message.success('Cập nhật danh sách nhân viên ngoại lệ thành công');
      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Lỗi khi lưu danh sách ngoại lệ');
    } finally {
      setSaving(false);
    }
  };

  // Filter employees
  const filteredEmployees = employees.filter(emp => {
    const codeMatch = (emp.employee_code || '').toLowerCase().includes(searchQuery.toLowerCase());
    const nameMatch = (emp.full_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const deptMatch = selectedDept ? emp.department === selectedDept : true;
    return (codeMatch || nameMatch) && deptMatch;
  });

  const columns = [
    {
      title: 'Mã NV',
      dataIndex: 'employee_code',
      key: 'employee_code',
      width: 100,
      align: 'center',
      sorter: (a, b) => (a.employee_code || '').localeCompare(b.employee_code || ''),
    },
    {
      title: 'Họ và tên',
      dataIndex: 'full_name',
      key: 'full_name',
      sorter: (a, b) => (a.full_name || '').localeCompare(b.full_name || ''),
      render: (text) => <span style={{ fontWeight: 500, color: '#1f2937' }}>{text}</span>
    },
    {
      title: 'Bộ phận / Phòng ban',
      dataIndex: 'department',
      key: 'department',
      sorter: (a, b) => (a.department || '').localeCompare(b.department || ''),
      render: (text) => <Text type="secondary">{text || '–'}</Text>
    }
  ];

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserAddOutlined style={{ color: '#f59e0b' }} />
          <span>Nhân viên ngoại lệ đi làm: {holiday ? `${holiday.name} (${dayjs(holiday.holiday_date).format('DD/MM/YYYY')})` : ''}</span>
        </div>
      }
      width={750}
      footer={[
        <Button key="close" onClick={onClose} icon={<CloseCircleOutlined />}>
          Đóng
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
          style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
        >
          Lưu cấu hình
        </Button>
      ]}
      bodyStyle={{ padding: '16px 24px' }}
      className="holiday-exceptions-modal"
    >
      <style>{`
        .holiday-exceptions-modal .ant-modal-header {
          border-bottom: 1px solid #f3f4f6;
          padding: 16px 24px;
        }
        .holiday-exceptions-modal .ant-modal-footer {
          border-top: 1px solid #f3f4f6;
          padding: 16px 24px;
        }
        .holiday-exceptions-modal .ant-table-thead > tr > th {
          background-color: #f9fafb;
          font-weight: 600;
        }
      `}</style>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: '1.6' }}>
          Chọn những nhân viên <strong>vẫn đi làm bình thường</strong> vào ngày nghỉ toàn công ty này. 
          Giờ công, tăng ca và tiền cơm của họ sẽ được tính toán bình thường. Những người không chọn sẽ được tính nghỉ lễ (không hiện chấm công).
        </div>

        {/* Filter controls */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Input
            placeholder="Tìm theo mã hoặc tên..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: 220, borderRadius: '6px' }}
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
          />
          <Select
            placeholder="Lọc theo bộ phận"
            value={selectedDept}
            onChange={setSelectedDept}
            style={{ width: 200 }}
            allowClear
            options={departments.map(d => ({ value: d, label: d }))}
            suffixIcon={<TeamOutlined style={{ color: '#bfbfbf' }} />}
          />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <Text type="secondary">
              Đã chọn: <strong style={{ color: '#f59e0b' }}>{selectedRowKeys.length}</strong> nhân viên
            </Text>
          </div>
        </div>

        <Table
          dataSource={filteredEmployees}
          columns={columns}
          rowKey={record => record.id}
          rowSelection={{
            selectedRowKeys,
            onChange: keys => setSelectedRowKeys(keys)
          }}
          loading={loading}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          size="middle"
          bordered
          style={{ borderRadius: '6px', overflow: 'hidden' }}
        />
      </Space>
    </Modal>
  );
}
