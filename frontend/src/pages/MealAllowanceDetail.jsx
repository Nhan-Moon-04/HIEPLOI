import { useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  DollarCircleOutlined,
  MoonOutlined,
  CoffeeOutlined,
  UserOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Spin, Button } from 'antd';
import dayjs from 'dayjs';
import api from '../api/client';

const DOW_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const SUMMARY_KEYS = [
  'total_present',
  'total_absent',
  'total_forgot_scan',
  'total_early_leave',
  'total_hours',
  'total_ot',
  'total_meal_count',
  'total_meal_allowance',
  'total_night_allowance',
  'total_paid_leave',
];

const buildDateList = (start, end) => {
  if (!start || !end) return [];
  const list = [];
  let cursor = start.startOf('day');
  const last = end.startOf('day');
  while (cursor.isBefore(last, 'day') || cursor.isSame(last, 'day')) {
    list.push(cursor);
    cursor = cursor.add(1, 'day');
  }
  return list;
};

const buildMonthList = (start, end) => {
  if (!start || !end) return [];
  const months = [];
  let cursor = start.startOf('month');
  const last = end.startOf('month');
  while (cursor.isBefore(last, 'month') || cursor.isSame(last, 'month')) {
    months.push(cursor);
    cursor = cursor.add(1, 'month');
  }
  return months;
};

const mergeAttendanceResponses = (responses) => {
  const rowMap = new Map();

  (responses || []).forEach((res) => {
    (res?.rows || []).forEach((row) => {
      const existing = rowMap.get(row.employee_id);
      if (!existing) {
        const cellsByDate = {};
        (row.days || []).forEach((cell) => {
          cellsByDate[cell.work_date] = cell;
        });
        rowMap.set(row.employee_id, {
          ...row,
          summary: { ...(row.summary || {}) },
          cellsByDate,
        });
        return;
      }

      (row.days || []).forEach((cell) => {
        existing.cellsByDate[cell.work_date] = cell;
      });

      SUMMARY_KEYS.forEach((key) => {
        existing.summary[key] = (existing.summary[key] || 0) + (row.summary?.[key] || 0);
      });
    });
  });

  return { rows: Array.from(rowMap.values()) };
};

