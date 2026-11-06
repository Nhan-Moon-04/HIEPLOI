import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  DollarCircleOutlined,
  MoonOutlined,
  CoffeeOutlined,
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
  CheckCircleOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Spin, Button, Alert, Modal, Checkbox, message, Space } from 'antd';
import dayjs from 'dayjs';
import html2canvas from 'html2canvas';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import useThemeStore from '../stores/themeStore';
import './MealAllowanceDetail.css';

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
  { id: 'day', label: 'Ngày', align: 'center', visible: true, width: '56px' },
  { id: 'dow', label: 'Thứ', align: 'center', visible: true, width: '60px' },
  { id: 'shift_code', label: 'Ca', align: 'center', visible: true, width: '75px' },
  { id: 'check_in', label: 'Giờ vào', align: 'center', visible: true, width: '80px' },
  { id: 'check_out', label: 'Giờ ra', align: 'center', visible: true, width: '80px' },
  { id: 'work_hours', label: 'Giờ làm', align: 'center', visible: true, width: '80px' },
  { id: 'ot_hours', label: 'Tăng ca', align: 'center', visible: true, width: '85px' },
  { id: 'meal_count', label: 'Bữa', align: 'center', visible: true, width: '60px' },
  { id: 'meal_allowance', label: 'Tiền ăn', align: 'right', visible: true, width: '105px' },
  { id: 'night_allowance', label: 'PC Đêm', align: 'right', visible: true, width: '105px' },
  { id: 'total_amount', label: 'Tổng tiền', align: 'right', visible: true, width: '115px' },
  { id: 'status', label: 'Trạng thái', align: 'center', visible: true, width: '120px' },
  { id: 'notes', label: 'Ghi chú', align: 'left', visible: false, width: '130px' },
];

