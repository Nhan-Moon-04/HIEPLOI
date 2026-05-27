import { useState } from 'react';
import { DatePicker, Button, Table, Tag, Progress, Empty } from 'antd';
import {
  DownloadOutlined,
  TeamOutlined,
  BankOutlined,
  SafetyCertificateOutlined,
  FileTextOutlined,
  BarChartOutlined,
  ArrowUpOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CoffeeOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

function AdminDashboard() {
  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const month = dayjs(monthKey);

  const { data: stats } = useQuery({
    queryKey: ['dashboard', monthKey],
    queryFn: () => api.get('/dashboard/stats', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  const { data: empData } = useQuery({
    queryKey: ['employees-dash'],
    queryFn: () => api.get('/employees', { params: { page: 1, page_size: 5 } }).then((r) => r.data),
  });

  const s = stats || {};

  const barOption = {
    tooltip: {},
    grid: { left: 120, right: 40, top: 16, bottom: 24 },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#9ba8bf', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f0f0f0', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: ['SX truc tiep - 622', 'Van phong - 642', 'Ban hang - 641', 'SX gian tiep - 627'],
      axisLabel: { color: '#6b7a99', fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: [
        { value: 229, itemStyle: { color: '#4361ee', borderRadius: [0, 4, 4, 0] } },
        { value: 173, itemStyle: { color: '#818cf8', borderRadius: [0, 4, 4, 0] } },
        { value: 38, itemStyle: { color: '#a5b4fc', borderRadius: [0, 4, 4, 0] } },
        { value: 23, itemStyle: { color: '#c7d2fe', borderRadius: [0, 4, 4, 0] } },
      ],
      barWidth: 20,
      label: {
        show: true, position: 'right',
        formatter: (p) => p.value + 'tr',
        color: '#6b7a99', fontSize: 11, fontWeight: 600,
      },
    }],
  };

  const colOption = {
    tooltip: {},
    grid: { left: 36, right: 12, top: 12, bottom: 32 },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 30 }, (_, i) => `${i + 1}/4`),
      axisLabel: { color: '#9ba8bf', fontSize: 9, interval: 4 },
      axisLine: { lineStyle: { color: '#e8ecf1' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { show: false },
      splitLine: { lineStyle: { color: '#f5f5f5', type: 'dashed' } },
    },
    series: [{
      type: 'bar',
      data: Array.from({ length: 30 }, () => Math.floor(Math.random() * 10 + 28)),
      itemStyle: { color: '#818cf8', borderRadius: [3, 3, 0, 0] },
      barWidth: 8,
    }],
  };

  const salaryColumns = [
    { title: 'Ho ten', dataIndex: 'full_name', render: (t) => <span style={{ fontWeight: 500, color: '#4361ee' }}>{t}</span> },
    { title: 'Bo phan', dataIndex: 'department', render: (t) => t || '-' },
    { title: 'Ngay cong', dataIndex: 'days', render: () => '26', align: 'center' },
    { title: 'Thuc linh', dataIndex: 'base_salary', render: (v) => v ? Number(v).toLocaleString('vi-VN') : '-', align: 'right' },
    { title: 'Trang thai', key: 'status', render: () => <Tag color="green">Da tra</Tag>, align: 'center' },
  ];

  const statCards = [
    {
      label: 'NHAN VIEN',
      value: s.total_employees || 0,
      sub: '+2 so thang truoc',
      icon: <TeamOutlined />,
      color: '#4361ee',
      bg: '#eef1fd',
      showArrow: true,
    },
    {
      label: 'TONG LUONG',
      value: '462,5tr',
      sub: 'VND',
      icon: <BankOutlined />,
      color: '#10b981',
      bg: '#ecfdf5',
    },
    {
      label: 'BHXH 21,5%',
      value: '40,5tr',
      sub: 'DN dong',
      icon: <SafetyCertificateOutlined />,
      color: '#f59e0b',
      bg: '#fffbeb',
    },
    {
      label: 'THUE TNCN',
      value: '6,4tr',
      sub: 'Phai nop',
      icon: <FileTextOutlined />,
      color: '#ef4444',
      bg: '#fef2f2',
    },
  ];

  return (
    <div>
      <div className="dash-hd">
        <div className="dash-hd-left">
          <div className="dash-hd-icon">
            <BarChartOutlined />
          </div>
          <div>
            <h1 className="dash-hd-title">
              Dashboard
              <span className="dash-month-badge">{month.format('MM/YYYY')}</span>
            </h1>
            <div className="dash-hd-sub">
              <CalendarOutlined style={{ marginRight: 4 }} />
              Tong quan cham cong va luong thang {month.format('M/YYYY')}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <DatePicker
            picker="month"
            value={month}
            onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
            format="[Thang] M / YYYY"
            style={{ width: 160 }}
          />
          <Button icon={<DownloadOutlined />} type="primary" ghost>Xuat Excel</Button>
        </div>
      </div>

      <div className="dash-stats-grid">
        {statCards.map((card) => (
          <div key={card.label} className="dash-stat-card">
            <div className="dsc-icon" style={{ background: card.bg, color: card.color }}>
              {card.icon}
            </div>
            <div className="dsc-content">
              <div className="dsc-label">{card.label}</div>
              <div className="dsc-value" style={{ color: card.color }}>{card.value}</div>
              <div className="dsc-sub">
                {card.showArrow && <ArrowUpOutlined style={{ fontSize: 10, marginRight: 2 }} />}
                {card.sub}
              </div>
            </div>
            <div className="dsc-accent" style={{ background: card.color }} />
          </div>
        ))}
      </div>

      <div className="charts-row">
        <div className="card">
          <div className="card-title">Hach toan theo bo phan</div>
          <ReactECharts option={barOption} style={{ height: 200 }} />
        </div>
        <div className="card">
          <div className="card-title">
            Cham cong 30 ngay
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ba8bf', fontWeight: 400 }}>
              Trung binh: {s.total_employees || 0} / {s.total_employees || 0} &nbsp; Ti le: 84,7%
            </span>
          </div>
          <ReactECharts option={colOption} style={{ height: 200 }} />
        </div>
      </div>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Bang luong gan nhat</div>
          <a style={{ color: '#4361ee', fontSize: 12 }}>Xem tat ca &rarr;</a>
        </div>
        <Table
          columns={salaryColumns}
          dataSource={(empData?.items || []).slice(0, 5)}
          rowKey="id"
          size="small"
          pagination={false}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WORKER DASHBOARD — Giao diện cá nhân cho công nhân
// ══════════════════════════════════════════════════════════════════════════════

function WorkerDashboard() {
  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const month = dayjs(monthKey);
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['my-dashboard', monthKey],
    queryFn: () => api.get('/dashboard/my-stats', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  const emp = data?.employee;
  const att = data?.attendance || {};
  const leave = data?.leave || {};
  const recentDays = data?.recent_days || [];

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Chào buổi sáng';
    if (hour < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  };

  // Stats cards cho worker
  const workerCards = [
    {
      label: 'NGÀY CÔNG',
      value: att.total_present || 0,
      sub: `/ 26 ngày`,
      icon: <CheckCircleOutlined />,
      color: '#10b981',
      bg: '#ecfdf5',
    },
    {
      label: 'GIỜ LÀM',
      value: att.total_hours || 0,
      sub: 'giờ',
      icon: <ClockCircleOutlined />,
      color: '#4361ee',
      bg: '#eef1fd',
    },
    {
      label: 'TĂNG CA',
      value: att.total_ot || 0,
      sub: 'giờ',
      icon: <RiseOutlined />,
      color: '#f59e0b',
      bg: '#fffbeb',
    },
    {
      label: 'TIỀN ĂN',
      value: att.total_meal_allowance ? Number(att.total_meal_allowance).toLocaleString('vi-VN') : '0',
      sub: 'VNĐ',
      icon: <CoffeeOutlined />,
      color: '#8b5cf6',
      bg: '#f5f3ff',
    },
  ];

  // Recent attendance columns
  const recentColumns = [
    {
      title: 'Ngày',
      dataIndex: 'date',
      render: (d) => {
        const dd = dayjs(d);
        return (
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{dd.format('DD/MM')}</div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>{dd.format('dddd')}</div>
          </div>
        );
      },
    },
    {
      title: 'Vào',
      dataIndex: 'check_in',
      align: 'center',
      render: (t) => t ? (
        <Tag color="green" style={{ margin: 0 }}>{t}</Tag>
      ) : <span style={{ color: '#d1d5db' }}>—</span>,
    },
    {
      title: 'Ra',
      dataIndex: 'check_out',
      align: 'center',
      render: (t) => t ? (
        <Tag color="blue" style={{ margin: 0 }}>{t}</Tag>
      ) : <span style={{ color: '#d1d5db' }}>—</span>,
    },
    {
      title: 'Giờ',
      dataIndex: 'hours',
      align: 'center',
      render: (v) => <span style={{ fontWeight: 600 }}>{v > 0 ? v.toFixed(1) : '—'}</span>,
    },
  ];

  return (
    <div className="worker-dash">
      {/* Header */}
      <div className="wd-header">
        <div className="wd-greeting">
          <div className="wd-greeting-icon">
            <UserOutlined />
          </div>
          <div>
            <h1 className="wd-greeting-text">
              {greeting()}, <span className="wd-name">{emp?.full_name || user?.full_name || user?.username}</span>
            </h1>
            <div className="wd-greeting-sub">
              {emp ? (
                <>
                  <span>{emp.employee_code}</span>
                  <span className="wd-dot">•</span>
                  <span>{emp.department || 'Chưa phân bộ phận'}</span>
                  {emp.position && (
                    <>
                      <span className="wd-dot">•</span>
                      <span>{emp.position}</span>
                    </>
                  )}
                </>
              ) : (
                <span>Chưa liên kết hồ sơ nhân viên</span>
              )}
            </div>
          </div>
        </div>
        <div className="wd-month-picker">
          <DatePicker
            picker="month"
            value={month}
            onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
            format="[Tháng] M / YYYY"
            style={{ width: 160 }}
          />
        </div>
      </div>

      {/* Stat cards */}
      <div className="dash-stats-grid">
        {workerCards.map((card) => (
          <div key={card.label} className="dash-stat-card">
            <div className="dsc-icon" style={{ background: card.bg, color: card.color }}>
              {card.icon}
            </div>
            <div className="dsc-content">
              <div className="dsc-label">{card.label}</div>
              <div className="dsc-value" style={{ color: card.color }}>{card.value}</div>
              <div className="dsc-sub">{card.sub}</div>
            </div>
            <div className="dsc-accent" style={{ background: card.color }} />
          </div>
        ))}
      </div>

      {/* Content row */}
      <div className="charts-row">
        {/* Phép năm */}
        <div className="card">
          <div className="card-title">
            <CalendarOutlined style={{ marginRight: 6 }} />
            Phép năm {month.format('YYYY')}
          </div>
          <div className="wd-leave-wrap">
            <div className="wd-leave-progress">
              <Progress
                type="dashboard"
                percent={leave.total ? Math.round(((leave.total - (leave.remaining || 0)) / leave.total) * 100) : 0}
                size={130}
                strokeColor="#4361ee"
                trailColor="#e8ecf1"
                format={() => (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#1a2233' }}>
                      {leave.remaining ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>ngày còn lại</div>
                  </div>
                )}
              />
            </div>
            <div className="wd-leave-details">
              <div className="wd-leave-row">
                <span className="wd-leave-label">Tổng phép:</span>
                <span className="wd-leave-val">{leave.total || 12} ngày</span>
              </div>
              <div className="wd-leave-row">
                <span className="wd-leave-label">Đã sử dụng:</span>
                <span className="wd-leave-val" style={{ color: '#ef4444' }}>{leave.used || 0} ngày</span>
              </div>
              <div className="wd-leave-row">
                <span className="wd-leave-label">Còn lại:</span>
                <span className="wd-leave-val" style={{ color: '#10b981', fontWeight: 700 }}>{leave.remaining ?? 0} ngày</span>
              </div>
            </div>
          </div>
        </div>

        {/* Thông tin cá nhân */}
        <div className="card">
          <div className="card-title">
            <UserOutlined style={{ marginRight: 6 }} />
            Thông tin cá nhân
          </div>
          {emp ? (
            <div className="wd-info-grid">
              <div className="wd-info-item">
                <span className="wd-info-label">Mã NV</span>
                <span className="wd-info-val">{emp.employee_code}</span>
              </div>
              <div className="wd-info-item">
                <span className="wd-info-label">Họ tên</span>
                <span className="wd-info-val">{emp.full_name}</span>
              </div>
              <div className="wd-info-item">
                <span className="wd-info-label">Bộ phận</span>
                <span className="wd-info-val">{emp.department || '—'}</span>
              </div>
              <div className="wd-info-item">
                <span className="wd-info-label">Chức vụ</span>
                <span className="wd-info-val">{emp.position || '—'}</span>
              </div>
              <div className="wd-info-item">
                <span className="wd-info-label">Ngày vào</span>
                <span className="wd-info-val">{emp.join_date ? dayjs(emp.join_date).format('DD/MM/YYYY') : '—'}</span>
              </div>
              <div className="wd-info-item">
                <span className="wd-info-label">Vắng mặt</span>
                <span className="wd-info-val" style={{ color: att.total_absent > 0 ? '#ef4444' : '#10b981' }}>
                  {att.total_absent || 0} ngày
                </span>
              </div>
            </div>
          ) : (
            <Empty description="Chưa liên kết hồ sơ" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </div>
      </div>

      {/* Chấm công gần đây */}
      <div className="card">
        <div className="card-title">
          <ClockCircleOutlined style={{ marginRight: 6 }} />
          Chấm công gần đây — Tháng {month.format('M/YYYY')}
        </div>
        {recentDays.length > 0 ? (
          <Table
            columns={recentColumns}
            dataSource={recentDays}
            rowKey="date"
            size="small"
            pagination={false}
          />
        ) : (
          <Empty description="Chưa có dữ liệu chấm công tháng này" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — Tự chọn layout theo role
// ══════════════════════════════════════════════════════════════════════════════

export default function Dashboard() {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';

  return isWorker ? <WorkerDashboard /> : <AdminDashboard />;
}
