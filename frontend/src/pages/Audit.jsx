import { useState } from 'react';
import { Table, Input, Tag, Card, Space, Button, Modal, Descriptions, Badge } from 'antd';
import { AuditOutlined, SearchOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';

export default function Audit() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [detailModal, setDetailModal] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit', page, search],
    queryFn: () => api.get('/audit', {
      params: { page, page_size: 20, search: search || undefined }
    }).then((r) => r.data),
  });

  const columns = [
    {
      title: 'Thời gian',
      dataIndex: 'changed_at',
      width: 160,
      render: (d) => dayjs(d).format('DD/MM/YYYY HH:mm:ss'),
    },
    {
      title: 'Người thực hiện',
      dataIndex: 'changed_by',
      width: 140,
      render: (u) => <Tag color="blue">{u}</Tag>,
    },
    {
      title: 'Hành động',
      dataIndex: 'action',
      width: 100,
      render: (a) => {
        let color = 'default';
        if (a === 'CREATE') color = 'green';
        if (a === 'UPDATE') color = 'orange';
        if (a === 'DELETE') color = 'red';
        if (a === 'IMPORT') color = 'purple';
        return <Tag color={color}>{a}</Tag>;
      },
    },
    {
      title: 'Đối tượng',
      dataIndex: 'table_name',
      width: 120,
      render: (t) => <Badge status="processing" text={t} />,
    },
    {
      title: 'ID bản ghi',
      dataIndex: 'record_id',
      width: 100,
    },
    {
      title: 'Ghi chú',
      dataIndex: 'notes',
      render: (n) => n || '-',
    },
    {
      title: 'Chi tiết',
      width: 80,
      fixed: 'right',
      render: (_, r) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>
          Xem
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><AuditOutlined style={{ marginRight: 6 }} />Nhật ký hệ thống</h1>
          <div className="sub">Theo dõi mọi thay đổi dữ liệu trên hệ thống</div>
        </div>
        <Space>
          <Input 
            placeholder="Tìm người dùng, ghi chú..." 
            prefix={<SearchOutlined />} 
            style={{ width: 250 }}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
        </Space>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Table
          columns={columns}
          dataSource={data?.items || []}
          rowKey="id"
          loading={isLoading}
          size="small"
          scroll={{ x: 1000 }}
          pagination={{
            current: page,
            pageSize: 20,
            total: data?.total || 0,
            onChange: setPage,
            showTotal: (t) => `Tổng số ${t} nhật ký`,
          }}
        />
      </div>

      <Modal
        title="Chi tiết thay đổi"
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={null}
        width={800}
      >
        {detailModal && (
          <div style={{ maxHeight: 600, overflow: 'auto' }}>
            <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Thời gian">{dayjs(detailModal.changed_at).format('DD/MM/YYYY HH:mm:ss')}</Descriptions.Item>
              <Descriptions.Item label="Người dùng">{detailModal.changed_by}</Descriptions.Item>
              <Descriptions.Item label="Hành động">{detailModal.action}</Descriptions.Item>
              <Descriptions.Item label="Bảng dữ liệu">{detailModal.table_name}</Descriptions.Item>
              <Descriptions.Item label="ID bản ghi">{detailModal.record_id}</Descriptions.Item>
            </Descriptions>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#f5222d' }}>Dữ liệu trước (Before)</div>
                <pre style={{ background: '#fff1f0', padding: 8, borderRadius: 4, fontSize: 11 }}>
                  {JSON.stringify(detailModal.before_data, null, 2) || 'N/A'}
                </pre>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#52c41a' }}>Dữ liệu sau (After)</div>
                <pre style={{ background: '#f6ffed', padding: 8, borderRadius: 4, fontSize: 11 }}>
                  {JSON.stringify(detailModal.after_data, null, 2) || 'N/A'}
                </pre>
              </div>
            </div>
            
            {detailModal.notes && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Ghi chú thêm</div>
                <div style={{ padding: 8, background: '#f9f9f9', borderRadius: 4 }}>{detailModal.notes}</div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
