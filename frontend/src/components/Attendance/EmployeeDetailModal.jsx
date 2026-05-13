import React from 'react';
import { Modal, Table, Row, Col, Tag, Typography, Divider } from 'antd';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

export default function EmployeeDetailModal({ visible, onClose, data }) {
  if (!data) return null;

  // Tinh tong hop ca cho data
  const shiftSummary = {};
  data.days.forEach(cell => {
    if (cell.status === 'no_data') return;
    const key = cell.shift_code || (cell.status === 'absent' ? 'N' : '?');
    if (!shiftSummary[key]) {
      shiftSummary[key] = {
        code: key,
        name: cell.shift_name || (cell.status === 'absent' ? 'Nghi khong phep' : ''),
        days: 0,
        mealCount: 0,
        totalMeal: 0,
      };
    }
    shiftSummary[key].days += 1;
    shiftSummary[key].mealCount += (cell.meal_count || 0);
    shiftSummary[key].totalMeal += (cell.meal_allowance || 0) + (cell.night_allowance || 0);
  });

  const shiftSummaryData = Object.values(shiftSummary);

  const formatNumber = (num) => num ? num.toLocaleString() : '0';

  const dayColumns = [
    { 
      title: 'Ngày', 
      dataIndex: 'work_date', 
      key: 'work_date', 
      width: 90,
      render: (text, record) => (
        <div style={{ fontWeight: 500 }}>
          {dayjs(text).format('DD/MM')} 
          <span style={{ fontSize: 10, color: record.dow === 'CN' ? '#ef4444' : '#6b7280', marginLeft: 4 }}>
            ({record.dow})
          </span>
        </div>
      )
    },
    { 
      title: 'Ca', 
      dataIndex: 'shift_code', 
      key: 'shift_code', 
      width: 60,
      render: (code, record) => (
        <Tag color={record.status === 'absent' ? 'red' : 'blue'} style={{ margin: 0, fontSize: 10, padding: '0 4px' }}>
          {code || (record.status === 'absent' ? 'N' : '-')}
        </Tag>
      )
    },
    { 
      title: 'Vào - Ra', 
      key: 'times', 
      width: 110,
      render: (_, r) => {
        if (r.status === 'absent') return <Text type="secondary" italic style={{ fontSize: 11 }}>Vắng</Text>;
        const inTime = r.check_in ? dayjs(r.check_in).format('HH:mm') : '-';
        const outTime = r.check_out ? dayjs(r.check_out).format('HH:mm') : '-';
        return <div style={{ fontSize: 11 }}>{inTime} <span style={{ color: '#d1d5db' }}>→</span> {outTime}</div>;
      }
    },
    { 
      title: 'Giờ', 
      dataIndex: 'actual_hours', 
      key: 'actual_hours', 
      width: 50, 
      align: 'center', 
      render: v => v > 0 ? <Text strong style={{ fontSize: 11 }}>{v.toFixed(1)}</Text> : '-' 
    },
    { 
      title: 'TC', 
      dataIndex: 'ot_hours', 
      key: 'ot_hours', 
      width: 50, 
      align: 'center', 
      render: v => v > 0 ? <Text style={{ color: '#f59e0b', fontSize: 11 }} strong>{v.toFixed(1)}</Text> : '-' 
    },
    { 
      title: 'Bữa', 
      dataIndex: 'meal_count', 
      key: 'meal_count', 
      width: 45, 
      align: 'center',
      render: v => v !== null && v !== undefined ? <Text style={{ fontSize: 11 }}>{v}</Text> : '-'
    },
    { 
      title: 'Tiền ăn', 
      dataIndex: 'meal_allowance', 
      key: 'meal_allowance', 
      width: 80, 
      align: 'right', 
      render: v => v > 0 ? <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 11 }}>{formatNumber(v)}</span> : '-' 
    },
    { 
      title: 'PC Đêm', 
      dataIndex: 'night_allowance', 
      key: 'night_allowance', 
      width: 80, 
      align: 'right', 
      render: v => v > 0 ? <span style={{ color: '#7c3aed', fontWeight: 600, fontSize: 11 }}>{formatNumber(v)}</span> : '-' 
    },
    { 
      title: 'Ghi chú', 
      dataIndex: 'notes', 
      key: 'notes',
      render: (text, record) => {
        let color = '#64748b';
        if (record.status === 'absent') color = '#ef4444';
        if (record.status === 'forgot_scan') color = '#f97316';
        if (record.status === 'early_leave') color = '#f59e0b';
        return <span style={{ fontSize: 10, color }}>{text}</span>;
      }
    },
  ];

  return (
    <Modal
      title={
        <div style={{ paddingBottom: 8, borderBottom: '1px solid #f0f0f0', marginBottom: -20 }}>
          <Title level={4} style={{ margin: 0 }}>
            {data.full_name} <Text type="secondary" style={{ fontSize: 15, fontWeight: 400 }}>({data.employee_code})</Text>
          </Title>
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1050}
      centered
      bodyStyle={{ padding: '24px 20px 16px' }}
    >
      <Row gutter={[8, 8]} style={{ marginBottom: 20 }}>
        <Col span={4}>
          <div className="stat-mini">
            <div className="label">NGÀY LÀM</div>
            <div className="value">{data.summary.total_present || 0}</div>
          </div>
        </Col>
        <Col span={4}>
          <div className="stat-mini blue">
            <div className="label">NGHỈ PHÉP</div>
            <div className="value">{data.summary.total_paid_leave || 0}</div>
          </div>
        </Col>
        <Col span={4}>
          <div className="stat-mini red">
            <div className="label">VẮNG/KO PHÉP</div>
            <div className="value">{data.summary.total_absent || 0}</div>
          </div>
        </Col>
        <Col span={4}>
          <div className="stat-mini">
            <div className="label">SỐ BỮA</div>
            <div className="value">{data.summary.total_meal_count || 0}</div>
          </div>
        </Col>
        <Col span={4}>
          <div className="stat-mini purple">
            <div className="label">PC CA ĐÊM</div>
            <div className="value" style={{ fontSize: 18 }}>{formatNumber(data.summary.total_night_allowance)}</div>
          </div>
        </Col>
        <Col span={4}>
          <div className="stat-mini green">
            <div className="label">TỔNG NHẬN</div>
            <div className="value" style={{ fontSize: 18 }}>{formatNumber((data.summary.total_meal_allowance || 0) + (data.summary.total_night_allowance || 0))}</div>
          </div>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={7}>
          <Divider orientation="left" plain style={{ margin: '0 0 8px' }}><Text strong style={{ fontSize: 12 }}>TỔNG HỢP THEO CA</Text></Divider>
          <Table
            dataSource={shiftSummaryData}
            rowKey="code"
            pagination={false}
            size="small"
            bordered
            columns={[
              { title: 'Mã', dataIndex: 'code', key: 'code', width: 50 },
              { title: 'Công', dataIndex: 'days', key: 'days', width: 50, align: 'center' },
              { title: 'Tiền (Ăn + Đêm)', dataIndex: 'totalMeal', key: 'totalMeal', align: 'right', render: v => <Text strong style={{ fontSize: 12 }}>{formatNumber(v)}</Text> },
            ]}
          />
        </Col>
        <Col span={17}>
          <Divider orientation="left" plain style={{ margin: '0 0 8px' }}><Text strong style={{ fontSize: 12 }}>CHI TIẾT TỪNG NGÀY</Text></Divider>
          <Table
            dataSource={data.days}
            rowKey="work_date"
            pagination={false}
            size="small"
            scroll={{ y: 380 }}
            columns={dayColumns}
            rowClassName={(record) => {
              if (record.status === 'absent') return 'row-absent';
              if (record.dow === 'CN') return 'row-sunday';
              return '';
            }}
          />
        </Col>
      </Row>

      <style>{`
        .stat-mini {
          background: #f8f9fc;
          border: 1px solid #eef0f5;
          padding: 6px 8px;
          border-radius: 6px;
          text-align: center;
        }
        .stat-mini .label { font-size: 9px; color: #6b7a99; margin-bottom: 2px; font-weight: 700; text-transform: uppercase; }
        .stat-mini .value { font-size: 20px; font-weight: 800; color: #1e293b; line-height: 1.1; }
        
        .stat-mini.green { background: #f0fdf4; border-color: #dcfce7; }
        .stat-mini.green .label { color: #166534; }
        .stat-mini.green .value { color: #16a34a; }
        
        .stat-mini.purple { background: #f5f3ff; border-color: #ede9fe; }
        .stat-mini.purple .label { color: #6d28d9; }
        .stat-mini.purple .value { color: #7c3aed; }

        .stat-mini.red { background: #fff1f2; border-color: #ffe4e6; }
        .stat-mini.red .label { color: #991b1b; }
        .stat-mini.red .value { color: #ef4444; }

        .stat-mini.blue { background: #eff6ff; border-color: #dbeafe; }
        .stat-mini.blue .label { color: #1e40af; }
        .stat-mini.blue .value { color: #3b82f6; }
        
        .row-absent { background-color: #fff1f2 !important; }
        .row-sunday { background-color: #fff7ed !important; }
        
        .ant-table-thead > tr > th {
          background: #f8f9fc !important;
          font-size: 10px !important;
          padding: 8px 4px !important;
          color: #64748b !important;
          text-transform: uppercase;
        }
        .ant-table-tbody > tr > td {
          padding: 6px 4px !important;
        }
        
        /* Hide scrollbar for Chrome, Safari and Opera */
        .ant-table-body::-webkit-scrollbar {
          width: 6px;
        }
        .ant-table-body::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 3px;
        }
      `}</style>
    </Modal>
  );
}
