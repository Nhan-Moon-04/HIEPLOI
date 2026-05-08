import { useState } from 'react';
import { Table, DatePicker, Button, Modal, Tag, Space, Typography, Card, Statistic, Row, Col } from 'antd';
import { CalendarOutlined, EyeOutlined, HistoryOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';

const { Title, Text } = Typography;

export default function LeaveBalance() {
  const [year, setYear] = useState(dayjs().year());
  const [detailModal, setDetailModal] = useState(null);

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ['leave-summary', year],
    queryFn: () => api.get('/leave/summary', { params: { year } }).then(r => r.data),
  });

  const { data: details = [], isLoading: isLoadingDetails } = useQuery({
    queryKey: ['leave-details', detailModal?.id, year],
    queryFn: () => api.get(`/leave/details/${detailModal.id}`, { params: { year } }).then(r => r.data),
    enabled: !!detailModal,
  });

  const columns = [
    { title: 'Mã NV', dataIndex: 'employee_code', width: 100, fixed: 'left' },
    { title: 'Họ Tên', dataIndex: 'full_name', width: 200, fixed: 'left', render: t => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: 'Bộ phận', dataIndex: 'department', width: 150 },
    { title: 'Tiêu chuẩn', dataIndex: 'entitlement', width: 120, align: 'center', render: v => <Tag color="blue">{v} ngày</Tag> },
    { title: 'Đã nghỉ', dataIndex: 'used', width: 120, align: 'center', render: v => <Tag color="orange">{v} ngày</Tag> },
    { 
      title: 'Còn lại', 
      dataIndex: 'remaining', 
      width: 120, 
      align: 'center', 
      render: v => <Tag color={v > 0 ? 'green' : 'red'} style={{ fontWeight: 600 }}>{v} ngày</Tag> 
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

  const totalUsed = summary.reduce((acc, curr) => acc + curr.used, 0);
  const totalRemaining = summary.reduce((acc, curr) => acc + curr.remaining, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><CalendarOutlined style={{ marginRight: 6 }} />Quản lý Phép năm</h1>
          <div className="sub">Theo dõi và đối soát ngày nghỉ phép của nhân viên</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Text strong>Năm đối soát:</Text>
          <DatePicker 
            picker="year" 
            value={dayjs().year(year)}
            onChange={(d) => d && setYear(d.year())}
            allowClear={false}
            style={{ width: 120 }}
          />
        </div>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card bordered={false} className="card">
            <Statistic
              title="Tổng nhân viên"
              value={summary.length}
              prefix={<HistoryOutlined />}
              valueStyle={{ color: '#1e293b' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false} className="card">
            <Statistic
              title="Tổng ngày đã nghỉ (toàn công ty)"
              value={totalUsed}
              suffix="ngày"
              valueStyle={{ color: '#f59e0b' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false} className="card">
            <Statistic
              title="Tổng ngày còn lại"
              value={totalRemaining}
              suffix="ngày"
              valueStyle={{ color: '#10b981' }}
            />
          </Card>
        </Col>
      </Row>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Table 
          columns={columns} 
          dataSource={summary} 
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
        width={600}
      >
        <Table
          dataSource={details}
          rowKey="work_date"
          loading={isLoadingDetails}
          columns={[
            { title: 'Ngày nghỉ', dataIndex: 'work_date', render: d => dayjs(d).format('DD/MM/YYYY') },
            { 
              title: 'Loại phép', 
              dataIndex: 'shift_code', 
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
      </Modal>
    </div>
  );
}
