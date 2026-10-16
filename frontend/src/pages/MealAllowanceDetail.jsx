import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  DollarCircleOutlined,
  MoonOutlined,
  CoffeeOutlined,
  UserOutlined,
  TeamOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  MinusCircleOutlined,
  CameraOutlined,
  SettingOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  ReloadOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ClockCircleOutlined,
  FireOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Spin, Button, Alert, Modal, Checkbox, message, Space } from 'antd';
import dayjs from 'dayjs';
import html2canvas from 'html2canvas';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import useThemeStore from '../stores/themeStore';

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

const DEFAULT_COLUMNS = [
  { id: 'day', label: 'Ngày', align: 'center', visible: true, width: '55px' },
  { id: 'dow', label: 'Thứ', align: 'center', visible: true, width: '60px' },
  { id: 'shift_code', label: 'Ca', align: 'center', visible: true, width: '70px' },
  { id: 'check_in', label: 'Giờ vào', align: 'center', visible: true, width: '75px' },
  { id: 'check_out', label: 'Giờ ra', align: 'center', visible: true, width: '75px' },
  { id: 'work_hours', label: 'Giờ làm', align: 'center', visible: true, width: '80px' },
  { id: 'ot_hours', label: 'Tăng ca', align: 'center', visible: true, width: '80px' },
  { id: 'meal_count', label: 'Bữa', align: 'center', visible: true, width: '60px' },
  { id: 'meal_allowance', label: 'Tiền ăn', align: 'right', visible: true, width: '100px' },
  { id: 'night_allowance', label: 'Phụ cấp đêm', align: 'right', visible: true, width: '100px' },
  { id: 'total_amount', label: 'Tổng tiền', align: 'right', visible: true, width: '110px' },
  { id: 'status', label: 'Trạng thái', align: 'center', visible: true, width: '115px' },
  { id: 'notes', label: 'Ghi chú', align: 'left', visible: false, width: '130px' },
];

