import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatePicker, Select, Spin, Tag, Tooltip, Button, Space, Modal, InputNumber, Form, message } from 'antd';
import { 
  DollarCircleOutlined, 
  DownloadOutlined, 
  CalendarOutlined, 
  SettingOutlined,
  TeamOutlined,
  ArrowRightOutlined
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

const { RangePicker } = DatePicker;

export default function MealAllowance() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const [dept, setDept] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  
  const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [nightModal, setNightModal] = useState(false);
  const [nightAllowanceRate, setNightAllowanceRate] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('nightAllowanceRate');
    if (saved) setNightAllowanceRate(Number(saved));
    else setNightAllowanceRate(100000);
  }, []);

  const handleSaveNightAllowance = (val) => {
    setNightAllowanceRate(val);
    localStorage.setItem('nightAllowanceRate', val);
    setNightModal(false);
    message.success('Đã lưu mức phụ cấp ca đêm');
  };

  const { data: att, isLoading } = useQuery({
    queryKey: ['attendance', monthKey, dept, dateRange[0]?.format('YYYY-MM-DD'), dateRange[1]?.format('YYYY-MM-DD'), nightAllowanceRate],
    queryFn: () => api.get('/attendance', {
      params: { 
        month_key: monthKey, 
        department: dept || undefined,
        start_date: dateRange[0]?.format('YYYY-MM-DD'),
        end_date: dateRange[1]?.format('YYYY-MM-DD'),
        night_allowance_rate: nightAllowanceRate
      }
    }).then((r) => r.data),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/employees/departments').then((r) => r.data),
  });

  const s = att || { rows: [], days_in_month: 30 };
  
  let days = [];
  if (dateRange[0] && dateRange[1]) {
    const start = dateRange[0].date();
    const end = dateRange[1].date();
    days = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  } else {
    days = Array.from({ length: s.days_in_month }, (_, i) => i + 1);
  }

  const renderMealCell = (cell) => {
    if (cell.status === 'no_data') return <span className="cell-dot">·</span>;
    if (!cell.meal_allowance) return <span className="cell-zero">0</span>;

    const amount = cell.meal_allowance;
    const shortAmount = amount >= 1000 ? `${amount / 1000}k` : amount;

    return (
      <Tooltip title={
        <div className="meal-tooltip">
          <div className="tooltip-header">
            <span className="shift-code">{cell.shift_code}</span>
            <span className="shift-name">{cell.shift_name}</span>
          </div>
          {cell.check_in && <div className="time-row">Vào: <b>{dayjs(cell.check_in).format('HH:mm')}</b></div>}
          {cell.check_out && <div className="time-row">Ra: <b>{dayjs(cell.check_out).format('HH:mm')}</b></div>}
          <div className="amount-row meal">Tiền ăn: <b>{amount.toLocaleString()} đ</b></div>
          {cell.night_allowance > 0 && <div className="amount-row night">PC Đêm: <b>{cell.night_allowance.toLocaleString()} đ</b></div>}
        </div>
      }>
        <div className={`meal-cell-inner ${cell.night_allowance > 0 ? 'is-night' : ''}`}>
          {shortAmount}
        </div>
      </Tooltip>
    );
  };

  const totalMealAll = s.rows?.reduce((sum, r) => sum + (r.summary?.total_meal_allowance || 0), 0) || 0;
  const totalNightAll = s.rows?.reduce((sum, r) => sum + (r.summary?.total_night_allowance || 0), 0) || 0;

  return (
    <div className="meal-allowance-page">
      <div className="page-header-premium">
        <div className="title-section">
          <div className="icon-wrapper">
            <DollarCircleOutlined />
          </div>
          <div>
            <h1>Tiền ăn & Phụ cấp đêm</h1>
            <p className="sub-text">
              <CalendarOutlined /> {dateRange[0]?.format('DD/MM/YYYY')} <ArrowRightOutlined style={{ fontSize: 10, margin: '0 4px' }} /> {dateRange[1]?.format('DD/MM/YYYY')}
            </p>
          </div>
        </div>

        <div className="actions-section">
          <Space size={8}>
            <Space.Compact>
              <Button onClick={() => {
                const start = dayjs(monthKey).startOf('month');
                setDateRange([start, start.add(14, 'day')]);
              }}>Đợt 1 (1-15)</Button>
              <Button onClick={() => {
                const start = dayjs(monthKey).startOf('month').add(15, 'day');
                const end = dayjs(monthKey).endOf('month');
                setDateRange([start, end]);
              }}>Đợt 2 (16-cuối)</Button>
            </Space.Compact>

            <RangePicker 
              value={dateRange}
              onChange={(dates) => {
                if (dates) {
                  setDateRange(dates);
                  setMonthKey(dates[0].format('YYYY-MM'));
                }
              }}
              format="DD/MM/YYYY" 
              style={{ width: 240, borderRadius: 8 }} 
            />
            
            <Select 
              placeholder="Bộ phận" 
              allowClear 
              style={{ width: 160 }}
              value={dept} 
              onChange={setDept}
              options={departments.map((d) => ({ value: d, label: d }))} 
              suffixIcon={<TeamOutlined />}
            />

            {user?.role === 'admin' && (
              <Tooltip title="Cấu hình mức phụ cấp ca đêm">
                <Button icon={<SettingOutlined />} onClick={() => setNightModal(true)} />
              </Tooltip>
            )}

            <Button 
              icon={<DownloadOutlined />} 
              type="primary" 
              className="btn-premium-gradient"
              onClick={async () => {
                const hide = message.loading('Đang khởi tạo file Excel...', 0);
                try {
                  const start = dateRange[0]?.format('YYYY-MM-DD');
                  const end = dateRange[1]?.format('YYYY-MM-DD');
                  const res = await api.get('/import-export/export-meal-allowance', {
                    params: {
                      start_date: start,
                      end_date: end,
                      night_allowance: nightAllowanceRate,
                      department: dept || undefined
                    },
                    responseType: 'blob'
                  });
                  
                  const url = window.URL.createObjectURL(new Blob([res.data]));
                  const link = document.createElement('a');
                  link.href = url;
                  link.setAttribute('download', `TienAn_BoiDuong_${start}_${end}.xlsx`);
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                  message.success('Đã xuất file thành công');
                } catch (err) {
                  message.error('Lỗi khi xuất file Excel');
                } finally {
                  hide();
                }
              }}
            >
              Xuất Excel
            </Button>
          </Space>
        </div>
      </div>

      <div className="stats-grid-main">
        <div className="p-stat-card green">
          <div className="label">TỔNG TIỀN ĂN</div>
          <div className="value">{totalMealAll.toLocaleString()} <span className="unit">đ</span></div>
          <div className="progress-bar"><div className="fill" style={{ width: '70%' }} /></div>
        </div>
        <div className="p-stat-card purple">
          <div className="label">TỔNG PC ĐÊM</div>
          <div className="value">{totalNightAll.toLocaleString()} <span className="unit">đ</span></div>
          <div className="progress-bar"><div className="fill" style={{ width: '40%' }} /></div>
        </div>
        <div className="p-stat-card blue">
          <div className="label">TỔNG CỘNG</div>
          <div className="value">{(totalMealAll + totalNightAll).toLocaleString()} <span className="unit">đ</span></div>
          <div className="progress-bar"><div className="fill" style={{ width: '100%' }} /></div>
        </div>
      </div>

      <div className="main-data-card">
        {isLoading ? (
          <div className="loading-state"><Spin size="large" /></div>
        ) : (
          <div className="table-wrapper">
            <table className="premium-table">
              <thead>
                <tr>
                  <th className="sticky-col col-code">Mã</th>
                  <th className="sticky-col col-name">Họ tên</th>
                  {days.map((d) => {
                    const firstRow = s.rows?.[0];
                    const cell = firstRow?.days?.find((c) => c.day === d);
                    const dow = cell?.dow || '';
                    const isSunday = dow === 'CN';
                    const isHoliday = cell?.is_holiday;
                    return (
                      <th key={d} className={`day-head ${isSunday ? 'is-sunday' : ''} ${isHoliday ? 'is-holiday' : ''}`}>
                        <div className="day-num">{d}</div>
                        <div className="day-dow">{dow}</div>
                      </th>
                    );
                  })}
                  <th className="sum-head blue">Bữa</th>
                  <th className="sum-head purple">PC Đêm</th>
                  <th className="sum-head green">Tổng (VND)</th>
                </tr>
              </thead>
              <tbody>
                {s.rows?.map((row) => (
                  <tr key={row.employee_id}>
                    <td className="sticky-col col-code">{row.employee_code}</td>
                    <td className="sticky-col col-name">
                      <a 
                        onClick={() => {
                          const params = new URLSearchParams({
                            month_key: monthKey,
                            start_date: dateRange[0]?.format('YYYY-MM-DD'),
                            end_date: dateRange[1]?.format('YYYY-MM-DD'),
                            night_rate: nightAllowanceRate
                          });
                          navigate(`/meal-allowance/${row.employee_id}?${params.toString()}`);
                        }} 
                        className="emp-link"
                      >
                        {row.full_name}
                      </a>
                    </td>
                    {days.map((d) => {
                      const cell = row.days?.find((c) => c.day === d);
                      return (
                        <td key={d} className="day-cell">
                          {cell ? renderMealCell(cell) : '-'}
                        </td>
                      );
                    })}
                    <td className="sum-cell blue">{row.summary?.total_meal_count || 0}</td>
                    <td className="sum-cell purple">
                      {row.summary?.total_night_allowance > 0 ? row.summary.total_night_allowance.toLocaleString() : '-'}
                    </td>
                    <td className="sum-cell green highlight">
                      {(row.summary?.total_meal_allowance + (row.summary?.total_night_allowance || 0)).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="page-footer-info">
        <div className="hint-text">
          * Bảng hiển thị số tiền ăn tương ứng với từng ngày. Click tên NV để xem chi tiết.
        </div>
      </div>



      <Modal
        title="Cấu hình phụ cấp ca đêm"
        open={nightModal}
        onCancel={() => setNightModal(false)}
        footer={null}
        centered
        className="premium-modal"
      >
        <Form
          layout="vertical"
          initialValues={{ rate: nightAllowanceRate }}
          onFinish={(v) => handleSaveNightAllowance(v.rate)}
        >
          <Form.Item name="rate" label="Số tiền phụ cấp cho 1 ca đêm (VND)">
            <InputNumber 
              style={{ width: '100%', borderRadius: 8 }} 
              min={0} 
              step={1000} 
              formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" className="btn-premium-gradient">
            Lưu cấu hình
          </Button>
        </Form>
      </Modal>

      <style>{`
        :root {
          --p-blue: hsl(221, 83%, 53%);
          --p-blue-light: hsl(221, 83%, 96%);
          --p-green: hsl(142, 71%, 45%);
          --p-green-light: hsl(142, 71%, 96%);
          --p-red: hsl(0, 84%, 60%);
          --p-purple: hsl(262, 83%, 58%);
          --p-purple-light: hsl(262, 83%, 96%);
          --p-slate-50: #f8fafc;
          --p-slate-200: #e2e8f0;
          --p-slate-700: #334155;
          --p-slate-900: #0f172a;
        }

        .meal-allowance-page {
          padding-bottom: 24px;
        }

        .page-header-premium {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          background: #fff;
          padding: 20px 24px;
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
        }

        .title-section {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .title-section .icon-wrapper {
          width: 48px;
          height: 48px;
          background: var(--p-blue-light);
          color: var(--p-blue);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }

        .title-section h1 {
          font-size: 20px;
          font-weight: 800;
          margin: 0;
          color: var(--p-slate-900);
        }

        .title-section .sub-text {
          font-size: 13px;
          color: #64748b;
          margin: 2px 0 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-premium-gradient {
          background: linear-gradient(135deg, var(--p-blue) 0%, hsl(231, 83%, 53%) 100%);
          border: none;
          box-shadow: 0 4px 12px rgba(67, 97, 238, 0.3);
          height: 38px;
          border-radius: 8px;
          font-weight: 600;
        }
        .btn-premium-gradient:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(67, 97, 238, 0.4);
        }

        .stats-grid-main {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .p-stat-card {
          background: #fff;
          padding: 16px 20px;
          border-radius: 16px;
          border: 1px solid var(--p-slate-200);
          position: relative;
          overflow: hidden;
        }

        .p-stat-card .label { font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 4px; letter-spacing: 0.5px; }
        .p-stat-card .value { font-size: 26px; font-weight: 900; color: var(--p-slate-900); display: flex; align-items: baseline; gap: 4px; }
        .p-stat-card .unit { font-size: 14px; font-weight: 600; color: #94a3b8; }

        .p-stat-card.green .value { color: var(--p-green); }
        .p-stat-card.purple .value { color: var(--p-purple); }
        .p-stat-card.blue .value { color: var(--p-blue); }

        .progress-bar { height: 4px; background: var(--p-slate-100); border-radius: 2px; margin-top: 12px; }
        .progress-bar .fill { height: 100%; border-radius: 2px; }
        .p-stat-card.green .fill { background: var(--p-green); }
        .p-stat-card.purple .fill { background: var(--p-purple); }
        .p-stat-card.blue .fill { background: var(--p-blue); }

        .main-data-card {
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          overflow: hidden;
        }

        .table-wrapper {
          overflow: auto;
          max-height: calc(100vh - 350px);
        }

        .premium-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 12px;
        }

        .premium-table thead th {
          position: sticky;
          top: 0;
          z-index: 10;
          background: var(--p-slate-50);
          padding: 12px 8px;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 10px;
          color: #64748b;
          border-bottom: 2px solid var(--p-slate-200);
          text-align: center;
        }

        .premium-table .sticky-col {
          position: sticky;
          left: 0;
          z-index: 11;
          background: #fff;
        }
        .premium-table .col-code { left: 0; width: 60px; font-weight: 700; }
        .premium-table .col-name { left: 60px; width: 160px; text-align: left; border-right: 1px solid var(--p-slate-100); }

        .premium-table thead th.sticky-col { z-index: 12; background: var(--p-slate-50); }

        .premium-table tbody td {
          padding: 8px;
          border-bottom: 1px solid var(--p-slate-100);
          text-align: center;
        }

        .premium-table tbody tr:hover td {
          background: var(--p-slate-50);
        }

        .day-head { min-width: 38px; }
        .day-num { font-size: 13px; color: var(--p-slate-900); }
        .day-dow { font-size: 9px; font-weight: 500; }

        .day-head.is-sunday { background: #fff7ed !important; color: #f97316 !important; }
        .day-head.is-holiday { background: #faf5ff !important; color: #8b5cf6 !important; }

        .sum-head { width: 80px; }
        .sum-head.blue { color: var(--p-blue); background: var(--p-blue-light) !important; }
        .sum-head.purple { color: var(--p-purple); background: var(--p-purple-light) !important; }
        .sum-head.green { color: var(--p-green); background: var(--p-green-light) !important; }

        .sum-cell { font-weight: 800; font-size: 13px; }
        .sum-cell.blue { color: var(--p-blue); background: var(--p-blue-light); }
        .sum-cell.purple { color: var(--p-purple); background: var(--p-purple-light); text-align: right !important; }
        .sum-cell.green { color: var(--p-green); background: var(--p-green-light); text-align: right !important; }
        .sum-cell.highlight { font-size: 14px; }

        .emp-link {
          color: var(--p-slate-900);
          font-weight: 600;
          transition: color 0.2s;
        }
        .emp-link:hover { color: var(--p-blue); text-decoration: underline; }

        .meal-cell-inner {
          font-weight: 800;
          font-size: 11px;
          color: var(--p-green);
          background: var(--p-green-light);
          padding: 2px 0;
          border-radius: 6px;
          min-width: 32px;
          margin: 0 auto;
        }
        .meal-cell-inner.is-night {
          color: var(--p-purple);
          background: var(--p-purple-light);
          box-shadow: inset 0 0 0 1px rgba(124, 58, 237, 0.1);
        }

        .cell-dot { color: #e2e8f0; }
        .cell-zero { color: #cbd5e1; font-size: 10px; }

        .meal-tooltip { padding: 4px; }
        .tooltip-header { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; margin-bottom: 6px; display: flex; gap: 8px; }
        .shift-code { font-weight: 900; color: #fff; }
        .shift-name { font-size: 11px; opacity: 0.8; }
        .time-row { font-size: 11px; margin-bottom: 2px; }
        .amount-row { margin-top: 4px; font-size: 12px; }
        .amount-row.meal { color: #4ade80; }
        .amount-row.night { color: #c084fc; }

        .page-footer-info { margin-top: 16px; display: flex; justify-content: flex-end; }
        .hint-text { font-size: 11px; color: #94a3b8; font-style: italic; }

        .loading-state { padding: 100px; text-align: center; }

        /* Premium Modal Overrides */
        .premium-modal .ant-modal-content { border-radius: 16px; overflow: hidden; }
        .premium-modal .ant-modal-header { border-bottom: none; padding: 20px 24px 0; }
        .premium-modal .ant-modal-body { padding: 24px; }
      `}</style>
    </div>
  );
}
