import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, message, Tag, Popconfirm, Tooltip, Row, Col } from 'antd';
import { 
  PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, 
  AppstoreOutlined, TeamOutlined, ArrowUpOutlined, ArrowDownOutlined,
  SaveOutlined, MenuOutlined, SortAscendingOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

export default function Departments() {
  const { user } = useAuthStore();
  const isAdminOrAccountant = user?.role === 'admin' || user?.role === 'accountant';

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();
  const qc = useQueryClient();

  // State cục bộ lưu danh sách bộ phận phục vụ kéo thả trực tiếp
  const [localDepts, setLocalDepts] = useState([]);
  const [draggedTableIdx, setDraggedTableIdx] = useState(null);
  const [dragOverTableIdx, setDragOverTableIdx] = useState(null);

  // State cho Modal sắp xếp bộ phận
  const [reorderDeptModal, setReorderDeptModal] = useState(false);
  const [reorderDeptList, setReorderDeptList] = useState([]);
  const [draggedDeptIdx, setDraggedDeptIdx] = useState(null);
  const [dragOverDeptIdx, setDragOverDeptIdx] = useState(null);

  // State cho Modal sắp xếp nhân viên trong bộ phận
  const [reorderModal, setReorderModal] = useState(false);
  const [activeReorderDept, setActiveReorderDept] = useState(null);
  const [reorderEmpsList, setReorderEmpsList] = useState([]);
  const [draggedEmpIdx, setDraggedEmpIdx] = useState(null);
  const [dragOverEmpIdx, setDragOverEmpIdx] = useState(null);

  // 1. Fetch danh sách bộ phận
  const { data: depts = [], isLoading } = useQuery({
    queryKey: ['departments_list'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });

  // Đồng bộ data từ query vào state cục bộ để kéo thả mượt mà
  useEffect(() => {
    if (depts) {
      setLocalDepts(depts);
    }
  }, [depts]);

  // 2. Fetch toàn bộ nhân viên để gán vào bộ phận
  const { data: allEmpsData } = useQuery({
    queryKey: ['all_employees_simple'],
    queryFn: () => api.get('/employees', { params: { page: 1, page_size: 1000 } }).then((r) => r.data),
    enabled: isAdminOrAccountant,
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
      qc.invalidateQueries(['employees']);
      qc.invalidateQueries(['departments']);
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

  // 5. Mutation lưu thứ tự bộ phận sau khi kéo thả
  const reorderDept = useMutation({
    mutationFn: (ids) => api.put('/departments/reorder', ids),
    onSuccess: () => {
      message.success('Đã lưu thứ tự bộ phận mới!');
      qc.invalidateQueries(['departments_list']);
      qc.invalidateQueries(['employees']);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi khi sắp xếp bộ phận'),
  });

  // 6. Mutation sắp xếp nhân viên trong bộ phận
  const saveEmployeeOrder = useMutation({
    mutationFn: ({ deptId, employeeIds }) => api.put(`/departments/${deptId}/reorder-employees`, employeeIds),
    onSuccess: () => {
      message.success('Đã lưu thứ tự nhân viên trong bộ phận!');
      setReorderModal(false);
      setActiveReorderDept(null);
      setReorderEmpsList([]);
      qc.invalidateQueries(['departments_list']);
      qc.invalidateQueries(['employees']);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi khi lưu thứ tự nhân viên'),
  });

  // Mở modal Edit bộ phận
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

  // Mở modal Sắp xếp nhân viên thuộc bộ phận
  const openReorderEmployeesModal = async (deptRow) => {
    setActiveReorderDept(deptRow);
    try {
      const response = await api.get(`/departments/${deptRow.id}`);
      const detail = response.data;
      setReorderEmpsList(detail.employees || []);
      setReorderModal(true);
    } catch (error) {
      message.error('Không thể lấy danh sách nhân viên của bộ phận.');
    }
  };

  // ─── NATIVE DRAG & DROP NHÂN VIÊN ──────────────────────────────────────────
  const handleDragEmpStart = (e, index) => {
    setDraggedEmpIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEmpOver = (e, index) => {
    e.preventDefault();
    if (draggedEmpIdx === null || draggedEmpIdx === index) return;
    if (dragOverEmpIdx !== index) {
      setDragOverEmpIdx(index);
    }
  };

  const handleDragEmpDrop = (e, index) => {
    e.preventDefault();
    if (draggedEmpIdx === null || draggedEmpIdx === index) return;

    const list = [...reorderEmpsList];
    const item = list[draggedEmpIdx];
    list.splice(draggedEmpIdx, 1);
    list.splice(index, 0, item);

    setReorderEmpsList(list);
    setDraggedEmpIdx(null);
    setDragOverEmpIdx(null);
  };

  const handleDragEmpEnd = () => {
    setDraggedEmpIdx(null);
    setDragOverEmpIdx(null);
  };

  const handleMoveEmpButton = (index, direction) => {
    const list = [...reorderEmpsList];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= list.length) return;

    const temp = list[index];
    list[index] = list[swapIndex];
    list[swapIndex] = temp;
    setReorderEmpsList(list);
  };

  // ─── NATIVE DRAG & DROP BỘ PHẬN TRONG MODAL ────────────────────────────────
  const handleDragDeptStart = (e, index) => {
    setDraggedDeptIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragDeptOver = (e, index) => {
    e.preventDefault();
    if (draggedDeptIdx === null || draggedDeptIdx === index) return;
    if (dragOverDeptIdx !== index) {
      setDragOverDeptIdx(index);
    }
  };

  const handleDragDeptDrop = (e, index) => {
    e.preventDefault();
    if (draggedDeptIdx === null || draggedDeptIdx === index) return;

    const list = [...reorderDeptList];
    const item = list[draggedDeptIdx];
    list.splice(draggedDeptIdx, 1);
    list.splice(index, 0, item);

    setReorderDeptList(list);
    setDraggedDeptIdx(null);
    setDragOverDeptIdx(null);
  };

  const handleDragDeptEnd = () => {
    setDraggedDeptIdx(null);
    setDragOverDeptIdx(null);
  };

  const handleMoveDeptButton = (index, direction) => {
    const list = [...reorderDeptList];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= list.length) return;

    const temp = list[index];
    list[index] = list[swapIndex];
    list[swapIndex] = temp;
    setReorderDeptList(list);
  };

  const saveDeptOrder = () => {
    const ids = reorderDeptList.map((d) => d.id);
    reorderDept.mutate(ids, {
      onSuccess: () => {
        setReorderDeptModal(false);
        setReorderDeptList([]);
      }
    });
  };

  // Bộ lọc tìm kiếm
  const filteredDepts = localDepts.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.code.toLowerCase().includes(search.toLowerCase()) ||
      (d.name_tw && d.name_tw.toLowerCase().includes(search.toLowerCase()))
  );

  // ─── NATIVE DRAG & DROP TRỰC TIẾP TRÊN BẢNG CHÍNH (TABLE ROWS DRAGGING) ──────
  const onRow = (record, index) => {
    if (!isAdminOrAccountant) return {};
    return {
      draggable: true,
      style: {
        cursor: 'grab',
        opacity: draggedTableIdx === index ? 0.5 : 1,
        background: draggedTableIdx === index 
          ? '#f3f4f6' 
          : dragOverTableIdx === index 
            ? '#eff6ff' 
            : 'inherit',
        transition: 'background 0.15s ease, opacity 0.15s ease',
      },
      onDragStart: (e) => {
        setDraggedTableIdx(index);
        e.dataTransfer.effectAllowed = 'move';
      },
      onDragOver: (e) => {
        e.preventDefault();
        if (draggedTableIdx === null || draggedTableIdx === index) return;
        if (dragOverTableIdx !== index) {
          setDragOverTableIdx(index);
        }
      },
      onDragLeave: () => {
        if (dragOverTableIdx === index) {
          setDragOverTableIdx(null);
        }
      },
      onDrop: (e) => {
        e.preventDefault();
        if (draggedTableIdx === null || draggedTableIdx === index) return;

        const draggedItem = filteredDepts[draggedTableIdx];
        const targetItem = filteredDepts[index];
        if (!draggedItem || !targetItem) return;

        // Tìm vị trí trong mảng localDepts gốc
        const origDraggedIdx = localDepts.findIndex((d) => d.id === draggedItem.id);
        const origTargetIdx = localDepts.findIndex((d) => d.id === targetItem.id);
        if (origDraggedIdx === -1 || origTargetIdx === -1) return;

        const list = [...localDepts];
        const item = list[origDraggedIdx];
        list.splice(origDraggedIdx, 1);
        list.splice(origTargetIdx, 0, item);

        setLocalDepts(list);

        // Lưu lại vị trí mới vào Database
        const ids = list.map((d) => d.id);
        reorderDept.mutate(ids);

        setDraggedTableIdx(null);
        setDragOverTableIdx(null);
      },
      onDragEnd: () => {
        setDraggedTableIdx(null);
        setDragOverTableIdx(null);
      }
    };
  };

  const columns = [
    {
      title: '',
      key: 'drag_handle',
      width: 50,
      align: 'center',
      render: () => <MenuOutlined style={{ color: '#9ca3af', cursor: 'grab' }} />,
    },
    {
      title: 'Mã bộ phận',
      dataIndex: 'code',
      width: 140,
      render: (code) => <Tag color="blue" style={{ fontWeight: 600, padding: '2px 8px', borderRadius: 4 }}>{code}</Tag>,
    },
    {
      title: 'Tên tiếng Việt',
      dataIndex: 'name',
      width: 240,
      render: (name) => <span style={{ fontWeight: 600, color: '#1f2937' }}>{name}</span>,
    },
    {
      title: 'Tên tiếng Hoa',
      dataIndex: 'name_tw',
      width: 200,
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
      render: (count, r) => (
        <Tooltip title={isAdminOrAccountant ? "Bấm để kéo thả sắp xếp nhân viên trong bộ phận" : "Số thành viên"}>
          <Tag
            draggable={false}
            onDragStart={(e) => e.stopPropagation()}
            color={count > 0 ? 'green' : 'orange'}
            style={{ borderRadius: 6, padding: '3px 10px', fontWeight: 600, cursor: isAdminOrAccountant ? 'pointer' : 'default', border: '1px solid rgba(0,0,0,0.06)' }}
            onClick={(e) => {
              e.stopPropagation(); // Ngăn sự kiện click kích hoạt drag row
              if (isAdminOrAccountant) openReorderEmployeesModal(r);
            }}
          >
            <Space size={4}>
              <TeamOutlined />
              {count}
            </Space>
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: '',
      width: 80,
      fixed: 'right',
      render: (_, r) => (
        <Space 
          draggable={false}
          onDragStart={(e) => e.stopPropagation()}
          size={2} 
          onClick={(e) => e.stopPropagation()}
        >
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

  // Cột cho bảng sắp xếp nhân viên trong bộ phận
  const empReorderColumns = [
    {
      title: 'Thứ tự',
      width: 90,
      align: 'center',
      render: (_, r, idx) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<ArrowUpOutlined />}
            disabled={idx === 0}
            onClick={() => handleMoveEmpButton(idx, 'up')}
          />
          <Button
            type="text"
            size="small"
            icon={<ArrowDownOutlined />}
            disabled={idx === reorderEmpsList.length - 1}
            onClick={() => handleMoveEmpButton(idx, 'down')}
          />
        </Space>
      ),
    },
    {
      title: 'Mã NV',
      dataIndex: 'employee_code',
      width: 100,
      render: (code) => <span style={{ fontWeight: 600 }}>{code}</span>,
    },
    {
      title: 'Họ và tên',
      dataIndex: 'full_name',
      render: (name) => <span style={{ fontWeight: 500 }}>{name}</span>,
    },
  ];

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
            <div className="emp-stat-chip" style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
              💡 Giữ biểu tượng ☰ và kéo thả trực tiếp để sắp xếp bộ phận
            </div>
          </div>
        </div>
        {isAdminOrAccountant && (
          <Space>
            <Button
              icon={<SortAscendingOutlined />}
              onClick={() => {
                setReorderDeptList(depts);
                setReorderDeptModal(true);
              }}
            >
              Sắp xếp bộ phận
            </Button>
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
          </Space>
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
          onRow={onRow} // Kéo thả trực tiếp trên dòng của bảng chính!
          pagination={{
            showTotal: (t) => `Tổng ${t} bộ phận`,
            size: 'small',
            pageSize: 50, // Tăng pageSize để dễ kéo thả toàn bộ
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

      {/* Modal Kéo Thả Sắp xếp thứ tự nhân viên trong bộ phận */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TeamOutlined style={{ color: '#276EF1' }} />
            <span>Kéo thả sắp xếp Nhân viên — Bộ phận <strong>{activeReorderDept?.name}</strong></span>
          </div>
        }
        open={reorderModal}
        onCancel={() => {
          setReorderModal(false);
          setActiveReorderDept(null);
          setReorderEmpsList([]);
        }}
        onOk={() => {
          saveEmployeeOrder.mutate({
            deptId: activeReorderDept.id,
            employeeIds: reorderEmpsList.map((emp) => emp.id),
          });
        }}
        confirmLoading={saveEmployeeOrder.isPending}
        width={520}
        okText="Lưu thứ tự"
        cancelText="Hủy"
        okButtonProps={{ 
          icon: <SaveOutlined />, 
          style: { background: '#276EF1', borderColor: '#276EF1' } 
        }}
      >
        <p style={{ color: '#6b7280', fontSize: 12, margin: '8px 0 16px' }}>
          💡 **Hướng dẫn**: Nhấp giữ biểu tượng ☰ và **kéo lên hoặc kéo xuống** để thay đổi vị trí nhân viên. Nhân viên nào đứng trước sẽ hiển thị trước trong bảng Tiền ăn và Excel!
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto', padding: '4px' }}>
          {reorderEmpsList.map((emp, index) => (
            <div
              key={emp.id}
              draggable
              onDragStart={(e) => handleDragEmpStart(e, index)}
              onDragOver={(e) => handleDragEmpOver(e, index)}
              onDragLeave={() => setDragOverEmpIdx(null)}
              onDrop={(e) => handleDragEmpDrop(e, index)}
              onDragEnd={handleDragEmpEnd}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: draggedEmpIdx === index 
                  ? '#f3f4f6' 
                  : dragOverEmpIdx === index 
                    ? '#eff6ff' 
                    : '#ffffff',
                border: draggedEmpIdx === index 
                  ? '2px dashed #276EF1' 
                  : dragOverEmpIdx === index
                    ? '2px dashed #276EF1'
                    : '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'grab',
                opacity: draggedEmpIdx === index ? 0.6 : 1,
                boxShadow: (draggedEmpIdx === index || dragOverEmpIdx === index) ? 'none' : '0 1px 3px rgba(0,0,0,0.01)',
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              <Space size={12}>
                <MenuOutlined style={{ color: '#9ca3af', cursor: 'grab' }} />
                <span style={{ fontWeight: 600, color: '#276EF1' }}>{emp.employee_code}</span>
                <span style={{ fontWeight: 500, color: '#374151' }}>{emp.full_name}</span>
              </Space>

              <Space size={4} draggable={false} onDragStart={(e) => e.stopPropagation()}>
                <Button 
                  type="text" 
                  size="small" 
                  icon={<ArrowUpOutlined />} 
                  disabled={index === 0} 
                  onClick={() => handleMoveEmpButton(index, 'up')}
                />
                <Button 
                  type="text" 
                  size="small" 
                  icon={<ArrowDownOutlined />} 
                  disabled={index === reorderEmpsList.length - 1} 
                  onClick={() => handleMoveEmpButton(index, 'down')}
                />
              </Space>
            </div>
          ))}
        </div>
      </Modal>

      {/* Modal Kéo Thả Sắp xếp thứ tự Bộ phận */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SortAscendingOutlined style={{ color: '#276EF1' }} />
            <span>Kéo thả sắp xếp thứ tự Bộ phận</span>
          </div>
        }
        open={reorderDeptModal}
        onCancel={() => {
          setReorderDeptModal(false);
          setReorderDeptList([]);
        }}
        onOk={saveDeptOrder}
        confirmLoading={reorderDept.isPending}
        width={520}
        okText="Lưu thứ tự"
        cancelText="Hủy"
        okButtonProps={{ 
          icon: <SaveOutlined />, 
          style: { background: '#276EF1', borderColor: '#276EF1' } 
        }}
      >
        <p style={{ color: '#6b7280', fontSize: 12, margin: '8px 0 16px' }}>
          💡 **Hướng dẫn**: Nhấp giữ biểu tượng ☰ và **kéo lên hoặc kéo xuống** để thay đổi vị trí bộ phận. Bộ phận nào đứng trước sẽ hiển thị trước trong bảng Tiền ăn và Excel!
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto', padding: '4px' }}>
          {reorderDeptList.map((dept, index) => (
            <div
              key={dept.id}
              draggable
              onDragStart={(e) => handleDragDeptStart(e, index)}
              onDragOver={(e) => handleDragDeptOver(e, index)}
              onDragLeave={() => setDragOverDeptIdx(null)}
              onDrop={(e) => handleDragDeptDrop(e, index)}
              onDragEnd={handleDragDeptEnd}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: draggedDeptIdx === index 
                  ? '#f3f4f6' 
                  : dragOverDeptIdx === index 
                    ? '#eff6ff' 
                    : '#ffffff',
                border: draggedDeptIdx === index 
                  ? '2px dashed #276EF1' 
                  : dragOverDeptIdx === index
                    ? '2px dashed #276EF1'
                    : '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'grab',
                opacity: draggedDeptIdx === index ? 0.6 : 1,
                boxShadow: (draggedDeptIdx === index || dragOverDeptIdx === index) ? 'none' : '0 1px 3px rgba(0,0,0,0.01)',
                transition: 'background 0.2s, border-color 0.2s',
              }}
            >
              <Space size={12}>
                <MenuOutlined style={{ color: '#9ca3af', cursor: 'grab' }} />
                <Tag color="blue" style={{ fontWeight: 600, borderRadius: 4 }}>{dept.code}</Tag>
                <span style={{ fontWeight: 600, color: '#374151' }}>{dept.name}</span>
                {dept.name_tw && <span style={{ color: '#9ca3af', fontSize: 12 }}>({dept.name_tw})</span>}
              </Space>

              <Space size={4} draggable={false} onDragStart={(e) => e.stopPropagation()}>
                <Button 
                  type="text" 
                  size="small" 
                  icon={<ArrowUpOutlined />} 
                  disabled={index === 0} 
                  onClick={() => handleMoveDeptButton(index, 'up')}
                />
                <Button 
                  type="text" 
                  size="small" 
                  icon={<ArrowDownOutlined />} 
                  disabled={index === reorderDeptList.length - 1} 
                  onClick={() => handleMoveDeptButton(index, 'down')}
                />
              </Space>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
