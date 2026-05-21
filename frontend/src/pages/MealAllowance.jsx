import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatePicker, Select, Spin, Tooltip, Button, Space, Modal, Input, InputNumber, Form, message, Popconfirm, Table as AntTable, Tag } from 'antd';
import {
  DollarCircleOutlined,
  DownloadOutlined,
  CalendarOutlined,
  SettingOutlined,
  TeamOutlined,
  SearchOutlined,
  MoonOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

const { RangePicker } = DatePicker;

let mealAllowanceFilters = null;

const getInitialFilters = () => {
  const defaultStart = dayjs().startOf('month');
  const defaultEnd = dayjs().endOf('month');

  if (!mealAllowanceFilters) {
    return {
      monthKey: dayjs().format('YYYY-MM'),
      dateRange: [defaultStart, defaultEnd],
    };
  }

  const start = mealAllowanceFilters.start_date ? dayjs(mealAllowanceFilters.start_date) : defaultStart;
  const end = mealAllowanceFilters.end_date ? dayjs(mealAllowanceFilters.end_date) : defaultEnd;

  return {
    monthKey: mealAllowanceFilters.month_key || start.format('YYYY-MM'),
    dateRange: [start, end],
  };
};

export default function MealAllowance() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const initialFilters = useMemo(() => getInitialFilters(), []);
  const [monthKey, setMonthKey] = useState(initialFilters.monthKey);
  const [dept, setDept] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState(initialFilters.dateRange);
  const [nightModal, setNightModal] = useState(false);
  const [nightAllowanceRate, setNightAllowanceRate] = useState(0);
  const [nightOtTarget, setNightOtTarget] = useState(null); // { cell, employeeId }
  const [nightOtSaving, setNightOtSaving] = useState(false);
  const [quickModal, setQuickModal] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [quickSaving, setQuickSaving] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('nightAllowanceRate');
    setNightAllowanceRate(saved ? Number(saved) : 100000);
  }, []);

  useEffect(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) return;
    mealAllowanceFilters = {
      month_key: monthKey,
      start_date: dateRange[0].format('YYYY-MM-DD'),
      end_date: dateRange[1].format('YYYY-MM-DD'),
    };
  }, [monthKey, dateRange]);

  const handleSaveNightAllowance = (val) => {
    setNightAllowanceRate(val);
    localStorage.setItem('nightAllowanceRate', val);
    setNightModal(false);
    message.success('Đã lưu mức phụ cấp ca đêm');
  };

  const handleNightOtSave = async (withNightPccd) => {
    if (!nightOtTarget) return;
    const { cell, employeeId } = nightOtTarget;
    setNightOtSaving(true);
    try {
      const payload = { employee_id: employeeId, work_date: cell.work_date, meal_count: 1 };
      if (withNightPccd) payload.ot_end_time = '23:30';
      await api.put('/schedules/x-overtime', payload);
      message.success(withNightPccd ? 'Đã thêm bữa ăn và PC ca đêm' : 'Đã thêm bữa ăn');
      setNightOtTarget(null);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch {
      message.error('Lỗi khi lưu');
    } finally {
      setNightOtSaving(false);
    }
  };

  const handleQuickOtSave = async () => {
    if (selectedRowKeys.length === 0) return;
    setQuickSaving(true);
    try {
      const selected = eligibleList.filter((r) => selectedRowKeys.includes(r.key));
      await Promise.all(
        selected.map((r) =>
          api.put('/schedules/x-overtime', {
            employee_id: r.employee_id,
            work_date: r.cell.work_date,
            meal_count: 1,
            ...(r.is_night ? { ot_end_time: '23:30' } : {}),
          })
        )
      );
      message.success(`Đã cập nhật ${selected.length} ngày tăng ca`);
      setQuickModal(false);
      setSelectedRowKeys([]);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch {
      message.error('Lỗi khi lưu hàng loạt');
    } finally {
      setQuickSaving(false);
    }
  };

  const { data: att, isLoading } = useQuery({
    queryKey: ['attendance', monthKey, dept, dateRange[0]?.format('YYYY-MM-DD'), dateRange[1]?.format('YYYY-MM-DD'), nightAllowanceRate],
    queryFn: () => api.get('/attendance', {
      params: {
        month_key: monthKey,
        department: dept || undefined,
        start_date: dateRange[0]?.format('YYYY-MM-DD'),
        end_date: dateRange[1]?.format('YYYY-MM-DD'),
        night_allowance_rate: nightAllowanceRate,
      }
    }).then((r) => r.data),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/employees/departments').then((r) => r.data),
  });

  const s = att || { rows: [], days_in_month: 30 };

  const eligibleList = useMemo(() => {
    const result = [];
    for (const row of (att?.rows || [])) {
      for (const cell of (row.days || [])) {
        if (cell.ot_eligible || cell.night_eligible) {
          result.push({
            key: `${row.employee_id}_${cell.work_date}`,
            employee_id: row.employee_id,
            employee_code: row.employee_code,
            full_name: row.full_name,
            cell,
            is_night: !!cell.night_eligible,
          });
        }
      }
    }
    return result.sort((a, b) => a.cell.work_date.localeCompare(b.cell.work_date));
  }, [att]);

  const quickOtColumns = [
    {
      title: 'Họ tên',
      dataIndex: 'full_name',
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.employee_code}</div>
        </div>
      ),
    },
    {
      title: 'Ngày',
      key: 'date',
      width: 75,
      render: (_, r) => dayjs(r.cell.work_date).format('DD/MM'),
    },
    {
      title: 'Giờ ra',
      key: 'checkout',
      width: 72,
      render: (_, r) => r.cell.check_out
        ? <b style={{ color: r.is_night ? '#1d4ed8' : '#d97706' }}>{dayjs(r.cell.check_out).format('HH:mm')}</b>
        : '–',
    },
    {
      title: 'Loại OT',
      key: 'type',
      width: 115,
      render: (_, r) => r.is_night
        ? <Tag color="blue" style={{ fontSize: 11 }}>OT sau 23h</Tag>
        : <Tag color="orange" style={{ fontSize: 11 }}>OT sau 18h</Tag>,
    },
    {
      title: 'Sẽ thêm',
      key: 'action',
      render: (_, r) => r.is_night
        ? <span style={{ fontSize: 11, color: '#1d4ed8' }}>1 bữa + PC đêm</span>
        : <span style={{ fontSize: 11, color: '#d97706' }}>1 bữa ăn</span>,
    },
  ];

  let days = [];
  if (dateRange[0] && dateRange[1]) {
    const start = dateRange[0].date();
    const end = dateRange[1].date();
    days = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  } else {
    days = Array.from({ length: s.days_in_month }, (_, i) => i + 1);
  }

  const renderMealCell = (cell, employeeId) => {
    if (cell.status === 'no_data') return <span className="ma-cell-dot">·</span>;

    if (cell.night_eligible) {
      const amount = cell.meal_allowance || 0;
      const shortAmount = amount >= 1000 ? `${amount / 1000}k` : String(amount || '0');
      return (
        <Tooltip title={`Ra ${cell.check_out ? dayjs(cell.check_out).format('HH:mm') : ''} — quá 23h, click để xử lý`}>
          <div
            className="ma-cell-val ma-cell-val--night-eligible"
            onClick={() => setNightOtTarget({ cell, employeeId })}
          >
            {shortAmount}
          </div>
        </Tooltip>
      );
    }

    if (cell.ot_eligible) {
      const amount = cell.meal_allowance || 0;
      const shortAmount = amount >= 1000 ? `${amount / 1000}k` : String(amount || '0');
      return (
        <Popconfirm
          title="Thêm bữa tăng ca?"
          description={`Ngày ${dayjs(cell.work_date).format('DD/MM')} — OT sau 18h hoặc ≥ 3h`}
          onConfirm={async () => {
            try {
              await api.put('/schedules/x-overtime', {
                employee_id: employeeId,
                work_date: cell.work_date,
                meal_count: 1,
              });
              message.success('Đã thêm bữa tăng ca');
              queryClient.invalidateQueries({ queryKey: ['attendance'] });
            } catch {
              message.error('Lỗi khi thêm bữa tăng ca');
            }
          }}
          okText="Thêm bữa"
          cancelText="Bỏ qua"
        >
          <div className="ma-cell-val ma-cell-val--ot-eligible">
            {shortAmount}
          </div>
        </Popconfirm>
      );
    }

    if (!cell.meal_allowance) return <span className="ma-cell-zero">0</span>;

    const amount = cell.meal_allowance;
    const shortAmount = amount >= 1000 ? `${amount / 1000}k` : amount;

    const extraClass = cell.night_allowance > 0
      ? 'ma-cell-val--night'
      : (cell.meal_count >= 2 ? 'ma-cell-val--double' : '');

    return (
      <Tooltip title={
        <div className="ma-tooltip">
          <div className="ma-tooltip-hd">
            <span className="ma-tooltip-code">{cell.shift_code}</span>
            <span className="ma-tooltip-name">{cell.shift_name}</span>
          </div>
          {cell.check_in && <div className="ma-tooltip-row">Vào: <b>{dayjs(cell.check_in).format('HH:mm')}</b></div>}
          {cell.check_out && <div className="ma-tooltip-row">Ra: <b>{dayjs(cell.check_out).format('HH:mm')}</b></div>}
          <div className="ma-tooltip-amount meal">Tiền ăn: <b>{amount.toLocaleString()} đ</b></div>
          {cell.meal_count >= 2 && <div className="ma-tooltip-row" style={{ color: '#2563eb' }}>Bữa ăn: <b>{cell.meal_count} bữa</b></div>}
          {cell.night_allowance > 0 && <div className="ma-tooltip-amount night">PC Đêm: <b>{cell.night_allowance.toLocaleString()} đ</b></div>}
        </div>
      }>
        <div className={`ma-cell-val ${extraClass}`}>
          {shortAmount}
        </div>
      </Tooltip>
    );
  };

  const totalMeal  = s.rows?.reduce((sum, r) => sum + (r.summary?.total_meal_allowance || 0), 0) || 0;
  const totalNight = s.rows?.reduce((sum, r) => sum + (r.summary?.total_night_allowance || 0), 0) || 0;

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredRows = (s.rows || []).filter((row) => {
    if (!normalizedSearch) return true;
    const code = String(row.employee_code || '').toLowerCase();
    const name = String(row.full_name || '').toLowerCase();
    if (code.includes(normalizedSearch) || name.includes(normalizedSearch)) return true;
    const numericNeedle = normalizedSearch.replace(/[^0-9]/g, '');
    if (!numericNeedle) return false;
    const mealStr = String(Math.round(row.summary?.total_meal_allowance || 0));
    const totalStr = String(Math.round((row.summary?.total_meal_allowance || 0) + (row.summary?.total_night_allowance || 0)));
    return mealStr.includes(numericNeedle) || totalStr.includes(numericNeedle);
  });

  const handleExport = async () => {
    const hide = message.loading('Đang xuất file Excel...', 0);
    try {
      const res = await api.get('/import-export/export-meal-allowance', {
        params: {
          start_date: dateRange[0]?.format('YYYY-MM-DD'),
          end_date: dateRange[1]?.format('YYYY-MM-DD'),
          night_allowance: nightAllowanceRate,
          department: dept || undefined,
        },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', `TienAn_${dateRange[0]?.format('YYYY-MM-DD')}_${dateRange[1]?.format('YYYY-MM-DD')}.xlsx`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      message.success('Xuất file thành công');
    } catch {
      message.error('Lỗi khi xuất file Excel');
    } finally {
      hide();
    }
  };

  return (
    <div className="ma-page">
      {/* Title bar */}
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <h2 className="emp-title">Tiền ăn &amp; Phụ cấp đêm</h2>
          <div className="emp-stats">
            <div className="emp-stat-chip">
              <CalendarOutlined style={{ fontSize: 10 }} />
              {dateRange[0]?.format('DD/MM')} – {dateRange[1]?.format('DD/MM/YYYY')}
            </div>
            <div className="emp-stat-chip">
              <span className="emp-stat-dot emp-stat-dot--green" />
              Tiền ăn <strong>{(totalMeal / 1000).toLocaleString('vi-VN')}k</strong>
            </div>
            {totalNight > 0 && (
              <div className="emp-stat-chip">
                <span className="emp-stat-dot emp-stat-dot--blue" />
                PC Đêm <strong>{(totalNight / 1000).toLocaleString('vi-VN')}k</strong>
              </div>
            )}
            <div className="emp-stat-chip" style={{ fontWeight: 700, color: '#276EF1' }}>
              Tổng <strong>{((totalMeal + totalNight) / 1000).toLocaleString('vi-VN')}k đ</strong>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {user?.role === 'admin' && (
              <Tooltip title="Cấu hình phụ cấp ca đêm">
                <Button icon={<SettingOutlined />} onClick={() => setNightModal(true)} />
              </Tooltip>
            )}
            <Button icon={<DownloadOutlined />} type="primary"
              style={{ background: '#276EF1', borderColor: '#276EF1', borderRadius: 7 }}
              onClick={handleExport}>
              Xuất Excel
            </Button>
          </div>
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={() => { setSelectedRowKeys(eligibleList.map((r) => r.key)); setQuickModal(true); }}
            style={{ background: eligibleList.length > 0 ? '#fff7ed' : '#f9fafb', color: eligibleList.length > 0 ? '#d97706' : '#9ca3af', border: `1px solid ${eligibleList.length > 0 ? '#fbbf24' : '#e5e7eb'}`, borderRadius: 6, fontSize: 12 }}
          >
            Thêm nhanh OT{eligibleList.length > 0 ? ` (${eligibleList.length} ngày)` : ''}
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="emp-filterbar" style={{ flexWrap: 'wrap' }}>
        <Space.Compact>
          <Button size="middle" onClick={() => {
            const start = dayjs(monthKey).startOf('month');
            const end = start.add(14, 'day');
            setDateRange([start, end]);
          }}>Đợt 1 (1-15)</Button>
          <Button size="middle" onClick={() => {
            const start = dayjs(monthKey).startOf('month').add(15, 'day');
            const end = dayjs(monthKey).endOf('month');
            setDateRange([start, end]);
          }}>Đợt 2 (16-cuối)</Button>
        </Space.Compact>

        <RangePicker
          value={dateRange}
          onChange={(dates) => {
            if (dates) { setDateRange(dates); setMonthKey(dates[0].format('YYYY-MM')); }
          }}
          format="DD/MM/YYYY"
          style={{ width: 230 }}
          size="middle"
        />

        <Select
          placeholder="Bộ phận"
          allowClear
          style={{ width: 150 }}
          value={dept}
          onChange={setDept}
          options={departments.map((d) => ({ value: d, label: d }))}
          suffixIcon={<TeamOutlined style={{ color: '#9ca3af' }} />}
          size="middle"
        />

        <Input
          placeholder="Tìm mã NV, họ tên..."
          allowClear
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
          style={{ width: 210 }}
          size="middle"
        />
      </div>

      {/* Summary cards */}
      <div className="ma-summary">
        <div className="ma-sum-card ma-sum-card--green">
          <DollarCircleOutlined className="ma-sum-icon" />
          <div>
            <div className="ma-sum-label">TỔNG TIỀN ĂN</div>
            <div className="ma-sum-value">{totalMeal.toLocaleString()} <span>đ</span></div>
          </div>
          <div className="ma-sum-bar"><div style={{ width: '70%' }} /></div>
        </div>
        <div className="ma-sum-card ma-sum-card--purple">
          <MoonOutlined className="ma-sum-icon" />
          <div>
            <div className="ma-sum-label">TỔNG PC ĐÊM</div>
            <div className="ma-sum-value">{totalNight.toLocaleString()} <span>đ</span></div>
          </div>
          <div className="ma-sum-bar"><div style={{ width: '40%' }} /></div>
        </div>
        <div className="ma-sum-card ma-sum-card--blue">
          <DownloadOutlined className="ma-sum-icon" style={{ visibility: 'hidden' }} />
          <div>
            <div className="ma-sum-label">TỔNG CỘNG</div>
            <div className="ma-sum-value">{(totalMeal + totalNight).toLocaleString()} <span>đ</span></div>
          </div>
          <div className="ma-sum-bar"><div style={{ width: '100%' }} /></div>
        </div>
      </div>

      {/* Table */}
      <div className="ma-table-card">
        {isLoading ? (
          <div className="ma-loading"><Spin size="large" /></div>
        ) : (
          <div className="ma-scroll">
            <table className="ma-table">
              <thead>
                <tr>
                  <th className="ma-th ma-th--s0">Mã</th>
                  <th className="ma-th ma-th--s1">Họ tên</th>
                  {days.map((d) => {
                    const cell = s.rows?.[0]?.days?.find((c) => c.day === d);
                    const dow = cell?.dow || '';
                    const isSun = dow === 'CN';
                    const isHol = cell?.is_holiday;
                    return (
                      <th key={d} className={`ma-th ma-th--day ${isSun ? 'ma-th--sun' : ''} ${isHol ? 'ma-th--hol' : ''}`}>
                        <div className="ma-th-num">{d}</div>
                        <div className="ma-th-dow">{dow}</div>
                      </th>
                    );
                  })}
                  <th className="ma-th ma-th--sum ma-th--blue">Bữa</th>
                  <th className="ma-th ma-th--sum ma-th--purple">PC Đêm</th>
                  <th className="ma-th ma-th--sum ma-th--green">Tổng (đ)</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => (
                  <tr key={row.employee_id} className={idx % 2 === 1 ? 'ma-row--alt' : ''}>
                    <td className="ma-td ma-td--s0 ma-td--code">{row.employee_code}</td>
                    <td className="ma-td ma-td--s1 ma-td--name">
                      <div className="ma-name-cell" onClick={() => {
                        const params = new URLSearchParams({
                          month_key: monthKey,
                          start_date: dateRange[0]?.format('YYYY-MM-DD'),
                          end_date: dateRange[1]?.format('YYYY-MM-DD'),
                          night_rate: nightAllowanceRate,
                        });
                        navigate(`/meal-allowance/${row.employee_id}?${params.toString()}`);
                      }}>
                        <div className="ma-avatar">{(row.full_name || '?')[0].toUpperCase()}</div>
                        <span className="ma-name-text">{row.full_name}</span>
                      </div>
                    </td>
                    {days.map((d) => {
                      const cell = row.days?.find((c) => c.day === d);
                      return (
                        <td key={d} className="ma-td ma-td--cell">
                          {cell ? renderMealCell(cell, row.employee_id) : <span className="ma-cell-dot">·</span>}
                        </td>
                      );
                    })}
                    <td className="ma-td ma-td--sum ma-td--blue">{row.summary?.total_meal_count || 0}</td>
                    <td className="ma-td ma-td--sum ma-td--purple">
                      {row.summary?.total_night_allowance > 0
                        ? row.summary.total_night_allowance.toLocaleString()
                        : <span className="ma-cell-dot">–</span>}
                    </td>
                    <td className="ma-td ma-td--sum ma-td--green ma-td--total">
                      {((row.summary?.total_meal_allowance || 0) + (row.summary?.total_night_allowance || 0)).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={3 + days.length} className="ma-empty">Không có dữ liệu</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ma-footer-hint">
        * Bảng hiển thị tiền ăn theo từng ngày. Click tên nhân viên để xem chi tiết.
      </div>

      {/* Quick OT bulk modal */}
      <Modal
        title={<><ThunderboltOutlined style={{ color: '#d97706', marginRight: 8 }} />Thêm nhanh tăng ca ({eligibleList.length} ngày)</>}
        open={quickModal}
        onCancel={() => setQuickModal(false)}
        width={660}
        centered
        footer={[
          <Button key="cancel" onClick={() => setQuickModal(false)}>Hủy</Button>,
          <Button key="submit" type="primary" loading={quickSaving}
            disabled={selectedRowKeys.length === 0}
            style={{ background: '#276EF1', borderColor: '#276EF1' }}
            onClick={handleQuickOtSave}>
            Áp dụng cho {selectedRowKeys.length} ngày đã chọn
          </Button>,
        ]}
      >
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
          <Tag color="orange">OT sau 18h</Tag> → thêm 1 bữa ăn &nbsp;|&nbsp;
          <Tag color="blue">OT sau 23h</Tag> → thêm 1 bữa + PC ca đêm ({nightAllowanceRate.toLocaleString()}đ)
        </div>
        {eligibleList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 13 }}>
            Không có ngày OT nào cần xử lý trong khoảng thời gian này.<br />
            <span style={{ fontSize: 11 }}>Ô cam / xanh trên bảng mới xuất hiện ở đây.</span>
          </div>
        ) : (
          <AntTable
            dataSource={eligibleList}
            columns={quickOtColumns}
            rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
            size="small"
            pagination={false}
            scroll={{ y: 380 }}
          />
        )}
      </Modal>

      {/* Night OT action modal */}
      <Modal
        title={<><MoonOutlined style={{ color: '#1d4ed8', marginRight: 8 }} />Xử lý tăng ca qua 23h</>}
        open={!!nightOtTarget}
        onCancel={() => setNightOtTarget(null)}
        footer={[
          <Button key="cancel" onClick={() => setNightOtTarget(null)}>Hủy</Button>,
          <Button key="meal" loading={nightOtSaving} onClick={() => handleNightOtSave(false)}>
            Chỉ thêm bữa ăn
          </Button>,
          <Button key="meal-pccd" type="primary" loading={nightOtSaving}
            style={{ background: '#1d4ed8', borderColor: '#1d4ed8' }}
            onClick={() => handleNightOtSave(true)}>
            Thêm bữa + PC đêm
          </Button>,
        ]}
        centered
        width={400}
      >
        {nightOtTarget && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>Nhân viên: </span>
              <b>{nightOtTarget.employeeId}</b>
              &nbsp;—&nbsp;
              <span style={{ color: '#6b7280', fontSize: 13 }}>Ngày: </span>
              <b>{dayjs(nightOtTarget.cell.work_date).format('DD/MM/YYYY')}</b>
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: '#6b7280', fontSize: 13 }}>Giờ ra: </span>
              <b style={{ color: '#1d4ed8' }}>
                {nightOtTarget.cell.check_out ? dayjs(nightOtTarget.cell.check_out).format('HH:mm') : '--'}
              </b>
            </div>
            <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
              <div style={{ marginBottom: 6 }}>
                <b>Chỉ thêm bữa ăn</b> — cộng 1 suất ăn tăng ca (35k), không thêm PC đêm.
              </div>
              <div>
                <b>Thêm bữa + PC đêm</b> — cộng 1 suất ăn tăng ca và phụ cấp ca đêm ({nightAllowanceRate.toLocaleString()}đ).
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Night allowance modal */}
      <Modal
        title={<><MoonOutlined style={{ color: '#7c3aed', marginRight: 8 }} />Cấu hình phụ cấp ca đêm</>}
        open={nightModal}
        onCancel={() => setNightModal(false)}
        footer={null}
        centered
        width={400}
      >
        <Form layout="vertical" initialValues={{ rate: nightAllowanceRate }}
          onFinish={(v) => handleSaveNightAllowance(v.rate)}
          style={{ marginTop: 16 }}>
          <Form.Item name="rate" label="Số tiền phụ cấp cho 1 ca đêm (VND)">
            <InputNumber
              style={{ width: '100%' }} min={0} step={1000}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => v.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large"
            style={{ background: '#276EF1', borderColor: '#276EF1', borderRadius: 8 }}>
            Lưu cấu hình
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
