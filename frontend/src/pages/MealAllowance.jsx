import { useState, useEffect } from 'react';
import { DatePicker, Select, Spin, Tag, Tooltip, Button, Space, Modal, InputNumber, Form, message } from 'antd';
import { DollarOutlined, DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import EmployeeDetailModal from '../components/Attendance/EmployeeDetailModal';
import useAuthStore from '../stores/authStore';

const { RangePicker } = DatePicker;

export default function MealAllowance() {
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
    if (cell.status === 'no_data') return <span style={{ color: '#e5e7eb' }}>·</span>;
    if (!cell.meal_allowance) return <span style={{ color: '#d1d5db' }}>0</span>;

    // rut gon, vi du: 35000 -> 35k
    const amount = cell.meal_allowance;
    const shortAmount = amount >= 1000 ? `${amount / 1000}k` : amount;

    return (
      <Tooltip title={
        <div style={{ fontSize: 11 }}>
          <div><b>{cell.shift_code}</b> {cell.shift_name}</div>
          {cell.check_in && <div>Vao: {cell.check_in}</div>}
          {cell.check_out && <div>Ra: {cell.check_out}</div>}
          <div style={{ color: '#10b981', fontWeight: 600, marginTop: 4 }}>Tien an: {amount.toLocaleString()} d</div>
          {cell.night_allowance > 0 && <div style={{ color: '#8b5cf6', fontWeight: 600 }}>PC Dem: {cell.night_allowance.toLocaleString()} d</div>}
        </div>
      }>
        <div style={{
          color: cell.night_allowance > 0 ? '#6d28d9' : '#166534',
          background: cell.night_allowance > 0 ? '#f5f3ff' : '#f0fdf4',
          borderRadius: 4,
          padding: '1px 0',
          fontSize: 10,
          fontWeight: 600,
          textAlign: 'center',
          minWidth: 26,
          lineHeight: '20px',
        }}>
          {shortAmount}
        </div>
      </Tooltip>
    );
  };

  // Summary totals
  const totalMealAll = s.rows?.reduce((sum, r) => sum + (r.summary?.total_meal_allowance || 0), 0) || 0;
  const totalNightAll = s.rows?.reduce((sum, r) => sum + (r.summary?.total_night_allowance || 0), 0) || 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><DollarOutlined style={{ marginRight: 6 }} />Tiền ăn & Phụ cấp đêm</h1>
          <div className="sub">
            {dateRange[0]?.format('DD/MM/YYYY')} - {dateRange[1]?.format('DD/MM/YYYY')}
            <span style={{ marginLeft: 16 }}>Tổng tiền ăn: <b style={{ color: '#10b981', fontSize: 14 }}>{totalMealAll.toLocaleString()} đ</b></span>
            <span style={{ marginLeft: 16 }}>Tổng PC đêm: <b style={{ color: '#8b5cf6', fontSize: 14 }}>{totalNightAll.toLocaleString()} đ</b></span>
            <span style={{ marginLeft: 16 }}>Tổng cộng: <b style={{ color: '#4361ee', fontSize: 16 }}>{(totalMealAll + totalNightAll).toLocaleString()} đ</b></span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button onClick={() => {
            const start = dayjs(monthKey).startOf('month');
            setDateRange([start, start.add(14, 'day')]);
          }}>Đợt 1 (1-15)</Button>
          <Button onClick={() => {
            const start = dayjs(monthKey).startOf('month').add(15, 'day');
            const end = dayjs(monthKey).endOf('month');
            setDateRange([start, end]);
          }}>Đợt 2 (16-cuối)</Button>

          <RangePicker 
            value={dateRange}
            onChange={(dates) => {
              if (dates) {
                setDateRange(dates);
                setMonthKey(dates[0].format('YYYY-MM'));
              }
            }}
            format="DD/MM/YYYY" 
            style={{ width: 240 }} 
          />
          <Select placeholder="Bo phan" allowClear style={{ width: 140 }}
            value={dept} onChange={setDept}
            options={departments.map((d) => ({ value: d, label: d }))} />
          {user?.role === 'admin' && (
            <Button onClick={() => setNightModal(true)}>Cấu hình PC Đêm</Button>
          )}
          <Button 
            icon={<DownloadOutlined />} 
            type="primary" 
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
        </div>
      </div>

      {/* Grid */}
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f8f9fc' }}>
                <th style={{ ...thStyle, width: 40, position: 'sticky', left: 0, zIndex: 3, background: '#f8f9fc' }}>Ma</th>
                <th style={{ ...thStyle, width: 120, position: 'sticky', left: 40, zIndex: 3, background: '#f8f9fc', textAlign: 'left' }}>Ho ten</th>
                {days.map((d) => {
                  const firstRow = s.rows?.[0];
                  const cell = firstRow?.days?.find((c) => c.day === d);
                  const dow = cell?.dow || '';
                  const isSunday = dow === 'CN';
                  const isHoliday = cell?.is_holiday;
                  return (
                    <th key={d} style={{
                      ...thStyle, minWidth: 30,
                      background: isHoliday ? '#faf5ff' : isSunday ? '#fff7ed' : '#f8f9fc',
                      color: isHoliday ? '#8b5cf6' : isSunday ? '#f59e0b' : '#6b7a99',
                    }}>
                      <div>{d}</div>
                      <div style={{ fontSize: 9, fontWeight: 400 }}>{dow}</div>
                    </th>
                  );
                })}
                <th style={{ ...thStyle, width: 60, background: '#f0f9ff', color: '#0369a1' }}>Số bữa</th>
                <th style={{ ...thStyle, width: 80, background: '#f5f3ff', color: '#7c3aed' }}>PC Đêm</th>
                <th style={{ ...thStyle, width: 90, background: '#f0fdf4', color: '#16a34a' }}>Tổng (VND)</th>
              </tr>
            </thead>
            <tbody>
              {s.rows?.map((row) => (
                <tr key={row.employee_id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ ...tdStyle, position: 'sticky', left: 0, background: '#fff', zIndex: 1, fontWeight: 500 }}>
                    {row.employee_code}
                  </td>
                  <td style={{ ...tdStyle, position: 'sticky', left: 40, background: '#fff', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                    <a onClick={() => setSelectedRow(row)} style={{ color: '#4361ee', fontWeight: 500, cursor: 'pointer' }}>
                      <Tooltip title={row.full_name}>{row.full_name}</Tooltip>
                    </a>
                  </td>
                  {days.map((d) => {
                    const cell = row.days?.find((c) => c.day === d);
                    return (
                      <td key={d} style={{ ...tdStyle, padding: '2px 1px' }}>
                        {cell ? renderMealCell(cell) : '-'}
                      </td>
                    );
                  })}
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#0369a1', background: '#f0f9ff' }}>
                    {row.summary?.total_meal_count || 0}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#6d28d9', background: '#faf5ff' }}>
                    {row.summary?.total_night_allowance > 0 ? row.summary.total_night_allowance.toLocaleString() : '-'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#166534', background: '#f8fff8' }}>
                    {(row.summary?.total_meal_allowance + (row.summary?.total_night_allowance || 0)).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11, color: '#6b7a99' }}>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#9ba8bf' }}>
          * Bang hien thi so tien an tuong ung voi tung ngay. Click ten NV de xem chi tiet. (1k = 1,000 d)
        </span>
      </div>

      <EmployeeDetailModal
        visible={!!selectedRow}
        onClose={() => setSelectedRow(null)}
        data={selectedRow}
      />

      <Modal
        title="Cấu hình phụ cấp ca đêm"
        open={nightModal}
        onCancel={() => setNightModal(false)}
        footer={null}
      >
        <Form
          layout="vertical"
          initialValues={{ rate: nightAllowanceRate }}
          onFinish={(v) => handleSaveNightAllowance(v.rate)}
        >
          <Form.Item name="rate" label="Số tiền phụ cấp cho 1 ca đêm (VND)">
            <InputNumber style={{ width: '100%' }} min={0} step={1000} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Lưu cấu hình</Button>
        </Form>
      </Modal>
    </div>
  );
}

const thStyle = {
  padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600,
  borderBottom: '2px solid #e8ecf1', color: '#6b7a99', whiteSpace: 'nowrap',
};
const tdStyle = {
  padding: '4px 6px', borderBottom: '1px solid #f5f5f5', fontSize: 12,
};
