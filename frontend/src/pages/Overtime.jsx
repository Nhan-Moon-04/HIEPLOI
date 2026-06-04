import React, { useState } from 'react';
import { DatePicker, Select, Spin, Tooltip, Button } from 'antd';
import {
  RiseOutlined,
  CalendarOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  StarOutlined,
  GiftOutlined,
  DownloadOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import useMonthStore from '../stores/monthStore';

export default function Overtime() {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const { monthKey, setMonthKey } = useMonthStore();
  const [dept, setDept] = useState(null);
  const [showActualOT, setShowActualOT] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: ot, isLoading } = useQuery({
    queryKey: ['overtime', monthKey, dept],
    queryFn: () =>
      api.get('/overtime', {
        params: { month_key: monthKey, department: dept || undefined },
      }).then((r) => r.data),
  });

  const { data: actualOT, isLoading: actualLoading } = useQuery({
    queryKey: ['overtime-actual', monthKey],
    queryFn: () =>
      api.get('/overtime/actual-ot', {
        params: { month_key: monthKey },
      }).then((r) => r.data),
    enabled: showActualOT,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/employees/departments').then((r) => r.data),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const resp = await api.get('/overtime/actual-ot/export', {
        params: { month_key: monthKey },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `OT_thuc_te_${monthKey}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
    } finally {
      setExporting(false);
    }
  };

  const s = ot || { rows: [], weekdays: {}, days_in_month: 30, summary: {} };
  const days = Array.from({ length: s.days_in_month }, (_, i) => i + 1);
  const sum = s.summary || {};
  const rowsWithOT = s.rows?.filter((r) => r.total_ot_hours > 0) || [];
  const actualRows = actualOT?.rows || [];

  const renderCell = (row, day) => {
    const cell = row.days[day];
    if (!cell || !cell.ot || cell.ot === 0)
      return <span className="ma-cell-dot">·</span>;

    const cls = cell.is_holiday
      ? 'ot-cell--holiday'
      : cell.is_sunday
        ? 'ot-cell--sunday'
        : 'ot-cell--normal';

    const label = cell.is_holiday ? `×3` : cell.is_sunday ? `×2` : `×1.5`;

    return (
      <Tooltip title={`${cell.shift || 'OT'} · ${cell.ot}h (${label})`} mouseEnterDelay={0.15}>
        <div className={`ot-cell ${cls}`}>{cell.ot}</div>
      </Tooltip>
    );
  };

  return (
    <div className="att-page">
      {/* Title bar */}
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <h2 className="emp-title">Tăng ca (OT)</h2>
          <div className="emp-stats">
            <div className="emp-stat-chip">
              <CalendarOutlined style={{ fontSize: 10 }} />
              Tháng {dayjs(monthKey).format('MM/YYYY')}
            </div>
            <div className="emp-stat-chip">
              <span className="emp-stat-dot emp-stat-dot--blue" />
              Tổng <strong>{(sum.total_ot_hours || 0).toFixed(1)}h</strong> OT
            </div>
            <div className="emp-stat-chip">
              <span className="emp-stat-dot emp-stat-dot--green" />
              <strong>{sum.employees_with_ot || 0}</strong> / {sum.total_employees || 0} NV có OT
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="emp-filterbar">
        <DatePicker
          picker="month"
          value={dayjs(monthKey)}
          onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
          format="[Tháng] MM/YYYY"
          style={{ width: 160 }}
          size="middle"
        />
        {!isWorker && (
          <Select
            placeholder="Bộ phận"
            allowClear
            style={{ width: 160 }}
            value={dept}
            onChange={setDept}
            options={departments.map((d) => ({ value: d, label: d }))}
            suffixIcon={<TeamOutlined style={{ color: '#9ca3af' }} />}
            size="middle"
          />
        )}
      </div>

      {/* KPI row */}
      <div className="att-kpi-row att-kpi-row--5">
        <div className="att-kpi-card att-kpi--blue">
          <RiseOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">TỔNG GIỜ OT</div>
            <div className="att-kpi-value">{(sum.total_ot_hours || 0).toFixed(1)}h</div>
          </div>
        </div>
        <div className="att-kpi-card att-kpi--indigo">
          <ClockCircleOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">OT THƯỜNG (×1.5)</div>
            <div className="att-kpi-value">{(sum.total_ot_normal || 0).toFixed(1)}h</div>
          </div>
        </div>
        <div className="att-kpi-card att-kpi--orange">
          <StarOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">OT CHỦ NHẬT (×2)</div>
            <div className="att-kpi-value">{(sum.total_ot_sunday || 0).toFixed(1)}h</div>
          </div>
        </div>
        <div className="att-kpi-card att-kpi--purple">
          <GiftOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">OT NGÀY LỄ (×3)</div>
            <div className="att-kpi-value">{(sum.total_ot_holiday || 0).toFixed(1)}h</div>
          </div>
        </div>
        <div className="att-kpi-card att-kpi--green">
          <TeamOutlined className="att-kpi-icon" />
          <div>
            <div className="att-kpi-label">NV CÓ OT</div>
            <div className="att-kpi-value">
              {sum.employees_with_ot || 0}
              <span className="att-kpi-sub"> / {sum.total_employees || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main OT table */}
      <div className="ma-table-card">
        {isLoading ? (
          <div className="ma-loading"><Spin size="large" /></div>
        ) : rowsWithOT.length === 0 ? (
          <div className="ma-empty">
            Không có nhân viên nào có OT trong tháng này.
            <div style={{ fontSize: 11, marginTop: 4, color: '#9ca3af' }}>
              OT dựa trên ca có default_overtime_hours &gt; 0 hoặc làm ngày CN/lễ.
            </div>
          </div>
        ) : (
          <div className="ma-scroll">
            <table className="ma-table">
              <thead>
                <tr>
                  <th className="ma-th ma-th--s0">Mã</th>
                  <th className="ma-th ma-th--s1">Họ tên</th>
                  {days.map((d) => {
                    const isSun = s.weekdays[d] === 'CN';
                    const isHol = s.rows?.[0]?.days?.[d]?.is_holiday;
                    return (
                      <th
                        key={d}
                        className={`ma-th ma-th--day${isHol ? ' ma-th--hol' : isSun ? ' ma-th--sun' : ''}`}
                      >
                        <div className="ma-th-num">{d}</div>
                        <div className="ma-th-dow">{s.weekdays[d]}</div>
                      </th>
                    );
                  })}
                  <th className="ma-th ma-th--sum ot-sum--indigo">×1.5</th>
                  <th className="ma-th ma-th--sum ot-sum--orange">×2.0</th>
                  <th className="ma-th ma-th--sum ot-sum--purple">×3.0</th>
                  <th className="ma-th ma-th--sum ot-sum--green">Tổng</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithOT.map((row, idx) => (
                  <tr key={row.employee_id} className={idx % 2 === 1 ? 'ma-row--alt' : ''}>
                    <td className="ma-td ma-td--s0 ma-td--code">{row.employee_code}</td>
                    <td className="ma-td ma-td--s1">
                      <Tooltip title={row.full_name}>
                        <span className="ma-name-text">{row.full_name}</span>
                      </Tooltip>
                    </td>
                    {days.map((d) => (
                      <td key={d} className="ma-td ma-td--cell">{renderCell(row, d)}</td>
                    ))}
                    <td className="ma-td ma-td--sum ot-td--indigo">
                      {row.total_ot_normal > 0 ? row.total_ot_normal.toFixed(1) : <span className="ma-cell-dot">–</span>}
                    </td>
                    <td className="ma-td ma-td--sum ot-td--orange">
                      {row.total_ot_sunday > 0 ? row.total_ot_sunday.toFixed(1) : <span className="ma-cell-dot">–</span>}
                    </td>
                    <td className="ma-td ma-td--sum ot-td--purple">
                      {row.total_ot_holiday > 0 ? row.total_ot_holiday.toFixed(1) : <span className="ma-cell-dot">–</span>}
                    </td>
                    <td className="ma-td ma-td--sum ot-td--green">{row.total_ot_hours.toFixed(1)}</td>
                  </tr>
                ))}
                <tr className="ot-total-row">
                  <td className="ma-td ma-td--s0 ot-total-label" colSpan={2}>
                    TỔNG ({rowsWithOT.length} NV)
                  </td>
                  {days.map((d) => <td key={d} className="ma-td" />)}
                  <td className="ma-td ma-td--sum ot-td--indigo">{sum.total_ot_normal?.toFixed(1)}</td>
                  <td className="ma-td ma-td--sum ot-td--orange">{sum.total_ot_sunday?.toFixed(1)}</td>
                  <td className="ma-td ma-td--sum ot-td--purple">{sum.total_ot_holiday?.toFixed(1)}</td>
                  <td className="ma-td ma-td--sum ot-td--green ot-td--total">{sum.total_ot_hours?.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ma-footer-hint">
        * ×1.5 = OT ngày thường &nbsp;·&nbsp; ×2.0 = OT Chủ nhật &nbsp;·&nbsp; ×3.0 = OT ngày lễ
      </div>

      {/* ── OT Thực Tế ─────────────────────────────────────────────────── */}
      <div className="ma-table-card" style={{ marginTop: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: showActualOT ? '1px solid #e5e7eb' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileTextOutlined style={{ color: '#6366f1' }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
              OT Thực Tế (Kế Toán)
            </span>
            {showActualOT && actualRows.length > 0 && (
              <span style={{
                background: '#ede9fe', color: '#6366f1',
                borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600,
              }}>
                {actualRows.length} dòng
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {showActualOT && (
              <Button
                size="small"
                icon={<DownloadOutlined />}
                loading={exporting}
                onClick={handleExport}
                style={{ background: '#16a34a', color: '#fff', border: 'none', fontWeight: 600 }}
              >
                Xuất Excel
              </Button>
            )}
            <Button
              size="small"
              type={showActualOT ? 'default' : 'primary'}
              onClick={() => setShowActualOT((v) => !v)}
            >
              {showActualOT ? 'Ẩn' : 'Xem OT thực tế'}
            </Button>
          </div>
        </div>

        {showActualOT && (
          <div>
            {actualLoading ? (
              <div className="ma-loading"><Spin size="large" /></div>
            ) : actualRows.length === 0 ? (
              <div className="ma-empty">Không có dữ liệu OT thực tế trong tháng này.</div>
            ) : (
              <div className="ma-scroll">
                <table className="ma-table">
                  <thead>
                    <tr>
                      <th className="ma-th" style={{ width: 44, textAlign: 'center' }}>STT</th>
                      <th className="ma-th ma-th--s0">Mã NV</th>
                      <th className="ma-th ma-th--s1">Họ tên</th>
                      <th className="ma-th" style={{ width: 96, textAlign: 'center' }}>Ngày</th>
                      <th className="ma-th" style={{ width: 48, textAlign: 'center' }}>Thứ</th>
                      <th className="ma-th" style={{ width: 104, textAlign: 'center' }}>Giờ ca</th>
                      <th className="ma-th" style={{ width: 72, textAlign: 'center' }}>Giờ vào</th>
                      <th className="ma-th" style={{ width: 72, textAlign: 'center' }}>Giờ ra</th>
                      <th className="ma-th" style={{ width: 64, textAlign: 'center' }}>OT (h)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actualRows.map((row, idx) => (
                      <tr
                        key={idx}
                        style={row.is_sunday
                          ? { background: '#fffbeb' }
                          : idx % 2 === 1 ? { background: '#f9fafb' } : {}}
                      >
                        <td className="ma-td" style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>{row.stt}</td>
                        <td className="ma-td ma-td--s0 ma-td--code">{row.employee_code}</td>
                        <td className="ma-td ma-td--s1">
                          <Tooltip title={row.full_name}>
                            <span className="ma-name-text">{row.full_name}</span>
                          </Tooltip>
                        </td>
                        <td className="ma-td" style={{ textAlign: 'center', fontSize: 12 }}>{row.work_date}</td>
                        <td className="ma-td" style={{ textAlign: 'center', fontWeight: row.is_sunday ? 700 : 400, color: row.is_sunday ? '#d97706' : undefined }}>
                          {row.weekday}
                        </td>
                        <td className="ma-td" style={{ textAlign: 'center', fontSize: 12, color: '#6366f1', fontWeight: 500 }}>{row.shift_hours}</td>
                        <td className="ma-td" style={{ textAlign: 'center', fontSize: 12 }}>{row.check_in}</td>
                        <td className="ma-td" style={{ textAlign: 'center', fontSize: 12 }}>{row.check_out}</td>
                        <td className="ma-td" style={{ textAlign: 'center', fontWeight: 700, color: row.is_sunday ? '#d97706' : '#2563eb' }}>
                          {typeof row.ot_hours === 'number' ? row.ot_hours.toFixed(1) : row.ot_hours}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {showActualOT && (
          <div style={{ padding: '6px 16px 10px', fontSize: 11, color: '#92400e', background: '#fffbeb', borderTop: '1px solid #fde68a' }}>
            * Hàng <span style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 3, padding: '0 4px', fontWeight: 700, color: '#d97706' }}>CN</span> = giờ OT thực tế chưa ×2 — Excel kế toán tự nhân đôi theo công thức.
            &nbsp;·&nbsp; Ca 9h (7h-16h…) có trừ 30p nghỉ nếu làm buổi sáng &nbsp;·&nbsp; Ca 8h liên tục (XNU…) không trừ nghỉ.
          </div>
        )}
      </div>
    </div>
  );
}
