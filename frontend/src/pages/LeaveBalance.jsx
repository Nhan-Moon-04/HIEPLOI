import { useState } from 'react';
import { Table, DatePicker, Button, Modal, Tag, Space, Typography, Card, Statistic, Row, Col, Tabs, Input, Select } from 'antd';
import { CalendarOutlined, EyeOutlined, HistoryOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

const { Title, Text } = Typography;

export default function LeaveBalance() {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const [year, setYear] = useState(dayjs().year());
  const [detailModal, setDetailModal] = useState(null);
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState(null);

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ['leave-summary', year],
    queryFn: () => api.get('/leave/summary', { params: { year } }).then(r => r.data),
  });

  const { data: departmentsList = [] } = useQuery({
    queryKey: ['departments_list'],
    queryFn: () => api.get('/departments').then(r => r.data),
  });
  const departments = departmentsList.map(d => d.name);

  const { data: details = [], isLoading: isLoadingDetails } = useQuery({
    queryKey: ['leave-details', detailModal?.id, year],
    queryFn: () => api.get(`/leave/details/${detailModal.id}`, { params: { year } }).then(r => r.data),
    enabled: !!detailModal,
  });

  const paidLeaves = details.filter(item => item.shift_code !== 'N');
  const unpaidLeaves = details.filter(item => item.shift_code === 'N');

  const deptOrderMap = {};
  departmentsList.forEach((d, idx) => {
    deptOrderMap[d.name] = idx;
  });

  const filteredSummary = summary
    .filter(item => {
      if (search) {
        const s = search.toLowerCase().trim();
        const codeMatch = item.employee_code?.toLowerCase().includes(s);
        const nameMatch = item.full_name?.toLowerCase().includes(s);
        if (!codeMatch && !nameMatch) return false;
      }
      if (dept && item.department !== dept) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const orderA = deptOrderMap[a.department] !== undefined ? deptOrderMap[a.department] : 9999;
      const orderB = deptOrderMap[b.department] !== undefined ? deptOrderMap[b.department] : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.employee_code || '').localeCompare(b.employee_code || '', undefined, { numeric: true });
    });

  const columns = [
    { 
      title: 'Mã NV', 
      dataIndex: 'employee_code', 
      width: 100, 
      fixed: 'left',
      sorter: (a, b) => Number(a.employee_code || 0) - Number(b.employee_code || 0)
    },
    { 
      title: 'Họ Tên', 
      dataIndex: 'full_name', 
      width: 200, 
      fixed: 'left', 
      render: t => <span style={{ fontWeight: 500 }}>{t}</span>,
      sorter: (a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'vi')
    },
    { 
      title: 'Bộ phận', 
      dataIndex: 'department', 
      width: 150,
      sorter: (a, b) => {
        const orderA = deptOrderMap[a.department] !== undefined ? deptOrderMap[a.department] : 9999;
        const orderB = deptOrderMap[b.department] !== undefined ? deptOrderMap[b.department] : 9999;
        return orderA - orderB;
      }
    },
    { 
      title: 'Tiêu chuẩn', 
      dataIndex: 'entitlement', 
      width: 120, 
      align: 'center', 
      render: v => <Tag color="blue">{v} ngày</Tag>,
      sorter: (a, b) => (a.entitlement || 0) - (b.entitlement || 0)
    },
    { 
      title: 'Đã nghỉ', 
      dataIndex: 'used', 
      width: 120, 
      align: 'center', 
      render: v => <Tag color="orange">{v} ngày</Tag>,
      sorter: (a, b) => (a.used || 0) - (b.used || 0)
    },
    { 
      title: 'Còn lại', 
      dataIndex: 'remaining', 
      width: 120, 
      align: 'center', 
      render: v => <Tag color={v > 0 ? 'green' : 'red'} style={{ fontWeight: 600 }}>{v} ngày</Tag>,
      sorter: (a, b) => (a.remaining || 0) - (b.remaining || 0)
    },
    {
      title: 'Hành động',
      width: 100,
      fixed: 'right',
      align: 'center',
      render: (_, r) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>
          Chi tiết
        </Button>
      )
    }
  ];

  const totalUsed = filteredSummary.reduce((acc, curr) => acc + curr.used, 0);
  const totalRemaining = filteredSummary.reduce((acc, curr) => acc + curr.remaining, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><CalendarOutlined style={{ marginRight: 6 }} />Quản lý Phép năm</h1>
          <div className="sub">Theo dõi và đối soát ngày nghỉ phép của nhân viên</div>
        </div>
      </div>

      <div className="emp-filterbar" style={{ marginBottom: 16 }}>
        <DatePicker 
          picker="year" 
          value={dayjs().year(year)}
          onChange={(d) => d && setYear(d.year())}
          allowClear={false}
          style={{ width: 120 }}
          format="Năm YYYY"
          size="middle"
        />
        {!isWorker && (
          <>
            <Select
              placeholder="Bộ phận"
              allowClear
              style={{ width: 160 }}
              value={dept}
              onChange={setDept}
              options={departments.map((d) => ({ value: d, label: d }))}
              suffixIcon={<TeamOutlined style={{ color: '#9ca3af' }} />}
              size="middle"
            />
            <Input
              placeholder="Tìm mã NV, họ tên..."
              prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
              style={{ width: 220 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              size="middle"
            />
          </>
        )}
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card variant="borderless" className="card">
            <Statistic
              title={isWorker ? "Tiêu chuẩn phép" : "Tổng nhân viên"}
              value={isWorker ? (filteredSummary[0]?.entitlement || 0) : filteredSummary.length}
              prefix={<HistoryOutlined />}
              suffix={isWorker ? "ngày" : ""}
              styles={{ content: { color: '#1e293b' } }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card variant="borderless" className="card">
            <Statistic
              title={isWorker ? "Đã nghỉ phép" : "Tổng ngày đã nghỉ (toàn công ty)"}
              value={isWorker ? (filteredSummary[0]?.used || 0) : totalUsed}
              suffix="ngày"
              styles={{ content: { color: '#f59e0b' } }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card variant="borderless" className="card">
            <Statistic
              title={isWorker ? "Phép còn lại" : "Tổng ngày còn lại"}
              value={isWorker ? (filteredSummary[0]?.remaining || 0) : totalRemaining}
              suffix="ngày"
              styles={{ content: { color: '#10b981' } }}
            />
          </Card>
        </Col>
      </Row>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Table 
          columns={columns} 
          dataSource={filteredSummary} 
          rowKey="id" 
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 50 }}
          scroll={{ x: 900 }}
        />
      </div>

      <Modal
        title={`Chi tiết nghỉ phép - ${detailModal?.full_name} (${year})`}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={[
          <Button key="close" onClick={() => setDetailModal(null)}>Đóng</Button>
        ]}
        width={750}
      >
        <Tabs
          defaultActiveKey="paid"
          items={[
            {
              key: 'paid',
              label: 'Ngày xin nghỉ phép',
              children: (
                <Table
                  dataSource={paidLeaves}
                  rowKey="work_date"
                  loading={isLoadingDetails}
                  columns={[
                    { title: 'Ngày nghỉ', dataIndex: 'work_date', render: d => dayjs(d).format('DD/MM/YYYY'), width: 150 },
                    { 
                      title: 'Loại phép', 
                      dataIndex: 'shift_code', 
                      width: 150,
                      render: c => {
                        if (c === 'P') return <Tag color="blue">Cả ngày (1.0)</Tag>;
                        if (c === 'S') return <Tag color="cyan">Sáng (0.5)</Tag>;
                        if (c === 'C') return <Tag color="geekblue">Chiều (0.5)</Tag>;
                        return <Tag>{c}</Tag>;
                      } 
                    },
                    { title: 'Ghi chú', dataIndex: 'notes', render: n => n || '-' }
                  ]}
                  pagination={{ pageSize: 10 }}
                  size="small"
                />
              )
            },
            {
              key: 'unpaid',
              label: 'Nghỉ không phép',
              children: (
                <Table
                  dataSource={unpaidLeaves}
                  rowKey="work_date"
                  loading={isLoadingDetails}
                  columns={[
                    { title: 'Ngày nghỉ', dataIndex: 'work_date', render: d => dayjs(d).format('DD/MM/YYYY'), width: 150 },
                    { 
                      title: 'Loại', 
                      dataIndex: 'shift_code', 
                      width: 150,
                      render: () => <Tag color="red">Nghỉ không phép</Tag>
                    },
                    { title: 'Ghi chú', dataIndex: 'notes', render: n => n || '-' }
                  ]}
                  pagination={{ pageSize: 10 }}
                  size="small"
                />
              )
            }
          ]}
        />
      </Modal>
    </div>
  );
}
