import React, { useState } from 'react';
import { DatePicker, Select, Spin, Tooltip, Button, Modal, message } from 'antd';
import {
  RiseOutlined,
  CalendarOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  StarOutlined,
  GiftOutlined,
  EyeOutlined,
  DownloadOutlined,
  CloseOutlined,
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

  const { data: ot, isLoading } = useQuery({
    queryKey: ['overtime', monthKey, dept],
    queryFn: () =>
      api.get('/overtime', {
        params: { month_key: monthKey, department: dept || undefined },
      }).then((r) => r.data),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/employees/departments').then((r) => r.data),
  });

  // Actual OT query - only fetch when modal is open
  const { data: actualOT, isLoading: actualOTLoading } = useQuery({
    queryKey: ['actual-ot', monthKey, dept],
    queryFn: () =>
      api.get('/overtime/actual-ot', {
        params: { month_key: monthKey, department: dept || undefined },
      }).then((r) => r.data),
    enabled: showActualOT,
  });

  const s = ot || { rows: [], weekdays: {}, days_in_month: 30, summary: {} };
  const days = Array.from({ length: s.days_in_month }, (_, i) => i + 1);
  const sum = s.summary || {};
  const rowsWithOT = s.rows?.filter((r) => r.total_ot_hours > 0) || [];

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

  // Format OT minutes to display string
  const formatOTTime = (minutes) => {
    if (!minutes) return '–';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}h${m}p`;
    if (h > 0) return `${h}h`;
    return `${m}p`;
  };

  // Export actual OT to Excel
  const handleExportExcel = async () => {
    if (!actualOT?.rows?.length) {
      message.warning('Không có dữ liệu OT để xuất');
      return;
    }

    try {
      const XLSX = await import('xlsx-js-style');
      const wb = XLSX.utils.book_new();

      // Build flat rows for export
      const exportRows = [];
      let stt = 0;

      for (const row of actualOT.rows) {
        for (const detail of row.details) {
          stt++;
          exportRows.push({
            'STT': stt,
            'Mã NV': row.employee_code,
            'Họ tên': row.full_name,
            'Ngày': dayjs(detail.work_date).format('DD/MM'),
            'Thứ': detail.dow,
            'Giờ ca': detail.shift_start && detail.shift_end ? `${detail.shift_start} - ${detail.shift_end}` : '',
            'Giờ vào': detail.check_in || '',
            'Giờ ra': detail.check_out || '',
            'OT': detail.ot_hours,
          });
        }
        // Add subtotal row per employee
        exportRows.push({
          'STT': '',
          'Mã NV': row.employee_code,
          'Họ tên': `TỔNG - ${row.full_name}`,
          'Ngày': '',
          'Thứ': '',
          'Giờ ca': '',
          'Giờ vào': '',
          'Giờ ra': '',
          'OT': row.total_ot_hours,
        });
      }

      // Add grand total row for the entire sheet
      const grand_ot_hours = actualOT.rows.reduce((sum, r) => sum + r.total_ot_hours, 0);

      exportRows.push({
        'STT': '',
        'Mã NV': '',
        'Họ tên': `TỔNG CỘNG (${actualOT.rows.length} NV)`,
        'Ngày': '',
        'Thứ': '',
        'Giờ ca': '',
        'Giờ vào': '',
        'Giờ ra': '',
        'OT': grand_ot_hours,
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);

      // Define columns to apply styles
      const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

      // 1. Style Header Row (Row 1)
      for (const col of cols) {
        const cellRef = `${col}1`;
        if (ws[cellRef]) {
          ws[cellRef].s = {
            fill: { fgColor: { rgb: "276EF1" } },
            font: { bold: true, color: { rgb: "FFFFFF" }, name: "Arial", sz: 10 },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: {
              top: { style: "thin", color: { rgb: "CCCCCC" } },
              bottom: { style: "thin", color: { rgb: "CCCCCC" } },
              left: { style: "thin", color: { rgb: "CCCCCC" } },
              right: { style: "thin", color: { rgb: "CCCCCC" } }
            }
          };
        }
      }

      // 2. Style Data Rows (Row 2 onwards)
      for (let i = 0; i < exportRows.length; i++) {
        const r = i + 2; // Row number in Excel
        const dowVal = exportRows[i]['Thứ'] || '';
        const nameVal = exportRows[i]['Họ tên'] || '';
        const isGrand = nameVal.startsWith('TỔNG CỘNG');
        const isSubtotal = !isGrand && nameVal.startsWith('TỔNG -');
        const isSunday = !isGrand && !isSubtotal && dowVal === 'CN';

        for (const col of cols) {
          const cellRef = `${col}${r}`;
          if (!ws[cellRef]) continue;

          // Determine alignment based on column type
          let align = 'left';
          if (['A', 'D', 'E', 'F', 'G', 'H'].includes(col)) {
            align = 'center';
          } else if (['I'].includes(col)) {
            align = 'right';
          }

          if (isGrand) {
            ws[cellRef].s = {
              fill: { fgColor: { rgb: "D1FAE5" } }, // light green
              font: { bold: true, color: { rgb: "047857" }, name: "Arial", sz: 10 },
              alignment: { horizontal: align, vertical: "center" },
              border: {
                top: { style: "medium", color: { rgb: "10B981" } },
                bottom: { style: "double", color: { rgb: "10B981" } },
                left: { style: "thin", color: { rgb: "A7F3D0" } },
                right: { style: "thin", color: { rgb: "A7F3D0" } }
              }
            };
          } else if (isSubtotal) {
            ws[cellRef].s = {
              fill: { fgColor: { rgb: "FEF9C3" } }, // light yellow
              font: { bold: true, color: { rgb: "854D0E" }, name: "Arial", sz: 10 },
              alignment: { horizontal: align, vertical: "center" },
              border: {
                top: { style: "thin", color: { rgb: "FDE047" } },
                bottom: { style: "medium", color: { rgb: "EAB308" } },
                left: { style: "thin", color: { rgb: "FDE047" } },
                right: { style: "thin", color: { rgb: "FDE047" } }
              }
            };
          } else if (isSunday) {
            ws[cellRef].s = {
              fill: { fgColor: { rgb: "FFF1F2" } }, // light pink/rose
              font: { color: { rgb: "9F1239" }, name: "Arial", sz: 10 },
              alignment: { horizontal: align, vertical: "center" },
              border: {
                top: { style: "thin", color: { rgb: "FECDD3" } },
                bottom: { style: "thin", color: { rgb: "FECDD3" } },
                left: { style: "thin", color: { rgb: "FECDD3" } },
                right: { style: "thin", color: { rgb: "FECDD3" } }
              }
            };
          } else {
            // Normal row
            ws[cellRef].s = {
              font: { name: "Arial", sz: 10 },
              alignment: { horizontal: align, vertical: "center" },
              border: {
                top: { style: "thin", color: { rgb: "E2E8F0" } },
                bottom: { style: "thin", color: { rgb: "E2E8F0" } },
                left: { style: "thin", color: { rgb: "E2E8F0" } },
                right: { style: "thin", color: { rgb: "E2E8F0" } }
              }
            };
          }
        }
      }

      // Set column widths
      ws['!cols'] = [
        { wch: 6 },   // STT
        { wch: 10 },  // Mã NV
        { wch: 25 },  // Họ tên
        { wch: 12 },  // Ngày
        { wch: 6 },   // Thứ
        { wch: 15 },  // Giờ ca
        { wch: 10 },  // Giờ vào
        { wch: 10 },  // Giờ ra
        { wch: 10 },  // OT
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'OT Thực Tế');
      XLSX.writeFile(wb, `OT_Thuc_Te_${monthKey}.xlsx`);
      message.success('Đã xuất Excel thành công!');
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi xuất Excel');
    }
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
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            icon={<EyeOutlined />}
            onClick={() => setShowActualOT(true)}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              borderColor: '#059669',
              borderRadius: 7,
              color: '#fff',
              fontWeight: 600,
            }}
          >
            Xem OT thực tế
          </Button>
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

      {/* Table */}
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
                {/* Total row */}
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

      {/* ══════ Actual OT Modal ══════ */}
      <Modal
        open={showActualOT}
        onCancel={() => setShowActualOT(false)}
        width="95vw"
        style={{ top: 20, maxWidth: 1400 }}
        title={null}
        footer={null}
        closeIcon={<CloseOutlined />}
        className="aot-modal"
        destroyOnClose
      >
        <div className="aot-header">
          <div className="aot-header-left">
            <div className="aot-header-icon">
              <ClockCircleOutlined />
            </div>
            <div>
              <h3 className="aot-title">OT Thực Tế — Tháng {dayjs(monthKey).format('MM/YYYY')}</h3>
              <p className="aot-subtitle">
                Dựa trên chấm công thực tế · Trừ 30p nghỉ ngơi · Lẻ ≥ 16p → tính thêm 30p OT
              </p>
            </div>
          </div>
          <div className="aot-header-right">
            {actualOT?.summary && (
              <div className="aot-summary-chips">
                <div className="aot-chip aot-chip--blue">
                  <TeamOutlined />
                  <span>{actualOT.summary.employees_with_ot} NV có OT</span>
                </div>
                <div className="aot-chip aot-chip--green">
                  <ClockCircleOutlined />
                  <span>{actualOT.summary.total_ot_hours}h tổng OT</span>
                </div>
              </div>
            )}
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleExportExcel}
              disabled={!actualOT?.rows?.length}
              style={{
                background: 'linear-gradient(135deg, #276EF1, #1e5bc6)',
                borderColor: '#1e5bc6',
                borderRadius: 8,
                fontWeight: 600,
                height: 36,
              }}
            >
              Xuất Excel
            </Button>
          </div>
        </div>

        <div className="aot-body">
          {actualOTLoading ? (
            <div className="ma-loading" style={{ padding: 60 }}><Spin size="large" /></div>
          ) : !actualOT?.rows?.length ? (
            <div className="aot-empty">
              <ClockCircleOutlined style={{ fontSize: 40, color: '#d1d5db', marginBottom: 12 }} />
              <div>Không có nhân viên nào có OT thực tế trong tháng này</div>
              <div className="aot-empty-sub">Chỉ tính khi nhân viên ra trễ ≥ 16 phút so với giờ ca</div>
            </div>
          ) : (
            <div className="aot-table-wrap">
              <table className="aot-table">
                <thead>
                  <tr>
                    <th className="aot-th aot-th--stt">STT</th>
                    <th className="aot-th aot-th--code">Mã NV</th>
                    <th className="aot-th aot-th--name">Họ tên</th>
                    <th className="aot-th">Ngày</th>
                    <th className="aot-th aot-th--dow">Thứ</th>
                    <th className="aot-th">Ca</th>
                    <th className="aot-th">Giờ ca</th>
                    <th className="aot-th aot-th--time">Giờ vào</th>
                    <th className="aot-th aot-th--time">Giờ ra</th>
                    <th className="aot-th aot-th--ot">OT</th>
                    <th className="aot-th aot-th--hours">Giờ làm</th>
                    <th className="aot-th aot-th--total">Tổng giờ</th>
                  </tr>
                </thead>
                <tbody>
                  {actualOT.rows.map((row, rowIdx) => {
                    let sttBase = 0;
                    for (let i = 0; i < rowIdx; i++) sttBase += actualOT.rows[i].details.length;

                    return (
                      <React.Fragment key={row.employee_id}>
                        {row.details.map((d, dIdx) => (
                          <tr key={`${row.employee_id}-${d.day}`} className={`${rowIdx % 2 === 1 ? 'aot-row--alt' : ''} ${d.dow === 'CN' ? 'aot-row--sunday' : ''}`}>
                            <td className="aot-td aot-td--stt">{sttBase + dIdx + 1}</td>
                            <td className="aot-td aot-td--code">{dIdx === 0 ? row.employee_code : ''}</td>
                            <td className="aot-td aot-td--name">{dIdx === 0 ? row.full_name : ''}</td>
                            <td className="aot-td">{dayjs(d.work_date).format('DD/MM')}</td>
                            <td className="aot-td aot-td--dow">{d.dow}</td>
                            <td className="aot-td">
                              <span className="aot-shift-badge">{d.shift_code}</span>
                            </td>
                            <td className="aot-td aot-td--shift-time">
                              {d.shift_start} – {d.shift_end}
                            </td>
                            <td className="aot-td aot-td--time">{d.check_in}</td>
                            <td className="aot-td aot-td--time aot-td--checkout">{d.check_out}</td>
                            <td className="aot-td aot-td--ot">
                              <span className="aot-ot-badge">{d.ot_hours > 0 ? `${d.ot_hours}h` : '–'}</span>
                            </td>
                            <td className="aot-td aot-td--hours">{d.work_hours}h</td>
                            <td className="aot-td aot-td--total">{d.total_hours}h</td>
                          </tr>
                        ))}
                        {/* Subtotal row per employee */}
                        <tr className="aot-subtotal-row">
                          <td className="aot-td" colSpan={3}>
                            <strong>Tổng {row.full_name}</strong>
                            <span className="aot-subtotal-count"> ({row.details.length} ngày OT)</span>
                          </td>
                          <td className="aot-td" colSpan={6}></td>
                          <td className="aot-td aot-td--ot">
                            <span className="aot-ot-badge aot-ot-badge--total">{row.total_ot_hours > 0 ? `${row.total_ot_hours}h` : '–'}</span>
                          </td>
                          <td className="aot-td aot-td--hours"><strong>{row.total_work_hours}h</strong></td>
                          <td className="aot-td aot-td--total"><strong>{row.total_all_hours}h</strong></td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                  {/* Grand total */}
                  <tr className="aot-grand-total-row">
                    <td className="aot-td" colSpan={3}>
                      <strong>TỔNG CỘNG ({actualOT.rows.length} NV)</strong>
                    </td>
                    <td className="aot-td" colSpan={6}></td>
                    <td className="aot-td aot-td--ot">
                      <span className="aot-ot-badge aot-ot-badge--grand">
                        {actualOT.summary.total_ot_hours}h
                      </span>
                    </td>
                    <td className="aot-td aot-td--hours">
                      <strong>
                        {actualOT.rows.reduce((s, r) => s + r.total_work_hours, 0)}h
                      </strong>
                    </td>
                    <td className="aot-td aot-td--total">
                      <strong>
                        {actualOT.rows.reduce((s, r) => s + r.total_all_hours, 0)}h
                      </strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="aot-footer">
          <div className="aot-footer-rules">
            <strong>Quy tắc tính OT:</strong> Chỉ tính khi ra trễ · Vào sớm không tính · Trừ 30p nghỉ ngơi · Lẻ ≥ 16p → tròn lên 30p · Lẻ &lt; 16p → bỏ
          </div>
        </div>
      </Modal>
    </div>
  );
}
