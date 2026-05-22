import { useState, useEffect, useCallback } from 'react';
import {
  Button, Table, Tag, Tooltip, Modal, Form, Input, Select,
  Popconfirm, message, Drawer, Badge, Space, Tabs, Switch,
} from 'antd';
import {
  UserAddOutlined, EditOutlined, DeleteOutlined, LockOutlined,
  StopOutlined, CheckCircleOutlined, LogoutOutlined,
  ReloadOutlined, EyeOutlined, WifiOutlined, DisconnectOutlined,
  KeyOutlined, TeamOutlined, GlobalOutlined,
} from '@ant-design/icons';
import api from '../api/client';

const ROLE_OPTIONS = [
  { value: 'admin',         label: 'Quản trị viên' },
  { value: 'accountant',    label: 'Kế toán' },
  { value: 'import_export', label: 'Xuất nhập khẩu' },
  { value: 'worker',        label: 'Công nhân' },
];

const ROLE_COLORS = {
  admin: 'red',
  accountant: 'blue',
  import_export: 'purple',
  worker: 'default',
};

function timeAgo(dt) {
  if (!dt) return '—';
  const d = new Date(dt + 'Z');
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return `${diff}s trước`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h trước`;
  return `${Math.floor(diff / 86400)}d trước`;
}

function fmtDate(dt) {
  if (!dt) return '—';
  return new Date(dt + 'Z').toLocaleString('vi-VN');
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [pwUser, setPwUser] = useState(null);
  const [sessionUser, setSessionUser] = useState(null);   // Drawer xem sessions
  const [sessions, setSessions] = useState([]);
  const [sessLoading, setSessLoading] = useState(false);
  const [allSessions, setAllSessions] = useState([]);
  const [allSessLoading, setAllSessLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('users');

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [pwForm] = Form.useForm();

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data);
    } catch {
      message.error('Không lấy được danh sách user');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllSessions = useCallback(async () => {
    setAllSessLoading(true);
    try {
      const res = await api.get('/admin/sessions');
      setAllSessions(res.data);
    } catch {
      message.error('Không lấy được sessions');
    } finally {
      setAllSessLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => {
    if (activeTab === 'sessions') fetchAllSessions();
  }, [activeTab, fetchAllSessions]);

  // Auto refresh online status every 30s
  useEffect(() => {
    const t = setInterval(fetchUsers, 30000);
    return () => clearInterval(t);
  }, [fetchUsers]);

  // ── Create user ────────────────────────────────────────────────────────────
  const handleCreate = async (values) => {
    try {
      await api.post('/admin/users', values);
      message.success('Đã tạo user thành công');
      setCreateOpen(false);
      createForm.resetFields();
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Tạo user thất bại');
    }
  };

  // ── Edit user ──────────────────────────────────────────────────────────────
  const openEdit = (user) => {
    setEditUser(user);
    editForm.setFieldsValue({ full_name: user.full_name, role: user.role, employee_id: user.employee_id });
  };

  const handleEdit = async (values) => {
    try {
      await api.put(`/admin/users/${editUser.id}`, values);
      message.success('Đã cập nhật');
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Cập nhật thất bại');
    }
  };

  // ── Set password ───────────────────────────────────────────────────────────
  const handleSetPassword = async (values) => {
    try {
      await api.put(`/admin/users/${pwUser.id}/password`, { new_password: values.new_password });
      message.success(`Đã đặt lại mật khẩu cho ${pwUser.username}`);
      setPwUser(null);
      pwForm.resetFields();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Thất bại');
    }
  };

  // ── Toggle active ──────────────────────────────────────────────────────────
  const handleToggleActive = async (user) => {
    try {
      const res = await api.put(`/admin/users/${user.id}/toggle-active`);
      message.success(res.data.detail);
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Thất bại');
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (user) => {
    try {
      await api.delete(`/admin/users/${user.id}`);
      message.success(`Đã xoá user ${user.username}`);
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Xoá thất bại');
    }
  };

  // ── Sessions ───────────────────────────────────────────────────────────────
  const openSessions = async (user) => {
    setSessionUser(user);
    setSessLoading(true);
    try {
      const res = await api.get(`/admin/users/${user.id}/sessions`);
      setSessions(res.data);
    } catch {
      message.error('Không lấy được sessions');
    } finally {
      setSessLoading(false);
    }
  };

  const revokeSession = async (sessionId, userId) => {
    try {
      await api.delete(`/admin/users/${userId}/sessions/${sessionId}`);
      message.success('Đã đá văng thiết bị');
      // Refresh
      if (sessionUser) openSessions(sessionUser);
      if (activeTab === 'sessions') fetchAllSessions();
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Thất bại');
    }
  };

  const revokeAllSessions = async (userId, username) => {
    try {
      const res = await api.delete(`/admin/users/${userId}/sessions`);
      message.success(res.data.detail);
      if (sessionUser) openSessions(sessionUser);
      if (activeTab === 'sessions') fetchAllSessions();
      fetchUsers();
    } catch (err) {
      message.error(err.response?.data?.detail || 'Thất bại');
    }
  };

  // ── Table columns ──────────────────────────────────────────────────────────
  const columns = [
    {
      title: '#',
      dataIndex: 'id',
      width: 48,
      render: (v) => <span className="um-id">#{v}</span>,
    },
    {
      title: 'Người dùng',
      key: 'user',
      render: (_, r) => (
        <div className="um-user-cell">
          <div className="um-avatar" style={{ background: r.is_active ? 'linear-gradient(135deg,#276EF1,#4f46e5)' : '#9ca3af' }}>
            {(r.full_name || r.username)[0].toUpperCase()}
          </div>
          <div>
            <div className="um-username">{r.full_name || r.username}</div>
            <div className="um-user-sub">@{r.username}</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Quyền',
      dataIndex: 'role',
      width: 130,
      render: (v) => (
        <Tag color={ROLE_COLORS[v]} style={{ fontSize: 11 }}>
          {ROLE_OPTIONS.find(o => o.value === v)?.label || v}
        </Tag>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 110,
      render: (_, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {r.is_active
            ? <Tag color="success" style={{ fontSize: 10, margin: 0 }}>Hoạt động</Tag>
            : <Tag color="default" style={{ fontSize: 10, margin: 0 }}>Vô hiệu hoá</Tag>
          }
          {r.is_active && (
            r.is_online
              ? <span className="um-online"><Badge status="success" /> Online</span>
              : <span className="um-offline"><Badge status="default" /> {timeAgo(r.last_seen)}</span>
          )}
        </div>
      ),
    },
    {
      title: 'Phiên đăng nhập',
      key: 'sessions',
      width: 100,
      render: (_, r) => (
        <Tooltip title="Xem thiết bị đang đăng nhập">
          <button className="um-sess-btn" onClick={() => openSessions(r)}>
            <WifiOutlined style={{ color: r.active_sessions > 0 ? '#276EF1' : '#9ca3af' }} />
            <span>{r.active_sessions} thiết bị</span>
          </button>
        </Tooltip>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 170,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="Sửa thông tin">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Tooltip title="Đặt lại mật khẩu">
            <Button size="small" icon={<KeyOutlined />} onClick={() => setPwUser(r)} />
          </Tooltip>
          <Tooltip title={r.is_active ? 'Vô hiệu hoá' : 'Kích hoạt lại'}>
            <Popconfirm
              title={`${r.is_active ? 'Vô hiệu hoá' : 'Kích hoạt'} tài khoản ${r.username}?`}
              onConfirm={() => handleToggleActive(r)}
              okText="Xác nhận" cancelText="Huỷ"
            >
              <Button
                size="small"
                icon={r.is_active ? <StopOutlined /> : <CheckCircleOutlined />}
                danger={r.is_active}
              />
            </Popconfirm>
          </Tooltip>
          <Tooltip title="Đá văng tất cả thiết bị">
            <Popconfirm
              title={`Đăng xuất tất cả thiết bị của ${r.username}?`}
              onConfirm={() => revokeAllSessions(r.id, r.username)}
              okText="Xác nhận" cancelText="Huỷ"
            >
              <Button size="small" icon={<LogoutOutlined />} />
            </Popconfirm>
          </Tooltip>
          <Tooltip title="Xoá vĩnh viễn">
            <Popconfirm
              title={`Xoá user ${r.username}? Không thể khôi phục!`}
              onConfirm={() => handleDelete(r)}
              okText="Xoá" okType="danger" cancelText="Huỷ"
            >
              <Button size="small" icon={<DeleteOutlined />} danger />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const sessionCols = (showUser = false) => [
    ...(showUser ? [{
      title: 'User',
      dataIndex: 'username',
      width: 100,
      render: (v) => <span style={{ fontWeight: 600, fontSize: 12 }}>@{v}</span>,
    }] : []),
    {
      title: 'Thiết bị',
      dataIndex: 'device_name',
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{v || 'Unknown'}</div>
          <div style={{ fontSize: 10, color: '#9ca3af' }}>{r.ip_address}</div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'online',
      width: 90,
      render: (_, r) => r.is_online
        ? <Tag color="success" style={{ fontSize: 10 }}>Online</Tag>
        : (r.is_active
          ? <Tag color="warning" style={{ fontSize: 10 }}>Inactive</Tag>
          : <Tag color="default" style={{ fontSize: 10 }}>Đã đăng xuất</Tag>
        ),
    },
    {
      title: 'Hoạt động cuối',
      dataIndex: 'last_active_at',
      width: 130,
      render: (v) => (
        <div style={{ fontSize: 11 }}>
          <div>{timeAgo(v)}</div>
          <div style={{ color: '#9ca3af', fontSize: 10 }}>{fmtDate(v)}</div>
        </div>
      ),
    },
    {
      title: 'Đăng nhập lúc',
      dataIndex: 'created_at',
      width: 130,
      render: (v) => <span style={{ fontSize: 11, color: '#6b7280' }}>{fmtDate(v)}</span>,
    },
    {
      title: '',
      key: 'kick',
      width: 70,
      render: (_, r) => r.is_active
        ? (
          <Popconfirm
            title="Đá văng thiết bị này?"
            onConfirm={() => revokeSession(r.id, r.user_id)}
            okText="Đá văng" okType="danger" cancelText="Huỷ"
          >
            <Button size="small" danger icon={<LogoutOutlined />}>Kick</Button>
          </Popconfirm>
        )
        : <span style={{ fontSize: 10, color: '#9ca3af' }}>Đã thu hồi</span>,
    },
  ];

  return (
    <div className="att-page">
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <h2 className="emp-title">Quản lý người dùng</h2>
          <div className="emp-stats">
            <div className="emp-stat-chip">
              {users.filter(u => u.is_active).length} hoạt động
            </div>
            <div className="emp-stat-chip" style={{ background: '#f0fdf4', color: '#16a34a' }}>
              {users.filter(u => u.is_online).length} đang online
            </div>
          </div>
        </div>
        <div className="emp-titlebar-right">
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={() => { fetchUsers(); if (activeTab === 'sessions') fetchAllSessions(); }}
          >
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            size="small"
            onClick={() => setCreateOpen(true)}
          >
            Thêm user
          </Button>
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="small"
        style={{ marginBottom: 8 }}
        items={[
          {
            key: 'users',
            label: <span><TeamOutlined /> Danh sách user ({users.length})</span>,
          },
          {
            key: 'sessions',
            label: (
              <span>
                <GlobalOutlined /> Phiên đăng nhập
                {allSessions.length > 0 && (
                  <Badge
                    count={allSessions.filter(s => s.is_online).length}
                    style={{ marginLeft: 6, background: '#10b981' }}
                  />
                )}
              </span>
            ),
          },
        ]}
      />

      {activeTab === 'users' && (
        <div className="um-table-card">
          <Table
            dataSource={users}
            columns={columns}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: false }}
            rowClassName={(r) => !r.is_active ? 'um-row-disabled' : ''}
          />
        </div>
      )}

      {activeTab === 'sessions' && (
        <div className="um-table-card">
          <div className="um-sess-header">
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              {allSessions.filter(s => s.is_online).length} online •{' '}
              {allSessions.length} sessions active
            </span>
            <Button size="small" icon={<ReloadOutlined />} onClick={fetchAllSessions}>
              Làm mới
            </Button>
          </div>
          <Table
            dataSource={allSessions}
            columns={sessionCols(true)}
            rowKey="id"
            loading={allSessLoading}
            size="small"
            pagination={{ pageSize: 30, showSizeChanger: false }}
          />
        </div>
      )}

      {/* ── Modal Tạo user ── */}
      <Modal
        title={<span><UserAddOutlined /> Thêm người dùng mới</span>}
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        okText="Tạo user"
        cancelText="Huỷ"
        width={420}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} style={{ marginTop: 12 }}>
          <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Bắt buộc' }]}>
            <Input prefix="@" size="small" placeholder="username" />
          </Form.Item>
          <Form.Item name="full_name" label="Họ và tên">
            <Input size="small" placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[
            { required: true, message: 'Bắt buộc' },
            { min: 6, message: 'Tối thiểu 6 ký tự' },
          ]}>
            <Input.Password size="small" placeholder="Tối thiểu 6 ký tự" />
          </Form.Item>
          <Form.Item name="role" label="Quyền" initialValue="worker">
            <Select size="small" options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="employee_id" label="Mã nhân viên (tuỳ chọn)">
            <Input size="small" type="number" placeholder="ID nhân viên liên kết" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal Sửa user ── */}
      <Modal
        title={<span><EditOutlined /> Sửa thông tin — @{editUser?.username}</span>}
        open={!!editUser}
        onCancel={() => setEditUser(null)}
        onOk={() => editForm.submit()}
        okText="Lưu"
        cancelText="Huỷ"
        width={380}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit} style={{ marginTop: 12 }}>
          <Form.Item name="full_name" label="Họ và tên" rules={[{ required: true }]}>
            <Input size="small" />
          </Form.Item>
          <Form.Item name="role" label="Quyền">
            <Select size="small" options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item name="employee_id" label="Mã nhân viên">
            <Input size="small" type="number" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Modal Đặt lại mật khẩu ── */}
      <Modal
        title={<span><KeyOutlined /> Đặt lại mật khẩu — @{pwUser?.username}</span>}
        open={!!pwUser}
        onCancel={() => { setPwUser(null); pwForm.resetFields(); }}
        onOk={() => pwForm.submit()}
        okText="Đặt mật khẩu"
        cancelText="Huỷ"
        width={360}
      >
        <Form form={pwForm} layout="vertical" onFinish={handleSetPassword} style={{ marginTop: 12 }}>
          <Form.Item name="new_password" label="Mật khẩu mới" rules={[
            { required: true, message: 'Bắt buộc' },
            { min: 6, message: 'Tối thiểu 6 ký tự' },
          ]}>
            <Input.Password size="small" placeholder="Nhập mật khẩu mới" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Xác nhận"
            dependencies={['new_password']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value)
                    return Promise.resolve();
                  return Promise.reject(new Error('Không khớp'));
                },
              }),
            ]}
          >
            <Input.Password size="small" placeholder="Nhập lại mật khẩu" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Drawer Sessions của 1 user ── */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <WifiOutlined />
            <span>Thiết bị đăng nhập — @{sessionUser?.username}</span>
            {sessionUser?.is_online && <Badge status="success" text="Online" />}
          </div>
        }
        open={!!sessionUser}
        onClose={() => setSessionUser(null)}
        width={620}
        extra={
          sessionUser?.active_sessions > 0 && (
            <Popconfirm
              title="Đá văng TẤT CẢ thiết bị của user này?"
              onConfirm={() => revokeAllSessions(sessionUser.id, sessionUser.username)}
              okText="Đá văng hết" okType="danger" cancelText="Huỷ"
            >
              <Button danger size="small" icon={<LogoutOutlined />}>
                Kick tất cả
              </Button>
            </Popconfirm>
          )
        }
      >
        <Table
          dataSource={sessions}
          columns={sessionCols(false)}
          rowKey="id"
          loading={sessLoading}
          size="small"
          pagination={false}
        />
      </Drawer>
    </div>
  );
}