const getStoredColumns = () => {
  try {
    const raw = localStorage.getItem('mad_columns_v4');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const defaultMap = new Map(DEFAULT_COLUMNS.map((c) => [c.id, c]));
        const merged = parsed
          .filter((c) => defaultMap.has(c.id))
          .map((c) => ({ ...defaultMap.get(c.id), ...c }));
        DEFAULT_COLUMNS.forEach((c) => {
          if (!merged.find((m) => m.id === c.id)) {
            merged.push(c);
          }
        });
        return merged;
      }
    }
  } catch (e) {
    console.warn('Error reading stored columns:', e);
  }
  return DEFAULT_COLUMNS;
};

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
  const { user } = useAuthStore();
  const isDark = useThemeStore((s) => s.mode) === 'dark';
  const isWorker = user?.role === 'worker';
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [columns, setColumns] = useState(() => getStoredColumns());
  const [isColModalOpen, setIsColModalOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const pageRef = useRef(null);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      pageRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const saveColumns = (newCols) => {
    setColumns(newCols);
    localStorage.setItem('mad_columns_v4', JSON.stringify(newCols));
  };

  const handleMoveColumn = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= columns.length) return;
    const newCols = [...columns];
    const [removed] = newCols.splice(index, 1);
    newCols.splice(targetIndex, 0, removed);
    saveColumns(newCols);
  };

  const handleToggleColumn = (colId) => {
    const newCols = columns.map((c) => (c.id === colId ? { ...c, visible: !c.visible } : c));
    saveColumns(newCols);
  };

  const handleResetColumns = () => {
    saveColumns(DEFAULT_COLUMNS);
    message.success('Đã khôi phục cài đặt cột mặc định');
  };

  const handleSelectAllColumns = (val) => {
    const newCols = columns.map((c) => ({ ...c, visible: val }));
    saveColumns(newCols);
  };

  if (isWorker && Number(id) !== user?.employee_id) {
    return (
      <div style={{ padding: '24px 30px' }}>
        <Alert
          message="Không có quyền truy cập"
          description="Bạn không có quyền xem chi tiết tiền ăn của nhân viên khác."
          type="error"
          showIcon
        />
      </div>
    );
  }

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
        ot_hours: 0,
      };
    });
  }, [data, dateList, cellsByDate]);

  // Totals calculated from actual days
  const totals = useMemo(() => {
    let totalHours = 0;
    let totalOt = 0;
    let totalMeals = 0;
    let totalMealAllowance = 0;
    let totalNightAllowance = 0;
    let workedDays = 0;

    displayDays.forEach((cell) => {
      const isAbsent = cell.status === 'absent';
      const hasWorked = (cell.actual_hours > 0) || (cell.check_in && cell.check_out) || (cell.meal_count > 0 && !isAbsent);
      if (hasWorked || ['full', 'present'].includes(cell.status)) {
        workedDays++;
      }
      totalHours += cell.actual_hours || 0;
      totalOt += cell.ot_hours || 0;
      totalMeals += cell.meal_count || 0;
      totalMealAllowance += cell.meal_allowance || 0;
      totalNightAllowance += cell.night_allowance || 0;
    });

    return {
      totalHours,
      totalOt,
      totalMeals,
      totalMealAllowance,
      totalNightAllowance,
      grandTotal: totalMealAllowance + totalNightAllowance,
      workedDays,
    };
  }, [displayDays]);

  // Screenshot capture handler
  const handleCaptureScreenshot = async () => {
    const cardEl = document.getElementById('mad-capture-card');
    const scrollEl = document.getElementById('mad-capture-scroll');
    if (!cardEl || !scrollEl) return;
    setIsCapturing(true);

    const originalMaxHeight = scrollEl.style.maxHeight;
    const originalOverflow = scrollEl.style.overflow;
    scrollEl.style.maxHeight = 'none';
    scrollEl.style.overflow = 'visible';

    try {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const canvas = await html2canvas(cardEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: isDark ? '#1e293b' : '#ffffff',
        logging: false,
      });

      scrollEl.style.maxHeight = originalMaxHeight;
      scrollEl.style.overflow = originalOverflow;

      // Copy to clipboard
      let copied = false;
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
          if (blob) {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            copied = true;
          }
        } catch (clipErr) {
          console.warn('Clipboard write warning:', clipErr);
        }
      }

      // Download file
      const safeName = (data?.full_name || 'NhanVien').replace(/\s+/g, '_');
      const filename = `ChiTietTienAn_${safeName}_${rangeStart.format('DDMM')}_${rangeEnd.format('DDMMYYYY')}.png`;
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (copied) {
        message.success('Đã chụp ảnh & sao chép vào bộ nhớ tạm! Bạn có thể dán (Ctrl+V) gửi ngay.');
      } else {
        message.success('Đã chụp và tải ảnh thành công!');
      }
    } catch (err) {
      scrollEl.style.maxHeight = originalMaxHeight;
      scrollEl.style.overflow = originalOverflow;
      console.error('Capture error:', err);
      message.error('Không thể chụp ảnh: ' + (err?.message || 'Lỗi không xác định'));
    } finally {
      setIsCapturing(false);
    }
  };

  const renderStatusBadge = (cell) => {
    const isSun = cell.dow === 'CN' || cell.is_sunday;
    const isHol = cell.is_holiday;
    const isAbsent = cell.status === 'absent';
    const isForgot = cell.status === 'forgot_scan' || (!cell.check_in && cell.check_out) || (cell.check_in && !cell.check_out);
    const isEarly = cell.status === 'early_leave';
    const isShort = cell.status === 'short';
    const hasWorked = (cell.actual_hours > 0) || (cell.check_in && cell.check_out) || (cell.meal_count > 0 && !isAbsent);
    const isNoData = cell.status === 'no_data' || (!cell.check_in && !cell.check_out && !cell.actual_hours && !cell.meal_count && !cell.shift_code && !isSun && !isHol);

    // 1. Actually worked
    if (hasWorked || ['full', 'present'].includes(cell.status)) {
      if (isSun) {
        return (
          <span className="mad-status mad-status--worked-sun">
            <span className="mad-status-dot" />
            Đi làm (CN)
          </span>
        );
      }
      if (isHol) {
        return (
          <span className="mad-status mad-status--worked-hol">
            <span className="mad-status-dot" />
            Đi làm (Lễ)
          </span>
        );
      }
      if (isEarly) {
        return <span className="mad-status mad-status--early">Về sớm</span>;
      }
      if (isShort) {
        return <span className="mad-status mad-status--short">Thiếu giờ</span>;
      }
      return (
        <span className="mad-status mad-status--present">
          <span className="mad-status-dot" />
          Đi làm
        </span>
      );
    }

    // 2. Only 1 punch
    if (isForgot && cell.status !== 'absent') {
      return <span className="mad-status mad-status--forgot">Quên quét thẻ</span>;
    }

    // 3. Absent
    if (isAbsent) {
      return <span className="mad-status mad-status--absent">Vắng</span>;
    }

    // 4. Off on weekend/holiday without work
    if (isSun) {
      return <span className="mad-status mad-status--sun">Nghỉ CN</span>;
    }
    if (isHol) {
      return <span className="mad-status mad-status--hol">Nghỉ lễ</span>;
    }
    if (cell.status === 'off') {
      return <span className="mad-status mad-status--off">Nghỉ</span>;
    }

    // 5. No data
    if (isNoData) {
      return <span className="mad-status mad-status--nodata">Không có DL</span>;
    }

    return <span className="mad-status mad-status--nodata">{cell.status || '–'}</span>;
  };

  if (isLoading) {
    return <div className="mad-loading"><Spin size="large" /></div>;
  }

  if (!data) {
    return (
      <div className="mad-loading">
        <div style={{ color: '#94a3b8', textAlign: 'center' }}>
          <MinusCircleOutlined style={{ fontSize: 32, marginBottom: 12 }} />
          <div>Không tìm thấy dữ liệu</div>
          <Button type="link" onClick={() => navigate(-1)} style={{ marginTop: 8 }}>Quay lại</Button>
        </div>
      </div>
    );
  }

  const activeDays = displayDays.filter((d) => d.status !== 'no_data').length;
  const visibleColumns = columns.filter((c) => c.visible);

  return (
    <div ref={pageRef} className={`mad-page ${isFullscreen ? 'mad-page--fullscreen' : ''}`}>
      {/* ─── PAGE HEADER ────────────────────────────────────────────── */}
      <div className="mad-header">
        <div className="mad-header-left">
          {/* Breadcrumb */}
          <nav className="mad-breadcrumb" aria-label="Breadcrumb">
            <span className="mad-breadcrumb-item">Lương &amp; Thuế</span>
            <span className="mad-breadcrumb-separator">/</span>
            <span
              className="mad-breadcrumb-item mad-breadcrumb-link"
              onClick={() => navigate('/meal-allowance')}
            >
              Tiền ăn
            </span>
            <span className="mad-breadcrumb-separator">/</span>
            <span className="mad-breadcrumb-item mad-breadcrumb-item--active">Chi tiết</span>
          </nav>

          <div className="mad-title-block">
            <h1 className="mad-title">Chi tiết tiền ăn</h1>
            <p className="mad-subtitle">Theo dõi ngày công, số bữa ăn và phụ cấp của nhân viên.</p>
          </div>

          {/* Employee Info Meta Strip */}
          <div className="mad-emp-strip">
            <div className="mad-emp-avatar">
              <UserOutlined />
            </div>
            <div className="mad-emp-meta">
              <div className="mad-emp-name-row">
                <span className="mad-emp-name">{data.full_name}</span>
                <span className="mad-emp-code">#{data.employee_code}</span>
              </div>
              <div className="mad-emp-sub-row">
                {data.department && (
                  <span className="mad-emp-info-item">
                    <TeamOutlined style={{ fontSize: 12, marginRight: 5 }} />
                    {data.department}
                  </span>
                )}
                {data.department && <span className="mad-emp-dot">•</span>}
                <span className="mad-emp-info-item">
                  <CalendarOutlined style={{ fontSize: 12, marginRight: 5 }} />
                  {rangeStart.format('DD/MM/YYYY')} – {rangeEnd.format('DD/MM/YYYY')}
                </span>
                {nightRate > 0 && (
                  <>
                    <span className="mad-emp-dot">•</span>
                    <span className="mad-emp-info-item mad-emp-rate">
                      PC đêm: {nightRate.toLocaleString()} đ/ca
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons Group */}
        <div className="mad-header-right">
          <div className="mad-actions-wrapper">
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(-1)}
              className="mad-btn-ghost"
            >
              Quay lại
            </Button>

            <Button
              icon={<SettingOutlined />}
              onClick={() => setIsColModalOpen(true)}
              className="mad-btn-secondary"
            >
              Tùy chỉnh cột
            </Button>

            <Button
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleFullscreen}
              className="mad-btn-secondary"
            >
              {isFullscreen ? 'Thu nhỏ' : 'Phóng to'}
            </Button>

            <Button
              type="primary"
              icon={<CameraOutlined />}
              loading={isCapturing}
              onClick={handleCaptureScreenshot}
              className="mad-btn-primary"
            >
              Chụp ảnh bảng
            </Button>
          </div>
        </div>
      </div>

      {/* ─── SUMMARY CARDS (GRID WITH HIERARCHY) ────────────────────── */}
      <div className="mad-kpi-grid">
        {/* Hero Card - Tổng cộng (spans 2 columns) */}
        <div className="mad-kpi-card mad-kpi-card--hero">
          <div className="mad-kpi-hero-top">
            <span className="mad-kpi-label">Tổng cộng phụ cấp</span>
            <span className="mad-kpi-hero-badge">Tổng chi trả</span>
          </div>
          <div className="mad-kpi-hero-middle">
            <div className="mad-kpi-hero-number">
              {totals.grandTotal.toLocaleString()} <span className="mad-kpi-curr">đ</span>
            </div>
            <div className="mad-kpi-hero-breakdown">
              <span className="mad-hero-pill">
                <span className="mad-hero-dot mad-hero-dot--green" />
                Tiền ăn: <b>{totals.totalMealAllowance.toLocaleString()} đ</b>
              </span>
              <span className="mad-hero-pill">
                <span className="mad-hero-dot mad-hero-dot--purple" />
                PC Đêm: <b>{totals.totalNightAllowance.toLocaleString()} đ</b>
              </span>
            </div>
          </div>
          <div className="mad-kpi-hero-bottom">
            <span>{totals.workedDays} ngày công</span>
            <span className="mad-hero-sep">·</span>
            <span>{totals.totalMeals} phần cơm đã tính</span>
          </div>
        </div>

        {/* Card 2 - Tiền ăn */}
        <div className="mad-kpi-card">
          <div className="mad-kpi-card-header">
            <span className="mad-kpi-label">Tiền ăn</span>
            <div className="mad-kpi-icon-box">
              <DollarCircleOutlined />
            </div>
          </div>
          <div className="mad-kpi-card-value mad-kpi-card-value--success">
            {totals.totalMealAllowance.toLocaleString()} <span className="mad-kpi-curr">đ</span>
          </div>
          <div className="mad-kpi-card-sub">
            {(totals.totalMealAllowance / 1000).toLocaleString('vi-VN')}k · {totals.totalMeals} phần cơm
          </div>
        </div>

        {/* Card 3 - Phụ cấp ca đêm */}
        <div className="mad-kpi-card">
          <div className="mad-kpi-card-header">
            <span className="mad-kpi-label">Phụ cấp ca đêm</span>
            <div className="mad-kpi-icon-box">
              <MoonOutlined />
            </div>
          </div>
          <div className="mad-kpi-card-value">
            {totals.totalNightAllowance.toLocaleString()} <span className="mad-kpi-curr">đ</span>
          </div>
          <div className="mad-kpi-card-sub">
            Mức: {nightRate.toLocaleString()} đ/ca
          </div>
        </div>

        {/* Card 4 - Ngày làm việc */}
        <div className="mad-kpi-card">
          <div className="mad-kpi-card-header">
            <span className="mad-kpi-label">Ngày làm việc</span>
            <div className="mad-kpi-icon-box">
              <UserOutlined />
            </div>
          </div>
          <div className="mad-kpi-card-value">
            {totals.workedDays} <span className="mad-kpi-unit">ngày</span>
          </div>
          <div className="mad-kpi-card-sub">
            Trên tổng {activeDays} ngày trong kỳ
          </div>
        </div>

        {/* Card 5 - Tổng giờ làm */}
        <div className="mad-kpi-card">
          <div className="mad-kpi-card-header">
            <span className="mad-kpi-label">Tổng giờ làm</span>
            <div className="mad-kpi-icon-box">
              <ClockCircleOutlined />
            </div>
          </div>
          <div className="mad-kpi-card-value">
            {totals.totalHours.toFixed(1)} <span className="mad-kpi-unit">h</span>
          </div>
          <div className="mad-kpi-card-sub">
            Thời gian làm việc tiêu chuẩn
          </div>
        </div>

        {/* Card 6 - Tăng ca (OT) */}
        <div className="mad-kpi-card">
          <div className="mad-kpi-card-header">
            <span className="mad-kpi-label">Tăng ca (OT)</span>
            <div className="mad-kpi-icon-box">
              <FireOutlined />
            </div>
          </div>
          <div className={`mad-kpi-card-value ${totals.totalOt > 0 ? 'mad-kpi-card-value--warning' : ''}`}>
            {totals.totalOt > 0 ? `+${totals.totalOt.toFixed(1)}` : '0'} <span className="mad-kpi-unit">h</span>
          </div>
          <div className="mad-kpi-card-sub">
            Làm tròn theo quy tắc 30 phút
          </div>
        </div>

        {/* Card 7 - Số bữa ăn */}
        <div className="mad-kpi-card">
          <div className="mad-kpi-card-header">
            <span className="mad-kpi-label">Số bữa ăn</span>
            <div className="mad-kpi-icon-box">
              <CoffeeOutlined />
            </div>
          </div>
          <div className="mad-kpi-card-value">
            {totals.totalMeals} <span className="mad-kpi-unit">bữa</span>
          </div>
          <div className="mad-kpi-card-sub">
            Tổng số phần ăn theo ca
          </div>
        </div>
      </div>

      {/* ─── DATA TABLE CARD ────────────────────────────────────────── */}
      <div id="mad-capture-card" className="mad-table-card">
        {/* Clean, integrated card header */}
        <div className="mad-table-card-header">
          <div className="mad-table-card-header-left">
            <h3 className="mad-table-card-title">Bảng chấm công chi tiết</h3>
            <p className="mad-table-card-subtitle">
              {data.full_name} · #{data.employee_code} · {data.department || 'Nhân viên'} · Kỳ: {rangeStart.format('DD/MM/YYYY')} – {rangeEnd.format('DD/MM/YYYY')}
            </p>
          </div>
          <div className="mad-table-card-header-right">
            <div className="mad-table-summary-chip">
              <span className="mad-chip-item"><b>{totals.workedDays}</b> ngày công</span>
              <span className="mad-chip-sep">·</span>
              <span className="mad-chip-item"><b>{totals.totalMeals}</b> bữa</span>
              <span className="mad-chip-sep">·</span>
              <span className="mad-chip-total">Tổng: <b>{totals.grandTotal.toLocaleString()} đ</b></span>
            </div>
          </div>
        </div>

        <div id="mad-capture-scroll" className="mad-table-scroll">
          <table className="mad-table">
            <thead>
              <tr>
                {visibleColumns.map((col) => (
                  <th
                    key={col.id}
                    className="mad-th"
                    style={{ textAlign: col.align, minWidth: col.width }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayDays.map((cell, idx) => {
                const isSun = cell.dow === 'CN' || cell.is_sunday;
                const isHol = cell.is_holiday;
                const isAbsent = cell.status === 'absent';
                const hasWorked = (cell.actual_hours > 0) || (cell.check_in && cell.check_out) || (cell.meal_count > 0 && !isAbsent);
                const rowTotal = (cell.meal_allowance || 0) + (cell.night_allowance || 0);

                let rowClass = 'mad-row';
                if (isSun) {
                  rowClass += hasWorked ? ' mad-row--sun-worked' : ' mad-row--sun';
                } else if (isHol) {
                  rowClass += hasWorked ? ' mad-row--hol-worked' : ' mad-row--hol';
                } else if (idx % 2 === 1) {
                  rowClass += ' mad-row--alt';
                }

                return (
                  <tr key={cell.work_date || cell.day} className={rowClass}>
                    {visibleColumns.map((col) => {
                      switch (col.id) {
                        case 'day':
                          return (
                            <td key="day" className="mad-td mad-td--day">
                              <span className={isSun || isHol ? 'mad-day--accent' : 'mad-day--normal'}>
                                {isMultiMonth && cell.work_date ? dayjs(cell.work_date).format('DD/MM') : cell.day}
                              </span>
                            </td>
                          );

                        case 'dow':
                          return (
                            <td key="dow" className="mad-td">
                              <span className={isSun ? 'mad-dow-tag mad-dow-tag--sun' : isHol ? 'mad-dow-tag mad-dow-tag--hol' : 'mad-dow-tag'}>
                                {cell.dow}
                              </span>
                            </td>
                          );

                        case 'shift_code':
                          return (
                            <td key="shift_code" className="mad-td">
                              {cell.shift_code ? (
                                <span className="mad-shift-badge">{cell.shift_code}</span>
                              ) : (
                                <span className="mad-dash">–</span>
                              )}
                            </td>
                          );

                        case 'check_in':
                          return (
                            <td key="check_in" className="mad-td mad-td--time">
                              {cell.check_in ? dayjs(cell.check_in).format('HH:mm') : <span className="mad-dash">–</span>}
                            </td>
                          );

                        case 'check_out':
                          return (
                            <td key="check_out" className="mad-td mad-td--time">
                              {cell.check_out ? dayjs(cell.check_out).format('HH:mm') : <span className="mad-dash">–</span>}
                            </td>
                          );

                        case 'work_hours':
                          return (
                            <td key="work_hours" className="mad-td mad-td--mono">
                              {cell.actual_hours > 0 ? `${cell.actual_hours.toFixed(1)}h` : <span className="mad-dash">–</span>}
                            </td>
                          );

                        case 'ot_hours':
                          return (
                            <td key="ot_hours" className="mad-td">
                              {cell.ot_hours > 0 ? (
                                <span className="mad-ot-pill">+{cell.ot_hours.toFixed(1)}h</span>
                              ) : (
                                <span className="mad-dash">–</span>
                              )}
                            </td>
                          );

                        case 'meal_count':
                          return (
                            <td key="meal_count" className="mad-td">
                              {cell.meal_count > 0 ? (
                                <span className="mad-meal-badge">{cell.meal_count}</span>
                              ) : (
                                <span className="mad-dash">–</span>
                              )}
                            </td>
                          );

                        case 'meal_allowance':
                          return (
                            <td key="meal_allowance" className="mad-td mad-td--amount">
                              {cell.meal_allowance > 0 ? (
                                `${cell.meal_allowance.toLocaleString()} đ`
                              ) : (
                                <span className="mad-dash">–</span>
                              )}
                            </td>
                          );

                        case 'night_allowance':
                          return (
                            <td key="night_allowance" className="mad-td mad-td--amount">
                              {cell.night_allowance > 0 ? (
                                `${cell.night_allowance.toLocaleString()} đ`
                              ) : (
                                <span className="mad-dash">–</span>
                              )}
                            </td>
                          );

                        case 'total_amount':
                          return (
                            <td key="total_amount" className="mad-td mad-td--amount mad-td--total-cell">
                              {rowTotal > 0 ? `${rowTotal.toLocaleString()} đ` : <span className="mad-dash">–</span>}
                            </td>
                          );

                        case 'status':
                          return (
                            <td key="status" className="mad-td">
                              {renderStatusBadge(cell)}
                            </td>
                          );

                        case 'notes':
                          return (
                            <td key="notes" className="mad-td mad-td--notes">
                              {cell.notes || <span className="mad-dash">–</span>}
                            </td>
                          );

                        default:
                          return <td key={col.id} className="mad-td">–</td>;
                      }
                    })}
                  </tr>
                );
              })}
            </tbody>

            {/* Table Footer Totals */}
            <tfoot>
              <tr className="mad-row mad-row--footer">
                {visibleColumns.map((col) => {
                  switch (col.id) {
                    case 'day':
                      return (
                        <td key="tot-day" className="mad-td mad-footer-title">
                          TỔNG
                        </td>
                      );
                    case 'dow':
                      return (
                        <td key="tot-dow" className="mad-td mad-footer-count">
                          {displayDays.length} ngày
                        </td>
                      );
                    case 'shift_code':
                    case 'check_in':
                    case 'check_out':
                      return <td key={`tot-${col.id}`} className="mad-td mad-dash">–</td>;

                    case 'work_hours':
                      return (
                        <td key="tot-work_hours" className="mad-td mad-footer-val">
                          {totals.totalHours.toFixed(1)}h
                        </td>
                      );

                    case 'ot_hours':
                      return (
                        <td key="tot-ot_hours" className="mad-td mad-footer-val">
                          {totals.totalOt > 0 ? `+${totals.totalOt.toFixed(1)}h` : '0h'}
                        </td>
                      );

                    case 'meal_count':
                      return (
                        <td key="tot-meal_count" className="mad-td mad-footer-val">
                          {totals.totalMeals}
                        </td>
                      );

                    case 'meal_allowance':
                      return (
                        <td key="tot-meal_allowance" className="mad-td mad-td--amount mad-footer-val">
                          {totals.totalMealAllowance.toLocaleString()} đ
                        </td>
                      );

                    case 'night_allowance':
                      return (
                        <td key="tot-night_allowance" className="mad-td mad-td--amount mad-footer-val">
                          {totals.totalNightAllowance > 0 ? `${totals.totalNightAllowance.toLocaleString()} đ` : '–'}
                        </td>
                      );

                    case 'total_amount':
                      return (
                        <td key="tot-total_amount" className="mad-td mad-td--amount mad-footer-total">
                          {totals.grandTotal.toLocaleString()} đ
                        </td>
                      );

                    case 'status':
                      return (
                        <td key="tot-status" className="mad-td">
                          <span className="mad-status mad-status--present">
                            <span className="mad-status-dot" />
                            {totals.workedDays} ngày công
                          </span>
                        </td>
                      );

                    case 'notes':
                      return <td key="tot-notes" className="mad-td mad-dash">–</td>;

                    default:
                      return <td key={`tot-${col.id}`} className="mad-td">–</td>;
                  }
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="mad-footer-note">
        * Quy tắc tính: Ca tiêu chuẩn làm đủ thời gian mặc định 8h; thời gian làm việc sau ca được tính tăng ca và làm tròn theo mốc 30 phút. Phụ cấp ca đêm tính theo mức cấu hình.
      </div>

      {/* ─── MODAL CUSTOMIZE COLUMNS ─────────────────────────────────── */}
      <Modal
        title={
          <div className="mad-modal-title">
            <SettingOutlined style={{ color: '#2563eb' }} />
            <span>Tùy chỉnh cột hiển thị &amp; thứ tự</span>
          </div>
        }
        open={isColModalOpen}
        onCancel={() => setIsColModalOpen(false)}
        footer={[
          <Button key="reset" icon={<ReloadOutlined />} onClick={handleResetColumns} className="mad-modal-btn-reset">
            Mặc định ban đầu
          </Button>,
          <Button key="close" type="primary" onClick={() => setIsColModalOpen(false)} className="mad-modal-btn-done">
            Hoàn tất
          </Button>,
        ]}
        width={480}
        className="mad-col-modal"
      >
        <div className="mad-modal-toolbar">
          <span className="mad-modal-count">
            Đang hiển thị <b>{visibleColumns.length}</b>/{columns.length} cột
          </span>
          <Space size="small">
            <Button size="small" onClick={() => handleSelectAllColumns(true)}>Hiện tất cả</Button>
            <Button size="small" onClick={() => handleSelectAllColumns(false)}>Ẩn tất cả</Button>
          </Space>
        </div>

        <div className="mad-col-list">
          {columns.map((col, index) => (
            <div key={col.id} className="mad-col-item">
              <Checkbox
                checked={col.visible}
                onChange={() => handleToggleColumn(col.id)}
              >
                <span className={`mad-col-name ${!col.visible ? 'mad-col-name--dim' : ''}`}>
                  {col.label}
                </span>
              </Checkbox>

              <div className="mad-col-actions">
                <Button
                  size="small"
                  type="text"
                  icon={<ArrowUpOutlined />}
                  disabled={index === 0}
                  onClick={() => handleMoveColumn(index, -1)}
                  title="Di chuyển lên"
                />
                <Button
                  size="small"
                  type="text"
                  icon={<ArrowDownOutlined />}
                  disabled={index === columns.length - 1}
                  onClick={() => handleMoveColumn(index, 1)}
                  title="Di chuyển xuống"
                />
                <Button
                  size="small"
                  type="text"
                  icon={col.visible ? <EyeOutlined style={{ color: '#2563eb' }} /> : <EyeInvisibleOutlined style={{ color: '#94a3b8' }} />}
                  onClick={() => handleToggleColumn(col.id)}
                  title={col.visible ? 'Ẩn' : 'Hiện'}
                />
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
