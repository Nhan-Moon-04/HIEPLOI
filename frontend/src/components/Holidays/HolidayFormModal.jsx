import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, DatePicker, Select, Switch, message, Button, Space } from 'antd';
import { SaveOutlined, CloseCircleOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../api/client';

export default function HolidayFormModal({ visible, onClose, holiday, onSaveSuccess }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  
  // Watch scope value to conditionally display fields
  const scope = Form.useWatch('scope', form);

  // Fetch departments and employees when modal opens
  useEffect(() => {
    const loadSelectionData = async () => {
      if (!visible) return;
      setLoading(true);
      try {
        const deptRes = await api.get('/employees/departments');
        setDepartments(deptRes.data || []);

        const empRes = await api.get('/employees', { params: { page_size: 1000, is_active: true } });
        setEmployees(empRes.data?.items || empRes.data || []);
      } catch (error) {
        message.error('Lỗi khi tải danh sách phòng ban hoặc nhân viên');
      } finally {
        setLoading(false);
      }
    };
    loadSelectionData();
  }, [visible]);

  // Sync form values on holiday change
  useEffect(() => {
    if (visible) {
      if (holiday) {
        form.setFieldsValue({
          holiday_date: holiday.holiday_date ? dayjs(holiday.holiday_date) : null,
          name: holiday.name,
          holiday_type: holiday.holiday_type || 'company',
          is_active: holiday.is_active !== false,
          notes: holiday.notes || '',
          duration: holiday.duration || 'full',
          scope: holiday.scope || 'all',
          departments: holiday.departments ? holiday.departments.split(',').map(d => d.trim()).filter(Boolean) : [],
          target_employee_ids: holiday.target_employee_ids || [],
        });
      } else {
        form.resetFields();
      }
    }
  }, [visible, holiday, form]);

  const handleFinish = async (values) => {
    const data = { ...values };
    
    // Format Date
    if (data.holiday_date) {
      data.holiday_date = data.holiday_date.format('YYYY-MM-DD');
    }
    
    // Format departments to comma-separated string if scope is department
    if (data.scope === 'department' && Array.isArray(data.departments)) {
      data.departments = data.departments.join(',');
    } else {
      data.departments = null;
    }

    // Clear target employee ids if scope is not employee
    if (data.scope !== 'employee') {
      data.target_employee_ids = [];
    }

    setSaving(true);
    try {
      if (holiday) {
        // Edit mode
        await api.put(`/holidays/${holiday.id}`, data);
        message.success('Cập nhật ngày nghỉ thành công!');
      } else {
        // Create mode
        await api.post('/holidays', data);
        message.success('Tạo ngày nghỉ mới thành công!');
      }
      if (onSaveSuccess) onSaveSuccess();
      onClose();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Lỗi xảy ra khi lưu ngày nghỉ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      title={
        <Space>
          <CalendarOutlined style={{ color: '#1677ff' }} />
          <span>{holiday ? 'Chỉnh sửa ngày nghỉ' : 'Thêm ngày nghỉ mới'}</span>
        </Space>
      }
      onOk={() => form.submit()}
      confirmLoading={saving}
      okText={holiday ? 'Cập nhật' : 'Tạo mới'}
      cancelText="Hủy"
      width={600}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        style={{ marginTop: 16 }}
        initialValues={{
          holiday_type: 'company',
          is_active: true,
          duration: 'full',
          scope: 'all',
        }}
      >
        <Form.Item name="holiday_date" label="Ngày nghỉ" rules={[{ required: true, message: 'Vui lòng chọn ngày!' }]}>
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item name="name" label="Tên ngày nghỉ / Lễ" rules={[{ required: true, message: 'Vui lòng điền tên ngày nghỉ!' }]}>
          <Input placeholder="VD: Tết Dương lịch, Nghỉ đột xuất..." />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Form.Item name="holiday_type" label="Loại ngày nghỉ">
            <Select options={[
              { value: 'national', label: 'Lễ quốc gia' },
              { value: 'company', label: 'Công ty cho nghỉ' },
              { value: 'custom', label: 'Tùy chỉnh' },
            ]} />
          </Form.Item>

          <Form.Item name="duration" label="Thời lượng nghỉ">
            <Select options={[
              { value: 'full', label: 'Cả ngày (Full day)' },
              { value: 'half', label: 'Nửa ngày (Half day)' },
            ]} />
          </Form.Item>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'center' }}>
          <Form.Item name="scope" label="Phạm vi áp dụng">
            <Select options={[
              { value: 'all', label: 'Toàn công ty' },
              { value: 'department', label: 'Theo bộ phận' },
              { value: 'employee', label: 'Theo cá nhân' },
            ]} />
          </Form.Item>

          <Form.Item name="is_active" label="Kích hoạt nghỉ (Bật nghỉ)" valuePropName="checked">
            <Switch checkedChildren="Bật nghỉ" unCheckedChildren="Tắt nghỉ" />
          </Form.Item>
        </div>

        {scope === 'department' && (
          <Form.Item
            name="departments"
            label="Bộ phận áp dụng"
            rules={[{ required: true, message: 'Vui lòng chọn ít nhất một bộ phận!' }]}
          >
            <Select
              mode="multiple"
              placeholder="Chọn bộ phận..."
              style={{ width: '100%' }}
              options={departments.map(d => ({ value: d, label: d }))}
              loading={loading}
              allowClear
            />
          </Form.Item>
        )}

        {scope === 'employee' && (
          <Form.Item
            name="target_employee_ids"
            label="Nhân viên áp dụng nghỉ"
            rules={[{ required: true, message: 'Vui lòng chọn ít nhất một nhân viên!' }]}
          >
            <Select
              mode="multiple"
              placeholder="Tìm và chọn nhân viên..."
              style={{ width: '100%' }}
              loading={loading}
              showSearch
              filterOption={(input, option) => {
                const searchStr = (option?.label || '').toLowerCase();
                return searchStr.includes(input.toLowerCase());
              }}
              options={employees.map(emp => ({
                value: emp.id,
                label: `[${emp.employee_code}] ${emp.full_name} (${emp.department || 'Không có bộ phận'})`
              }))}
              allowClear
            />
          </Form.Item>
        )}

        <Form.Item name="notes" label="Ghi chú">
          <Input.TextArea rows={3} placeholder="Mô tả thêm chi tiết..." />
        </Form.Item>
      </Form>
    </Modal>
  );
}
