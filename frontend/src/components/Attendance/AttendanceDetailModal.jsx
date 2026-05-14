import React from 'react';
import { Modal, Table, Row, Col, Typography } from 'antd';
import { 
  CalendarOutlined, 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  ClockCircleOutlined, 
  RiseOutlined, 
  WarningOutlined,
  UserOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

export default function AttendanceDetailModal({ visible, onClose, data }) {
  if (!data) return null;

  // Tinh tong hop ca cho data
  const shiftSummary = {};
  data.days.forEach(cell => {
    if (cell.status === 'no_data') return;
    const key = cell.shift_code || (cell.status === 'absent' ? 'N' : '?');
    if (!shiftSummary[key]) {
      shiftSummary[key] = {
        code: key,
        name: cell.shift_name || (cell.status === 'absent' ? 'Nghi không phép' : ''),
        days: 0,
        hours: 0,
        ot: 0
      };
    }
    shiftSummary[key].days += 1;
    shiftSummary[key].hours += (cell.actual_hours || 0);
    shiftSummary[key].ot += (cell.ot_hours || 0);
  });

  const shiftSummaryData = Object.values(shiftSummary);

  const dayColumns = [
    { 
      title: 'Ngày', 
      dataIndex: 'work_date', 
      key: 'work_date', 
      width: 90,
      render: (text, record) => (
        <div className="date-cell">
          <span className="date-num">{dayjs(text).format('DD/MM')}</span>
          <span className={`date-dow ${record.dow === 'CN' ? 'is-sunday' : ''}`}>
            {record.dow}
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
        <div className={`shift-tag ${record.status === 'absent' ? 'absent' : 'present'}`}>
          {code || (record.status === 'absent' ? 'N' : '-')}
        </div>
      )
    },
    { 
      title: 'Vào - Ra', 
      key: 'times', 
      width: 120,
      render: (_, r) => {
        if (r.status === 'absent') return <span className="status-absent">Vắng mặt</span>;
        const inTime = r.check_in ? dayjs(r.check_in).format('HH:mm') : '--:--';
        const outTime = r.check_out ? dayjs(r.check_out).format('HH:mm') : '--:--';
        return (
          <div className="time-range">
            <span className="time">{inTime}</span>
            <span className="arrow">→</span>
            <span className="time">{outTime}</span>
          </div>
        );
      }
    },
    { 
      title: 'Giờ làm', 
      dataIndex: 'actual_hours', 
      key: 'actual_hours', 
      width: 70, 
      align: 'center', 
      render: v => v > 0 ? <span className="hours-val">{v.toFixed(1)}</span> : <span className="empty-val">-</span>
    },
    { 
      title: 'Tăng ca', 
      dataIndex: 'ot_hours', 
      key: 'ot_hours', 
      width: 70, 
      align: 'center', 
      render: v => v > 0 ? <span className="ot-val">{v.toFixed(1)}</span> : <span className="empty-val">-</span>
    },
    { 
      title: 'Trạng thái', 
      dataIndex: 'notes', 
      key: 'notes',
      width: 250,
      render: (text, record) => {
        let statusClass = 'status-default';
        if (record.status === 'absent') statusClass = 'status-danger';
        if (record.status === 'forgot_scan') statusClass = 'status-warning';
        if (record.status === 'early_leave') statusClass = 'status-warning';
        return <span className={`note-text ${statusClass}`}>{text || '-'}</span>;
      }
    },
  ];

  return (
    <Modal
      title={
        <div className="modal-header-custom">
          <div className="user-info">
            <div className="avatar-mini">
              <UserOutlined />
            </div>
            <div>
              <Title level={4} style={{ margin: 0, color: 'var(--p-slate-900)', fontSize: 18 }}>
                Chi tiết chấm công: {data.full_name}
              </Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Mã nhân viên: <span style={{ color: 'var(--p-blue)', fontWeight: 600 }}>{data.employee_code}</span>
              </Text>
            </div>
          </div>
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1200}
      centered
      className="premium-modal"
      bodyStyle={{ padding: '20px 24px 24px' }}
    >
      <div className="stats-grid">
        <div className="stat-p-card">
          <div className="icon-box"><CalendarOutlined /></div>
          <div className="content">
            <div className="label">NGÀY CÔNG</div>
            <div className="value">{data.summary.total_present || 0}</div>
          </div>
        </div>
        <div className="stat-p-card blue">
          <div className="icon-box"><RiseOutlined /></div>
          <div className="content">
            <div className="label">GIỜ THỰC LÀM</div>
            <div className="value">{data.summary.total_hours?.toFixed(1) || 0}</div>
          </div>
        </div>
        <div className="stat-p-card orange">
          <div className="icon-box"><ClockCircleOutlined /></div>
          <div className="content">
            <div className="label">GIỜ TĂNG CA</div>
            <div className="value">{data.summary.total_ot?.toFixed(1) || 0}</div>
          </div>
        </div>
        <div className="stat-p-card red">
          <div className="icon-box"><CloseCircleOutlined /></div>
          <div className="content">
            <div className="label">VẮNG MẶT</div>
            <div className="value">{data.summary.total_absent || 0}</div>
          </div>
        </div>
        <div className="stat-p-card warning">
          <div className="icon-box"><WarningOutlined /></div>
          <div className="content">
            <div className="label">VỀ SỚM/QUÊN</div>
            <div className="value">{(data.summary.total_early_leave || 0) + (data.summary.total_forgot_scan || 0)}</div>
          </div>
        </div>
        <div className="stat-p-card green highlight">
          <div className="icon-box"><CheckCircleOutlined /></div>
          <div className="content">
            <div className="label">TỶ LỆ CHUYÊN CẦN</div>
            <div className="value">
                {data.summary.total_present > 0 
                    ? Math.round((data.summary.total_present / (data.summary.total_present + data.summary.total_absent)) * 100)
                    : 0}%
            </div>
          </div>
        </div>
      </div>

      <Row gutter={24} style={{ marginTop: 24 }}>
        <Col span={6}>
          <div className="section-title">
            <div className="dot blue" />
            TỔNG HỢP THEO CA
          </div>
          <Table
            dataSource={shiftSummaryData}
            rowKey="code"
            pagination={false}
            size="small"
            className="p-table-compact"
            columns={[
              { 
                title: 'Ca', 
                dataIndex: 'code', 
                key: 'code', 
                width: 60,
                render: v => <span style={{ fontWeight: 700, color: 'var(--p-slate-700)' }}>{v}</span>
              },
              { 
                title: 'Công', 
                dataIndex: 'days', 
                key: 'days', 
                width: 60, 
                align: 'center',
                render: v => <span style={{ fontWeight: 600 }}>{v}</span>
              },
              { 
                title: 'Giờ làm', 
                dataIndex: 'hours', 
                key: 'hours', 
                align: 'right', 
                render: v => <span style={{ fontWeight: 700, color: 'var(--p-blue)' }}>{v.toFixed(1)}h</span> 
              },
            ]}
          />
        </Col>
        <Col span={18}>
          <div className="section-title">
            <div className="dot green" />
            CHI TIẾT CHẤM CÔNG HẰNG NGÀY
          </div>
          <Table
            dataSource={data.days}
            rowKey="work_date"
            pagination={false}
            size="small"
            scroll={{ x: 'max-content', y: 500 }}
            columns={dayColumns}
            className="p-table-main"
            rowClassName={(record) => {
              if (record.status === 'absent') return 'row-p-absent';
              if (record.dow === 'CN') return 'row-p-sunday';
              return '';
            }}
          />
        </Col>
      </Row>

      <style>{`
        :root {
          --p-blue: hsl(221, 83%, 53%);
          --p-blue-light: hsl(221, 83%, 96%);
          --p-green: hsl(142, 71%, 45%);
          --p-green-light: hsl(142, 71%, 96%);
          --p-red: hsl(0, 84%, 60%);
          --p-red-light: hsl(0, 84%, 96%);
          --p-orange: hsl(38, 92%, 50%);
          --p-orange-light: hsl(38, 92%, 96%);
          --p-slate-50: #f8fafc;
          --p-slate-100: #f1f5f9;
          --p-slate-200: #e2e8f0;
          --p-slate-700: #334155;
          --p-slate-900: #0f172a;
        }

        .premium-modal .ant-modal-content {
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
        }

        .modal-header-custom {
          padding-bottom: 12px;
          margin-bottom: -10px;
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .avatar-mini {
          width: 44px;
          height: 44px;
          background: var(--p-blue-light);
          color: var(--p-blue);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          border: 1px solid var(--p-blue);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 12px;
        }

        .stat-p-card {
          background: #fff;
          border: 1px solid var(--p-slate-200);
          border-radius: 12px;
          padding: 12px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          transition: all 0.3s ease;
        }

        .stat-p-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
          border-color: var(--p-blue);
        }

        .stat-p-card .icon-box {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: var(--p-slate-100);
          color: var(--p-slate-700);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }

        .stat-p-card.blue .icon-box { background: var(--p-blue-light); color: var(--p-blue); }
        .stat-p-card.red .icon-box { background: var(--p-red-light); color: var(--p-red); }
        .stat-p-card.orange .icon-box { background: var(--p-orange-light); color: var(--p-orange); }
        .stat-p-card.warning .icon-box { background: #fffbeb; color: #d97706; }
        .stat-p-card.green .icon-box { background: var(--p-green-light); color: var(--p-green); }

        .stat-p-card.highlight {
          background: var(--p-blue);
          border-color: var(--p-blue);
        }
        .stat-p-card.highlight .icon-box { background: rgba(255,255,255,0.2); color: #fff; }
        .stat-p-card.highlight .label { color: rgba(255,255,255,0.8); }
        .stat-p-card.highlight .value { color: #fff; }

        .stat-p-card .label { font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 2px; }
        .stat-p-card .value { font-size: 18px; font-weight: 800; color: var(--p-slate-900); line-height: 1; }

        .section-title {
          font-size: 12px;
          font-weight: 800;
          color: var(--p-slate-700);
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          letter-spacing: 0.5px;
        }

        .section-title .dot { width: 8px; height: 8px; border-radius: 50%; }
        .section-title .dot.blue { background: var(--p-blue); box-shadow: 0 0 0 3px var(--p-blue-light); }
        .section-title .dot.green { background: var(--p-green); box-shadow: 0 0 0 3px var(--p-green-light); }

        /* Tables Customization */
        .ant-table-wrapper {
          background: #fff;
          border-radius: 12px;
        }

        .p-table-compact .ant-table-thead > tr > th,
        .p-table-main .ant-table-thead > tr > th {
          background: var(--p-slate-50) !important;
          color: #64748b !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          text-transform: uppercase;
          border-bottom: 2px solid var(--p-slate-200) !important;
          padding: 8px 8px !important;
        }

        .ant-table-tbody > tr > td {
          padding: 6px 8px !important;
          border-bottom: 1px solid var(--p-slate-100) !important;
          font-size: 12px !important;
        }

        .ant-table-tbody > tr:hover > td {
          background: var(--p-slate-50) !important;
        }

        .row-p-absent { background: var(--p-red-light) !important; }
        .row-p-sunday { background: var(--p-orange-light) !important; }

        /* Cell Styling */
        .date-cell { display: flex; flex-direction: column; }
        .date-num { font-weight: 700; color: var(--p-slate-900); font-size: 13px; }
        .date-dow { font-size: 11px; color: #94a3b8; font-weight: 600; }
        .date-dow.is-sunday { color: var(--p-red); }

        .shift-tag {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 800;
        }
        .shift-tag.present { background: var(--p-blue-light); color: var(--p-blue); }
        .shift-tag.absent { background: var(--p-red-light); color: var(--p-red); }

        .time-range { display: flex; align-items: center; gap: 4px; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
        .time-range .time { font-weight: 600; color: var(--p-slate-700); }
        .time-range .arrow { color: #cbd5e1; }

        .hours-val { font-weight: 700; color: var(--p-slate-900); font-size: 12px; }
        .ot-val { font-weight: 700; color: var(--p-orange); font-size: 12px; }
        
        .empty-val { color: #e2e8f0; }
        .status-absent { font-style: italic; color: #94a3b8; font-size: 11px; }
        
        .note-text { font-size: 11px; font-weight: 500; display: block; max-width: 100%; word-break: break-word; line-height: 1.3; }
        .status-danger { color: var(--p-red); }
        .status-warning { color: var(--p-orange); }
        .status-default { color: #64748b; }

        /* Scrollbar */
        .ant-table-body::-webkit-scrollbar { width: 6px; }
        .ant-table-body::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px; }
      `}</style>
    </Modal>
  );
}