const getStoredColumns = () => {
  try {
    const raw = localStorage.getItem('mad_columns_v5');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const defaultMap = new Map(DEFAULT_COLUMNS.map((c) => [c.id, c]));
        const merged = parsed
          .filter((c) => defaultMap.has(c.id))
          .map((c) => ({ ...defaultMap.get(c.id), visible: c.visible }));
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

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
    localStorage.setItem('mad_columns_v5', JSON.stringify(newCols));
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

  useEffect(() => {
    if (data?.full_name) {
      document.title = `Chi tiết tiền ăn - ${data.full_name} | Hiệp Lợi HR`;
    } else {
      document.title = 'Chi tiết tiền ăn | Hiệp Lợi HR';
    }
  }, [data?.full_name]);

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
      await new Promise((resolve) => setTimeout(resolve, 200));

      const canvas = await html2canvas(cardEl, {
        scale: 3, // Siêu nét Ultra-HD
        useCORS: true,
        backgroundColor: isDark ? '#1a1f2e' : '#ffffff',
        logging: false,
        imageTimeout: 0,
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
          <span className="mad-badge mad-badge--worked-sun">
            <span className="mad-badge-dot" />
            Đi làm (CN)
          </span>
        );
      }
      if (isHol) {
        return (
          <span className="mad-badge mad-badge--worked-hol">
            <span className="mad-badge-dot" />
            Đi làm (Lễ)
          </span>
        );
      }
      if (isEarly) {
        return <span className="mad-badge mad-badge--early">Về sớm</span>;
      }
      if (isShort) {
        return <span className="mad-badge mad-badge--short">Thiếu giờ</span>;
      }
      return (
        <span className="mad-badge mad-badge--present">
          <span className="mad-badge-dot" />
          Đi làm
        </span>
      );
    }

    // 2. Only 1 punch
    if (isForgot && cell.status !== 'absent') {
      return <span className="mad-badge mad-badge--forgot">Quên quét thẻ</span>;
    }

    // 3. Absent
    if (isAbsent) {
      return <span className="mad-badge mad-badge--absent">Vắng</span>;
    }

    // 4. Off on weekend/holiday without work
    if (isSun) {
      return <span className="mad-badge mad-badge--sun">Nghỉ CN</span>;
    }
    if (isHol) {
      return <span className="mad-badge mad-badge--hol">Nghỉ lễ</span>;
    }
    if (cell.status === 'off') {
      return <span className="mad-badge mad-badge--off">Nghỉ</span>;
    }

    // 5. No data
    if (isNoData) {
      return <span className="mad-dash">–</span>;
    }

    return <span className="mad-badge mad-badge--default">{cell.status || '–'}</span>;
  };

  if (isLoading) {
    return (
      <div className="mad-loading">
        <Spin size="large" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mad-loading">
        <div style={{ color: '#94a3b8', textAlign: 'center' }}>
          <MinusCircleOutlined style={{ fontSize: 32, marginBottom: 12 }} />
          <div>Không tìm thấy dữ liệu nhân viên</div>
          <Button type="link" onClick={() => navigate(-1)} style={{ marginTop: 8 }}>
            Quay lại danh sách
          </Button>
        </div>
      </div>
    );
  }

  const visibleColumns = columns.filter((c) => c.visible);

  return (
    <div ref={pageRef} className={`mad-page ${isFullscreen ? 'mad-page--fullscreen' : ''}`}>
      {/* ─── TOP ACTION BAR & BREADCRUMB ───────────────────────────── */}
      <div className="mad-topbar">
        <div className="mad-breadcrumb">
          <span className="mad-breadcrumb-dim">Lương &amp; Thuế</span>
          <span className="mad-breadcrumb-sep">/</span>
          <span
            className="mad-breadcrumb-link"
            onClick={() => navigate('/meal-allowance')}
          >
            Tiền ăn
          </span>
          <span className="mad-breadcrumb-sep">/</span>
          <span className="mad-breadcrumb-curr">Chi tiết chấm công &amp; tiền ăn</span>
        </div>

        <div className="mad-top-actions">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            className="mad-btn"
          >
            Quay lại
          </Button>

          <Button
            icon={<SettingOutlined />}
            onClick={() => setIsColModalOpen(true)}
            className="mad-btn"
          >
            Tùy chỉnh cột
          </Button>

          <Button
            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={toggleFullscreen}
            className="mad-btn"
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

      {/* ─── PAGE CONTENT (EMPLOYEE PROFILE + KPIS + TABLE) ──────── */}
      <div className="mad-content-wrapper">
        
        {/* ─── 1. EMPLOYEE PROFILE HERO CARD ────────────────────────── */}
        <div className="mad-emp-card">
          <div className="mad-emp-left">
            <div className="mad-emp-avatar">
              {getInitials(data.full_name)}
            </div>
            <div className="mad-emp-info">
              <div className="mad-emp-name-row">
                <span className="mad-emp-name">{data.full_name}</span>
                <span className="mad-emp-code">#{data.employee_code}</span>
                <span className="mad-emp-dept">
                  <TeamOutlined style={{ marginRight: 4 }} />
                  {data.department || 'Nhân viên'}
                </span>
              </div>
              <div className="mad-emp-meta-row">
                <span className="mad-emp-pill">
                  <CalendarOutlined style={{ marginRight: 5, color: '#64748b' }} />
                  Kỳ: <b>{rangeStart.format('DD/MM/YYYY')}</b> – <b>{rangeEnd.format('DD/MM/YYYY')}</b>
                </span>
                {nightRate > 0 && (
                  <span className="mad-emp-pill mad-emp-pill--purple">
                    <MoonOutlined style={{ marginRight: 5, color: '#7c3aed' }} />
                    PC đêm: <b>{nightRate.toLocaleString()} đ/ca</b>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mad-emp-right">
            <div className="mad-summary-stat">
              <span className="mad-summary-stat-label">Ngày công</span>
              <span className="mad-summary-stat-val">
                <CheckCircleOutlined style={{ color: '#10b981', marginRight: 4 }} />
                {totals.workedDays}
              </span>
            </div>
            <div className="mad-summary-stat-sep" />
            <div className="mad-summary-stat">
              <span className="mad-summary-stat-label">Số bữa</span>
              <span className="mad-summary-stat-val">{totals.totalMeals}</span>
            </div>
            <div className="mad-summary-stat-sep" />
            <div className="mad-summary-stat">
              <span className="mad-summary-stat-label">Tổng nhận</span>
              <span className="mad-summary-stat-val mad-summary-stat-val--blue">
                {totals.grandTotal.toLocaleString()} đ
              </span>
            </div>
          </div>
        </div>

        {/* ─── 2. KPI SUMMARY CARDS (STREAMLINED 4-CARD ROW) ─────────── */}
        <div className="mad-kpi-row">
          {/* Card 1: Tổng tiền ăn */}
          <div className="mad-kpi-card mad-kpi-card--green">
            <div className="mad-kpi-card-inner">
              <div className="mad-kpi-card-header">
                <span className="mad-kpi-label">TỔNG TIỀN ĂN</span>
                <div className="mad-kpi-icon mad-kpi-icon--green">
                  <DollarCircleOutlined />
                </div>
              </div>
              <div className="mad-kpi-value mad-kpi-value--green">
                {totals.totalMealAllowance.toLocaleString()} <span>đ</span>
              </div>
              <div className="mad-kpi-sub">
                {totals.totalMeals} phần cơm đã tính
              </div>
            </div>
            <div className="mad-kpi-accent-bar mad-kpi-accent-bar--green" />
          </div>

          {/* Card 2: Phụ cấp ca đêm */}
          <div className="mad-kpi-card mad-kpi-card--purple">
            <div className="mad-kpi-card-inner">
              <div className="mad-kpi-card-header">
                <span className="mad-kpi-label">TỔNG PC ĐÊM</span>
                <div className="mad-kpi-icon mad-kpi-icon--purple">
                  <MoonOutlined />
                </div>
              </div>
              <div className="mad-kpi-value mad-kpi-value--purple">
                {totals.totalNightAllowance.toLocaleString()} <span>đ</span>
              </div>
              <div className="mad-kpi-sub">
                Mức: {nightRate.toLocaleString()} đ/ca
              </div>
            </div>
            <div className="mad-kpi-accent-bar mad-kpi-accent-bar--purple" />
          </div>

          {/* Card 3: Tổng cộng thực nhận */}
          <div className="mad-kpi-card mad-kpi-card--blue">
            <div className="mad-kpi-card-inner">
              <div className="mad-kpi-card-header">
                <span className="mad-kpi-label">TỔNG CỘNG THỰC NHẬN</span>
                <div className="mad-kpi-icon mad-kpi-icon--blue">
                  <WalletOutlined />
                </div>
              </div>
              <div className="mad-kpi-value mad-kpi-value--blue">
                {totals.grandTotal.toLocaleString()} <span>đ</span>
              </div>
              <div className="mad-kpi-sub">
                Tiền ăn + Phụ cấp ca đêm
              </div>
            </div>
            <div className="mad-kpi-accent-bar mad-kpi-accent-bar--blue" />
          </div>

          {/* Card 4: Công & Giờ làm */}
          <div className="mad-kpi-card mad-kpi-card--cyan">
            <div className="mad-kpi-card-inner">
              <div className="mad-kpi-card-header">
                <span className="mad-kpi-label">CÔNG &amp; GIỜ LÀM</span>
                <div className="mad-kpi-icon mad-kpi-icon--cyan">
                  <ClockCircleOutlined />
                </div>
              </div>
              <div className="mad-kpi-value mad-kpi-value--cyan">
                {totals.workedDays} <span>ngày</span>
              </div>
              <div className="mad-kpi-sub">
                {totals.totalHours.toFixed(1)}h làm{totals.totalOt > 0 ? ` · +${totals.totalOt.toFixed(1)}h OT` : ''}
              </div>
            </div>
            <div className="mad-kpi-accent-bar mad-kpi-accent-bar--cyan" />
          </div>
        </div>

        {/* ─── 3. BẢNG CHẤM CÔNG CHI TIẾT (CLEAN TABLE) ─────────────── */}
        <div id="mad-capture-card" className="mad-table-card">
          <div className="mad-table-header">
            <div className="mad-table-title-box">
              <h2 className="mad-table-title">Bảng chấm công chi tiết</h2>
              <div className="mad-table-subtitle">
                <span className="mad-sub-name">{data.full_name}</span>
                <span className="mad-sub-sep">·</span>
                <span className="mad-sub-code">#{data.employee_code}</span>
                <span className="mad-sub-sep">·</span>
                <span className="mad-sub-dept">{data.department || 'Nhân viên'}</span>
                <span className="mad-sub-sep">·</span>
                <span className="mad-sub-range">
                  Kỳ: {rangeStart.format('DD/MM/YYYY')} – {rangeEnd.format('DD/MM/YYYY')}
                </span>
              </div>
            </div>

            <div className="mad-table-chips">
              <span className="mad-chip">
                <b>{totals.workedDays}</b> ngày công
              </span>
              <span className="mad-chip">
                <b>{totals.totalMeals}</b> bữa
              </span>
              <span className="mad-chip mad-chip--total">
                Tổng: <b>{totals.grandTotal.toLocaleString()} đ</b>
              </span>
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
                      style={{ textAlign: col.align, width: col.width, minWidth: col.width }}
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
                        const cellStyle = { textAlign: col.align };
                        switch (col.id) {
                          case 'day':
                            return (
                              <td key="day" className="mad-td mad-td--day" style={cellStyle}>
                                <span className={isSun || isHol ? 'mad-day--accent' : 'mad-day--normal'}>
                                  {isMultiMonth && cell.work_date ? dayjs(cell.work_date).format('DD/MM') : cell.day}
                                </span>
                              </td>
                            );

                          case 'dow':
                            return (
                              <td key="dow" className="mad-td" style={cellStyle}>
                                <span className={isSun ? 'mad-dow-tag mad-dow-tag--sun' : isHol ? 'mad-dow-tag mad-dow-tag--hol' : 'mad-dow-tag'}>
                                  {cell.dow}
                                </span>
                              </td>
                            );

                          case 'shift_code':
                            return (
                              <td key="shift_code" className="mad-td" style={cellStyle}>
                                {cell.shift_code ? (
                                  <span className="mad-shift-badge">{cell.shift_code}</span>
                                ) : (
                                  <span className="mad-dash">–</span>
                                )}
                              </td>
                            );

                          case 'check_in':
                            return (
                              <td key="check_in" className="mad-td mad-td--mono" style={cellStyle}>
                                {cell.check_in ? dayjs(cell.check_in).format('HH:mm') : <span className="mad-dash">–</span>}
                              </td>
                            );

                          case 'check_out':
                            return (
                              <td key="check_out" className="mad-td mad-td--mono" style={cellStyle}>
                                {cell.check_out ? dayjs(cell.check_out).format('HH:mm') : <span className="mad-dash">–</span>}
                              </td>
                            );

                          case 'work_hours':
                            return (
                              <td key="work_hours" className="mad-td mad-td--mono" style={cellStyle}>
                                {cell.actual_hours > 0 ? (
                                  <span className="mad-hours-val">{cell.actual_hours.toFixed(1)}h</span>
                                ) : (
                                  <span className="mad-dash">–</span>
                                )}
                              </td>
                            );

                          case 'ot_hours':
                            return (
                              <td key="ot_hours" className="mad-td" style={cellStyle}>
                                {cell.ot_hours > 0 ? (
                                  <span className="mad-ot-pill">+{cell.ot_hours.toFixed(1)}h</span>
                                ) : (
                                  <span className="mad-dash">–</span>
                                )}
                              </td>
                            );

                          case 'meal_count':
                            return (
                              <td key="meal_count" className="mad-td" style={cellStyle}>
                                {cell.meal_count > 0 ? (
                                  <span className="mad-meal-pill">{cell.meal_count}</span>
                                ) : (
                                  <span className="mad-dash">–</span>
                                )}
                              </td>
                            );

                          case 'meal_allowance':
                            return (
                              <td key="meal_allowance" className="mad-td mad-td--amount" style={cellStyle}>
                                {cell.meal_allowance > 0 ? (
                                  <span className="mad-money-val">{cell.meal_allowance.toLocaleString()} đ</span>
                                ) : (
                                  <span className="mad-dash">–</span>
                                )}
                              </td>
                            );

                          case 'night_allowance':
                            return (
                              <td key="night_allowance" className="mad-td mad-td--amount" style={cellStyle}>
                                {cell.night_allowance > 0 ? (
                                  <span className="mad-money-night">{cell.night_allowance.toLocaleString()} đ</span>
                                ) : (
                                  <span className="mad-dash">–</span>
                                )}
                              </td>
                            );

                          case 'total_amount':
                            return (
                              <td key="total_amount" className="mad-td mad-td--amount mad-td--total-cell" style={cellStyle}>
                                {rowTotal > 0 ? (
                                  <span className="mad-money-total">{rowTotal.toLocaleString()} đ</span>
                                ) : (
                                  <span className="mad-dash">–</span>
                                )}
                              </td>
                            );

                          case 'status':
                            return (
                              <td key="status" className="mad-td" style={cellStyle}>
                                {renderStatusBadge(cell)}
                              </td>
                            );

                          case 'notes':
                            return (
                              <td key="notes" className="mad-td mad-td--notes" style={cellStyle}>
                                {cell.notes || <span className="mad-dash">–</span>}
                              </td>
                            );

                          default:
                            return <td key={col.id} className="mad-td" style={cellStyle}>–</td>;
                        }
                      })}
                    </tr>
                  );
                })}
              </tbody>

              {/* Table Footer Totals */}
              <tfoot>
                <tr className="mad-row mad-row--footer">
                  {visibleColumns.map((col, idx) => {
                    const footerStyle = { textAlign: col.align };
                    const hasDayCol = visibleColumns.some((c) => c.id === 'day');
                    const isFirstCol = idx === 0;

                    if (col.id === 'day' || (!hasDayCol && isFirstCol)) {
                      return (
                        <td key="tot-day" className="mad-td mad-footer-title" style={footerStyle}>
                          TỔNG
                        </td>
                      );
                    }

                    switch (col.id) {
                      case 'dow':
                        return (
                          <td key="tot-dow" className="mad-td mad-footer-count" style={footerStyle}>
                            {displayDays.length} ngày
                          </td>
                        );
                      case 'shift_code':
                      case 'check_in':
                      case 'check_out':
                        return <td key={`tot-${col.id}`} className="mad-td mad-dash" style={footerStyle}>–</td>;

                      case 'work_hours':
                        return (
                          <td key="tot-work_hours" className="mad-td mad-footer-val" style={footerStyle}>
                            {totals.totalHours.toFixed(1)}h
                          </td>
                        );

                      case 'ot_hours':
                        return (
                          <td key="tot-ot_hours" className="mad-td mad-footer-val" style={footerStyle}>
                            {totals.totalOt > 0 ? `+${totals.totalOt.toFixed(1)}h` : '0h'}
                          </td>
                        );

                      case 'meal_count':
                        return (
                          <td key="tot-meal_count" className="mad-td mad-footer-val" style={footerStyle}>
                            {totals.totalMeals}
                          </td>
                        );

                      case 'meal_allowance':
                        return (
                          <td key="tot-meal_allowance" className="mad-td mad-td--amount mad-footer-val mad-footer-green" style={footerStyle}>
                            {totals.totalMealAllowance.toLocaleString()} đ
                          </td>
                        );

                      case 'night_allowance':
                        return (
                          <td key="tot-night_allowance" className="mad-td mad-td--amount mad-footer-val mad-footer-purple" style={footerStyle}>
                            {totals.totalNightAllowance > 0 ? `${totals.totalNightAllowance.toLocaleString()} đ` : '–'}
                          </td>
                        );

                      case 'total_amount':
                        return (
                          <td key="tot-total_amount" className="mad-td mad-td--amount mad-footer-total" style={footerStyle}>
                            {totals.grandTotal.toLocaleString()} đ
                          </td>
                        );

                      case 'status':
                        return (
                          <td key="tot-status" className="mad-td" style={footerStyle}>
                            <span className="mad-badge mad-badge--present">
                              <span className="mad-badge-dot" />
                              {totals.workedDays} ngày công
                            </span>
                          </td>
                        );

                      case 'notes':
                        return <td key="tot-notes" className="mad-td mad-dash" style={footerStyle}>–</td>;

                      default:
                        return <td key={`tot-${col.id}`} className="mad-td" style={footerStyle}>–</td>;
                    }
                  })}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mad-table-footer-note">
            * Quy tắc tính: Ca tiêu chuẩn làm đủ thời gian mặc định 8h; thời gian làm việc sau ca được tính tăng ca và làm tròn theo mốc 30 phút. Phụ cấp ca đêm tính theo mức cấu hình.
          </div>
        </div>
      </div>

      {/* ─── MODAL CUSTOMIZE COLUMNS ─────────────────────────────────── */}
      <Modal
        title={
          <div className="mad-modal-title">
            <SettingOutlined style={{ color: '#276EF1' }} />
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
                  icon={col.visible ? <EyeOutlined style={{ color: '#276EF1' }} /> : <EyeInvisibleOutlined style={{ color: '#94a3b8' }} />}
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
