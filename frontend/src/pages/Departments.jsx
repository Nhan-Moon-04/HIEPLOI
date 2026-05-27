import { useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Tag, Popconfirm, Card, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, AppstoreOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

export default function Departments() {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const isAdminOrAccountant = user?.role === 'admin' || user?.role === 'accountant';

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();
  const qc = useQueryClient();

  // 1. Fetch danh sách bộ phận
  const { data: depts = [], isLoading } = useQuery({
    queryKey: ['departments_list'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });

  // 2. Fetch toàn bộ nhân viên để gán vào bộ phận
  const { data: allEmpsData } = useQuery({
    queryKey: ['all_employees_simple'],
    queryFn: () => api.get('/employees', { params: { page: 1, page_size: 1000 } }).then((r) => r.data),
    enabled: isAdminOrAccountant, // Chỉ cần tải danh sách nếu là Admin hoặc Kế toán
  });

  const employeeOptions = (allEmpsData?.items || []).map((emp) => ({
    value: emp.id,
    label: `[${emp.employee_code}] ${emp.full_name} ${emp.department ? `(${emp.department})` : ''}`,
  }));

  // 3. Mutation thêm / sửa bộ phận
  const save = useMutation({
    mutationFn: async (v) => {
      const p = { ...v };
      if (editing) {
        return api.put(`/departments/${editing.id}`, p);
      } else {
        return api.post('/departments', p);
      }
    },
    onSuccess: () => {
      message.success('Lưu bộ phận thành công!');
      qc.invalidateQueries(['departments_list']);
      qc.invalidateQueries(['employees']); // Invalidate employees list since their department reference might change
      qc.invalidateQueries(['departments']); // Invalidate employee department list query too
      setModal(false);
      setEditing(null);
      form.resetFields();
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Có lỗi xảy ra'),
  });

  // 4. Mutation xóa bộ phận
  const del = useMutation({
    mutationFn: (id) => api.delete(`/departments/${id}`),
    onSuccess: () => {
      message.success('Đã xóa bộ phận và đồng bộ lại nhân sự!');
      qc.invalidateQueries(['departments_list']);
      qc.invalidateQueries(['employees']);
      qc.invalidateQueries(['departments']);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi khi xóa bộ phận'),
  });

  // Mở modal Edit và fetch chi tiết bộ phận kèm employee_ids
  const openEdit = async (deptRow) => {
    setEditing(deptRow);
    try {
      const response = await api.get(`/departments/${deptRow.id}`);
      const detail = response.data;
      form.setFieldsValue({
        ...detail.department,
        employee_ids: detail.employees.map((emp) => emp.id),
      });
      setModal(true);
    } catch (error) {
      message.error('Không thể lấy thông tin chi tiết bộ phận.');
    }
  };

  const filteredDepts = depts.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.code.toLowerCase().includes(search.toLowerCase()) ||
      (d.name_tw && d.name_tw.toLowerCase().includes(search.toLowerCase()))
  );

  const columns = [
    {
      title: 'Mã bộ phận',
      dataIndex: 'code',
      width: 140,
      render: (code) => <Tag color="blue" style={{ fontWeight: 600, padding: '2px 8px', borderRadius: 4 }}>{code}</Tag>,
    },
    {
      title: 'Tên tiếng Việt',
      dataIndex: 'name',
      width: 220,
      render: (name) => <span style={{ fontWeight: 600, color: '#1f2937' }}>{name}</span>,
    },
    {
      title: 'Tên tiếng Hoa',
      dataIndex: 'name_tw',
      width: 180,
      render: (name_tw) => name_tw ? <span style={{ color: '#6b7280' }}>{name_tw}</span> : <span className="emp-dash">—</span>,
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      render: (desc) => desc ? <span style={{ color: '#4b5563' }}>{desc}</span> : <span className="emp-dash">—</span>,
    },
    {
      title: 'Số nhân viên',
      dataIndex: 'employee_count',
      width: 130,
      align: 'center',
      render: (count) => (
        <Tag color={count > 0 ? 'green' : 'orange'} style={{ borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
          <Space size={4}>
            <TeamOutlined />
            {count}
          </Space>
        </Tag>
      ),
    },
    {
      title: '',
      width: 80,
      fixed: 'right',
      render: (_, r) => (
        <Space size={2}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} className="emp-act-btn" />
          <Popconfirm
            title="Xóa bộ phận này?"
            description="Các nhân viên thuộc bộ phận này sẽ được đưa về trạng thái bộ phận trống."
            onConfirm={() => del.mutate(r.id)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" icon={<DeleteOutlined />} danger className="emp-act-btn" />
          </Popconfirm>
        </Space>
      ),
    },
  ].filter((col) => isAdminOrAccountant || col.fixed !== 'right');

  return (
    <div className="emp-page">
      {/* Title bar */}
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <h2 className="emp-title">Bộ phận</h2>
          <div className="emp-stats">
            <div className="emp-stat-chip">
              <span className="emp-stat-dot emp-stat-dot--blue" />
              Tổng số bộ phận: <strong>{depts.length}</strong>
            </div>
          </div>
        </div>
        {isAdminOrAccountant && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            className="emp-add-btn"
            onClick={() => {
              setEditing(null);
              form.resetFields();
              setModal(true);
            }}
          >
            Thêm bộ phận
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="emp-filterbar">
        <Input
          placeholder="Tìm mã bộ phận, tên..."
          prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
          style={{ width: 260 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          size="middle"
        />
      </div>

      {/* Table card */}
      <div className="emp-table-card">
        <Table
          columns={columns}
          dataSource={filteredDepts}
          rowKey="id"
          loading={isLoading}
          size="middle"
          scroll={{ x: 800 }}
          className="emp-table"
          pagination={{
            showTotal: (t) => `Tổng ${t} bộ phận`,
            size: 'small',
            pageSize: 20,
          }}
        />
      </div>

      {/* Add / Edit Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AppstoreOutlined style={{ color: '#276EF1' }} />
            {editing ? 'Chỉnh sửa bộ phận' : 'Thêm bộ phận mới'}
          </div>
        }
        open={modal}
        onCancel={() => {
          setModal(false);
          setEditing(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        width={680}
        okText="Lưu"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#276EF1', borderColor: '#276EF1' } }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => save.mutate(v)}
          style={{ marginTop: 16 }}
          initialValues={{ employee_ids: [] }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="code" label="Mã bộ phận" rules={[{ required: true, message: 'Vui lòng nhập mã bộ phận' }]}>
                <Input placeholder="Ví dụ: SX, KT, HR..." disabled={!!editing} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="Tên tiếng Việt" rules={[{ required: true, message: 'Vui lòng nhập tên bộ phận' }]}>
                <Input placeholder="Ví dụ: Sản xuất, Kế toán..." />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="name_tw" label="Tên tiếng Hoa (Không bắt buộc)">
                <Input placeholder="Ví dụ: 生產, 會計..." />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} placeholder="Mô tả ngắn gọn về chức năng nhiệm vụ..." />
          </Form.Item>

          {isAdminOrAccountant && (
            <Form.Item name="employee_ids" label="Thành viên bộ phận (Gán nhân viên vào bộ phận này)">
              <Select
                mode="multiple"
                allowClear
                showSearch
                placeholder="Chọn nhân viên để gán vào bộ phận"
                optionFilterProp="label"
                options={employeeOptions}
                style={{ width: '100%' }}
                maxTagCount="responsive"
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