export default function MealAllowanceDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const monthKey = searchParams.get('month_key');
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const nightRate = Number(searchParams.get('night_rate') || 0);
  const isMultiMonth = startDate && endDate
    ? !dayjs(startDate).isSame(dayjs(endDate), 'month')
    : false;

  const rangeStart = startDate
    ? dayjs(startDate)
    : (monthKey ? dayjs(monthKey).startOf('month') : dayjs().startOf('month'));
  const rangeEnd = endDate
    ? dayjs(endDate)
    : (monthKey ? dayjs(monthKey).endOf('month') : dayjs().endOf('month'));

  const dateList = useMemo(
    () => buildDateList(rangeStart, rangeEnd),
    [rangeStart?.valueOf(), rangeEnd?.valueOf()],
  );

  const { data: attResponse, isLoading } = useQuery({
    queryKey: ['attendance-range', id, rangeStart?.format('YYYY-MM-DD'), rangeEnd?.format('YYYY-MM-DD'), nightRate],
    queryFn: async () => {
      if (!id || !rangeStart || !rangeEnd) return { rows: [] };

      const months = buildMonthList(rangeStart, rangeEnd);
      const responses = await Promise.all(months.map((m) => {
        const monthKey = m.format('YYYY-MM');
        const monthStart = m.startOf('month');
        const monthEnd = m.endOf('month');
        const start = rangeStart.isAfter(monthStart) ? rangeStart : monthStart;
        const end = rangeEnd.isBefore(monthEnd) ? rangeEnd : monthEnd;

        return api.get('/attendance', {
          params: {
            employee_id: id,
            month_key: monthKey,
            start_date: start.format('YYYY-MM-DD'),
            end_date: end.format('YYYY-MM-DD'),
            night_allowance_rate: nightRate,
          },
        }).then((r) => r.data);
      }));

      return mergeAttendanceResponses(responses);
    },
    enabled: !!id,
  });

  const data = attResponse?.rows?.[0];
  const cellsByDate = data?.cellsByDate || {};
  const displayDays = useMemo(() => {
    if (!data) return [];
    return dateList.map((d) => {
      const dateKey = d.format('YYYY-MM-DD');
      const cell = cellsByDate[dateKey];
      if (cell) return cell;
      return {
        work_date: dateKey,
        day: d.date(),
        dow: DOW_VN[d.day()],
        status: 'no_data',
        is_holiday: false,
        is_sunday: d.day() === 0,
        meal_allowance: 0,
        night_allowance: 0,
        meal_count: 0,
        actual_hours: 0,
      };
    });
  }, [data, dateList, cellsByDate]);

  if (isLoading) {
    return <div className="mad-loading"><Spin size="large" /></div>;
  }

  if (!data) {
    return (
      <div className="mad-loading">
        <div style={{ color: '#9ca3af', textAlign: 'center' }}>
          <MinusCircleOutlined style={{ fontSize: 32, marginBottom: 12 }} />
          <div>Không tìm thấy dữ liệu</div>
          <Button type="link" onClick={() => navigate(-1)} style={{ marginTop: 8 }}>Quay lại</Button>
        </div>
      </div>
    );
  }

  const totalAll = (data.summary.total_meal_allowance || 0) + (data.summary.total_night_allowance || 0);
  const activeDays = displayDays.filter((d) => d.status !== 'no_data').length;

  return (
    <div className="mad-page">
      {/* Title bar */}
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <button className="mad-back-btn" onClick={() => navigate(-1)}>
            <ArrowLeftOutlined />
          </button>
          <h2 className="emp-title">Chi tiết tiền ăn</h2>
          <div className="emp-stats">
            <div className="emp-stat-chip">
              <UserOutlined style={{ fontSize: 10 }} />
              <strong>{data.full_name}</strong>
            </div>
            <div className="emp-stat-chip" style={{ fontFamily: 'monospace', color: '#276EF1' }}>
              #{data.employee_code}
            </div>
            {data.department && (
              <div className="emp-stat-chip">
                <TeamOutlined style={{ fontSize: 10 }} />
                {data.department}
              </div>
            )}
            <div className="emp-stat-chip">
              <CalendarOutlined style={{ fontSize: 10 }} />
              {rangeStart.format('DD/MM')} – {rangeEnd.format('DD/MM/YYYY')}
            </div>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="mad-kpi-row">
        <div className="mad-kpi-card mad-kpi--blue">
          <div className="mad-kpi-icon"><UserOutlined /></div>
          <div className="mad-kpi-label">Ngày làm việc</div>
          <div className="mad-kpi-value mad-kpi-value--blue">{data.summary.total_present}</div>
          <div className="mad-kpi-sub">/ {activeDays} ngày</div>
        </div>
        <div className="mad-kpi-card mad-kpi--amber">
          <div className="mad-kpi-icon"><CoffeeOutlined /></div>
          <div className="mad-kpi-label">Số bữa ăn</div>
          <div className="mad-kpi-value mad-kpi-value--amber">{data.summary.total_meal_count}</div>
          <div className="mad-kpi-sub">bữa</div>
        </div>
        <div className="mad-kpi-card mad-kpi--green">
          <div className="mad-kpi-icon"><DollarCircleOutlined /></div>
          <div className="mad-kpi-label">Tiền ăn</div>
          <div className="mad-kpi-value mad-kpi-value--green">
            {(data.summary.total_meal_allowance / 1000).toLocaleString('vi-VN')}k
          </div>
          <div className="mad-kpi-sub">đồng</div>
        </div>
        <div className="mad-kpi-card mad-kpi--purple">
          <div className="mad-kpi-icon"><MoonOutlined /></div>
          <div className="mad-kpi-label">PC Đêm</div>
          <div className="mad-kpi-value mad-kpi-value--purple">
            {(data.summary.total_night_allowance / 1000).toLocaleString('vi-VN')}k
          </div>
          <div className="mad-kpi-sub">đồng</div>
        </div>
        <div className="mad-kpi-card mad-kpi--total">
          <div className="mad-kpi-icon"><DollarCircleOutlined /></div>
          <div className="mad-kpi-label">Tổng cộng</div>
          <div className="mad-kpi-value mad-kpi-value--total">{totalAll.toLocaleString()}</div>
          <div className="mad-kpi-sub">đồng</div>
        </div>
      </div>

      {/* Daily table */}
      <div className="mad-table-card">
        <div className="mad-table-scroll">
          <table className="mad-table">
            <thead>
              <tr>
                <th className="mad-th mad-th--day">Ngày</th>
                <th className="mad-th">Thứ</th>
                <th className="mad-th">Ca</th>
                <th className="mad-th">Giờ vào</th>
                <th className="mad-th">Giờ ra</th>
                <th className="mad-th">Giờ làm</th>
                <th className="mad-th">Bữa</th>
                <th className="mad-th mad-th--green">Tiền ăn</th>
                <th className="mad-th mad-th--purple">PC Đêm</th>
                <th className="mad-th mad-th--blue">Tổng (đ)</th>
                <th className="mad-th">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {displayDays.map((cell, idx) => {
                const isSun = cell.dow === 'CN';
                const isHol = cell.is_holiday;
                const isAbsent = cell.status === 'absent';
                const isNoData = cell.status === 'no_data';
                const rowTotal = (cell.meal_allowance || 0) + (cell.night_allowance || 0);

                return (
                  <tr
                    key={cell.work_date || cell.day}
                    className={`mad-row ${idx % 2 === 1 ? 'mad-row--alt' : ''} ${isSun || isHol ? 'mad-row--sun' : ''}`}
                  >
                    <td className="mad-td mad-td--day">
                      <span className={isSun || isHol ? 'mad-day--red' : ''}>
                        {isMultiMonth && cell.work_date ? dayjs(cell.work_date).format('DD/MM') : cell.day}
                      </span>
                    </td>
                    <td className="mad-td">
                      <span className={`mad-dow ${isSun || isHol ? 'mad-dow--red' : ''}`}>{cell.dow}</span>
                    </td>
                    <td className="mad-td">
                      {cell.shift_code
                        ? <span className="mad-shift-badge">{cell.shift_code}</span>
                        : <span className="mad-dash">–</span>}
                    </td>
                    <td className="mad-td mad-td--time">
                      {cell.check_in ? dayjs(cell.check_in).format('HH:mm') : <span className="mad-dash">–</span>}
                    </td>
                    <td className="mad-td mad-td--time">
                      {cell.check_out ? dayjs(cell.check_out).format('HH:mm') : <span className="mad-dash">–</span>}
                    </td>
                    <td className="mad-td mad-td--mono">
                      {cell.actual_hours > 0
                        ? `${cell.actual_hours.toFixed(1)}h`
                        : <span className="mad-dash">–</span>}
                    </td>
                    <td className="mad-td mad-td--center">
                      {cell.meal_count || <span className="mad-dash">–</span>}
                    </td>
                    <td className="mad-td mad-td--amount mad-td--green">
                      {cell.meal_allowance > 0
                        ? cell.meal_allowance.toLocaleString()
                        : <span className="mad-dash">–</span>}
                    </td>
                    <td className="mad-td mad-td--amount mad-td--purple">
                      {cell.night_allowance > 0
                        ? cell.night_allowance.toLocaleString()
                        : <span className="mad-dash">–</span>}
                    </td>
                    <td className="mad-td mad-td--amount mad-td--blue mad-td--total-col">
                      {rowTotal > 0
                        ? rowTotal.toLocaleString()
                        : <span className="mad-dash">–</span>}
                    </td>
                    <td className="mad-td">
                      {isNoData
                        ? <span className="mad-status mad-status--gray">Không có DL</span>
                        : isAbsent
                          ? <span className="mad-status mad-status--red">Vắng</span>
                          : isSun || isHol
                            ? <span className="mad-status mad-status--orange">Nghỉ CN/lễ</span>
                            : <span className="mad-status mad-status--green">Đi làm</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ma-footer-hint">
        * Mức phụ cấp ca đêm: {nightRate.toLocaleString()} đ/ca.
      </div>
    </div>
  );
}
