import React from 'react';
import { Modal, Table, Row, Col, Card } from 'antd';

export default function EmployeeDetailModal({ visible, onClose, data }) {
  if (!data) return null;

  // Tinh tong hop ca cho data
  const shiftSummary = {};
  data.days.forEach(cell => {
    if (!cell.shift_code) return;
    if (!shiftSummary[cell.shift_code]) {
      shiftSummary[cell.shift_code] = {
        code: cell.shift_code,
        name: cell.shift_name,
        days: 0,
        mealCount: 0,
        totalMeal: 0,
      };
    }
    shiftSummary[cell.shift_code].days += 1;
    shiftSummary[cell.shift_code].mealCount += (cell.meal_count || 0);
    shiftSummary[cell.shift_code].totalMeal += (cell.meal_allowance || 0) + (cell.night_allowance || 0);
  });

  const shiftSummaryData = Object.values(shiftSummary);

  const formatNumber = (num) => num ? num.toLocaleString() : '0';

  const dayColumns = [
    { title: 'Ngày', dataIndex: 'work_date', key: 'work_date', width: 100 },
    { title: 'Mã ca', dataIndex: 'shift_code', key: 'shift_code', width: 80 },
    { title: 'Giờ vào', dataIndex: 'check_in', key: 'check_in', width: 120, render: (t, r) => t ? `${r.work_date} ${t}` : '-' },
    { title: 'Giờ ra', dataIndex: 'check_out', key: 'check_out', width: 120, render: (t, r) => t ? `${r.work_date} ${t}` : '-' },
    { title: 'Giờ thực', dataIndex: 'actual_hours', key: 'actual_hours', width: 80, align: 'center', render: v => v ? v.toFixed(2) : '0.00' },
    { title: 'Tăng ca', dataIndex: 'ot_hours', key: 'ot_hours', width: 80, align: 'center', render: v => v ? v.toFixed(2) : '0.00' },
    { title: 'Số giờ', dataIndex: 'standard_hours', key: 'standard_hours', width: 80, align: 'center', render: v => v ? v.toFixed(2) : '0.00' },
    { title: 'Số bữa', dataIndex: 'meal_count', key: 'meal_count', width: 80, align: 'center' },
    { title: 'Tiền ăn', dataIndex: 'meal_allowance', key: 'meal_allowance', width: 100, align: 'right', render: v => formatNumber(v) },
    { title: 'PC Đêm', dataIndex: 'night_allowance', key: 'night_allowance', width: 100, align: 'right', render: v => formatNumber(v) },
    { title: 'Ghi chú', dataIndex: 'notes', key: 'notes' },
  ];

  return (
    <Modal
      title={`Chi tiết chấm công: ${data.full_name} (${data.employee_code})`}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1200}
      centered
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small" style={{ background: '#f8f9fc', borderColor: '#e8ecf1' }}>
            <div style={{ fontSize: 12, color: '#6b7a99' }}>Số ngày làm</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{data.summary.total_present || '0.00'}</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: '#f8f9fc', borderColor: '#e8ecf1' }}>
            <div style={{ fontSize: 12, color: '#6b7a99' }}>Số ngày nghỉ có phép</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{data.summary.total_paid_leave || '0.00'}</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: '#f8f9fc', borderColor: '#e8ecf1' }}>
            <div style={{ fontSize: 12, color: '#6b7a99' }}>Số ngày nghỉ không phép</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{data.summary.total_absent || '0'}</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: '#f8f9fc', borderColor: '#e8ecf1' }}>
            <div style={{ fontSize: 12, color: '#6b7a99' }}>Số bữa</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{data.summary.total_meal_count || '0'}</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: '#f5f3ff', borderColor: '#ede9fe' }}>
            <div style={{ fontSize: 12, color: '#6d28d9' }}>Phụ cấp ca đêm</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#7c3aed' }}>{formatNumber(data.summary.total_night_allowance)}</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: '#f0fdf4', borderColor: '#dcfce7' }}>
            <div style={{ fontSize: 12, color: '#166534' }}>Tổng tiền nhận đợt</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#16a34a' }}>{formatNumber((data.summary.total_meal_allowance || 0) + (data.summary.total_night_allowance || 0))}</div>
          </Card>
        </Col>
      </Row>

      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 16 }}>Chi tiết ca làm + tiền ăn</div>
      <Table
        dataSource={shiftSummaryData}
        rowKey="code"
        pagination={false}
        size="small"
        style={{ marginBottom: 24 }}
        columns={[
          { title: 'Mã ca', dataIndex: 'code', key: 'code', width: 100 },
          { title: 'Tên ca', dataIndex: 'name', key: 'name' },
          { title: 'Số ngày', dataIndex: 'days', key: 'days', width: 100, align: 'center' },
          { title: 'Số bữa', dataIndex: 'mealCount', key: 'mealCount', width: 100, align: 'center' },
          { title: 'Tổng (Ăn + PC Đêm)', dataIndex: 'totalMeal', key: 'totalMeal', width: 160, align: 'right', render: v => formatNumber(v) },
        ]}
      />

      <Table
        dataSource={data.days}
        rowKey="day"
        pagination={false}
        size="small"
        scroll={{ y: 400 }}
        columns={dayColumns}
        rowClassName={(record) => record.status === 'absent' ? 'row-absent' : ''}
      />

      <style>{`
        .row-absent { background-color: #fef2f2; }
      `}</style>
    </Modal>
  );
}
