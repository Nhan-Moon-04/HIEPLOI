import { useState, useMemo, useRef } from 'react';
import { DatePicker, Select, Spin, Button, Modal, Tag, Tooltip, InputNumber, message, Table } from 'antd';
import {
  PrinterOutlined, DownloadOutlined, TeamOutlined, DollarOutlined,
  UserOutlined, BankOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';

// ─── TNCN Calculator ────────────────────────────────────────────────────────
function calcTNCN(taxable) {
  if (taxable <= 0) return 0;
  let tax = 0;
  tax += Math.min(taxable, 10_000_000) * 0.05;
  tax += Math.min(Math.max(taxable - 10_000_000, 0), 20_000_000) * 0.10;
  tax += Math.min(Math.max(taxable - 30_000_000, 0), 30_000_000) * 0.20;
  tax += Math.min(Math.max(taxable - 60_000_000, 0), 40_000_000) * 0.30;
  tax += Math.max(taxable - 100_000_000, 0) * 0.35;
  return Math.round(tax);
}

function fmt(n) {
  if (!n) return '–';
  return Math.round(n).toLocaleString('vi-VN');
}
function fmtK(n) {
  if (!n) return '–';
  const k = Math.round(n) / 1000;
  return k >= 1000 ? `${(k/1000).toFixed(1)}M` : `${k}k`;
}

// ─── PaySlip Modal ───────────────────────────────────────────────────────────
function PaySlip({ row, monthKey, onClose }) {
  if (!row) return null;
  const printRef = useRef();

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Phiếu lương</title><style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:20px;color:#111}
      h2{text-align:center;font-size:15px;margin:0 0 4px}
      .sub{text-align:center;font-size:13px;margin:0 0 16px;color:#444}
      table{width:100%;border-collapse:collapse}
      td,th{padding:5px 8px;border:1px solid #ccc;font-size:12px}
      th{background:#f0f0f0;font-weight:600}
      .total-row td{font-weight:700;background:#f9fafb}
      .net-row td{font-weight:800;background:#e0f2fe;font-size:14px}
      .info{display:flex;gap:40px;margin-bottom:12px;font-size:12px}
      .info div{flex:1}
      .right{text-align:right}
    </style></head><body>${content}</body></html>`);
    win.document.close();
    win.print();
  };

  const r = row;
  return (
    <Modal
      title={<><PrinterOutlined style={{ color: '#276EF1', marginRight: 8 }} />Phiếu lương tháng {dayjs(monthKey).format('MM/YYYY')}</>}
      open={!!row}
      onCancel={onClose}
      width={680}
      centered
      footer={[
        <Button key="close" onClick={onClose}>Đóng</Button>,
        <Button key="print" type="primary" icon={<PrinterOutlined />}
          style={{ background: '#276EF1', borderColor: '#276EF1' }}
          onClick={handlePrint}>
          In phiếu lương
        </Button>,
      ]}
    >
      <div ref={printRef}>
        <h2>CÔNG TY TNHH HIỆP LỢI</h2>
        <div className="sub" style={{ textAlign: 'center', color: '#555', marginBottom: 16 }}>
          PHIẾU LƯƠNG THÁNG {dayjs(monthKey).format('MM/YYYY')}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 32px', marginBottom: 16, fontSize: 13 }}>
          <div><b>Họ tên:</b> {r.full_name}</div>
          <div><b>Mã NV:</b> {r.employee_code}</div>
          <div><b>Bộ phận:</b> {r.department || '–'}</div>
          <div><b>Ngày công:</b> {r.actual_days}/{r.standard_days}</div>
          <div><b>Lương cơ bản:</b> {fmt(r.base_salary)} đ</div>
          <div><b>Người phụ thuộc:</b> {r.dependents}</div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <tr>
              <th style={{ background: '#f0f4ff', border: '1px solid #dde', padding: '6px 10px', textAlign: 'left' }} colSpan={2}>THU NHẬP</th>
              <th style={{ background: '#fff4f0', border: '1px solid #dde', padding: '6px 10px', textAlign: 'left' }} colSpan={2}>KHẤU TRỪ</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Lương ngày công', r.salary_from_days, 'BHXH (10.5%)', r.bhxh],
              ['Tăng ca thường (1.5x)', r.ot_pay_wd || 0, 'Công đoàn (1%)', r.union_fee],
              ['Tăng ca CN (2x)', r.ot_pay_sun || 0, 'TNCN', r.tncn],
              ['Tăng ca Lễ (3x)', r.ot_pay_hol || 0, 'Tạm ứng', r.advance],
              ['Phụ cấp cố định', r.fixed_allowance, '', ''],
              ['Tiền ăn', r.meal_allowance, '', ''],
              ['PC ca đêm', r.night_allowance, '', ''],
            ].map(([e1, v1, e2, v2], i) => (
              <tr key={i}>
                <td style={{ border: '1px solid #e5e7eb', padding: '5px 10px', width: '30%' }}>{e1}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '5px 10px', textAlign: 'right', width: '20%', fontWeight: v1 ? 600 : 400, color: v1 ? '#10b981' : '#9ca3af' }}>{v1 ? fmt(v1) : '–'}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '5px 10px', width: '30%' }}>{e2}</td>
                <td style={{ border: '1px solid #e5e7eb', padding: '5px 10px', textAlign: 'right', width: '20%', fontWeight: v2 ? 600 : 400, color: v2 ? '#ef4444' : '#9ca3af' }}>{v2 ? fmt(v2) : '–'}</td>
              </tr>
            ))}
            <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
              <td style={{ border: '1px solid #e5e7eb', padding: '6px 10px' }}>TỔNG THU NHẬP</td>
              <td style={{ border: '1px solid #e5e7eb', padding: '6px 10px', textAlign: 'right', color: '#059669' }}>{fmt(r.gross)}</td>
              <td style={{ border: '1px solid #e5e7eb', padding: '6px 10px' }}>TỔNG KHẤU TRỪ</td>
              <td style={{ border: '1px solid #e5e7eb', padding: '6px 10px', textAlign: 'right', color: '#dc2626' }}>{fmt(r.total_deductions)}</td>
            </tr>
          </tbody>
        </table>

        {r.taxable > 0 && (
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, padding: '6px 10px', background: '#f9fafb', borderRadius: 6 }}>
            Thu nhập tính thuế: {fmt(r.taxable)} đ &nbsp;→&nbsp; TNCN: {fmt(r.tncn)} đ
          </div>
        )}

        <div style={{ background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>THỰC LĨNH</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1d4ed8' }}>{fmt(r.net)} đ</div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function PayrollTable() {
  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const [nightRate, setNightRate] = useState(() => Number(localStorage.getItem('nightAllowanceRate')) || 100000);
  const [dept, setDept] = useState(null);
  const [payslipRow, setPayslipRow] = useState(null);

  const { data: att, isLoading: loadingAtt } = useQuery({
    queryKey: ['payroll-att', monthKey, nightRate, dept],
    queryFn: () => api.get('/attendance', {
      params: { month_key: monthKey, night_allowance_rate: nightRate, department: dept || undefined },
    }).then((r) => r.data),
  });

  const { data: salariesData, isLoading: loadingSal } = useQuery({
    queryKey: ['payroll-sal', monthKey],
    queryFn: () => api.get('/salaries/base', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  const { data: advancesData = [] } = useQuery({
    queryKey: ['payroll-adv', monthKey],
    queryFn: () => api.get('/salaries/advances', { params: { month_key: monthKey } }).then((r) => r.data),
  });

  const { data: empList = [] } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => api.get('/employees', { params: { page_size: 500 } }).then((r) => r.data?.items || r.data || []),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/employees/departments').then((r) => r.data),
  });

  const payrollRows = useMemo(() => {
    if (!att || !salariesData) return [];
    const standardDays = salariesData.standard_days || 26;

    const salMap = {};
    for (const s of salariesData.rows || []) {
      salMap[s.employee_code] = s;
    }
    const advMap = {};
    for (const a of advancesData) {
      advMap[a.employee_id] = a.total_advance || 0;
    }
    const empMap = {};
    for (const e of empList) {
      empMap[e.id] = e;
    }

    return (att.rows || []).map((row) => {
      const sal = salMap[row.employee_code] || {};
      const emp = empMap[row.employee_id] || {};
      const base_salary = sal.base_salary || 0;
      const fixed_allowance = sal.allowance || 0;
      const dependents = emp.dependents ?? 0;
      const summary = row.summary || {};

      const actual_days = summary.total_present || 0;
      const ot_wd = summary.total_ot_weekday ?? (summary.total_ot || 0);
      const ot_sun = summary.total_ot_sunday ?? 0;
      const ot_hol = summary.total_ot_holiday ?? 0;
      const meal_allowance = summary.total_meal_allowance || 0;
      const night_allowance = summary.total_night_allowance || 0;
      const advance = advMap[row.employee_id] || 0;

      const daily_rate = standardDays > 0 ? base_salary / standardDays : 0;
      const hourly_rate = daily_rate / 8;

      const salary_from_days = Math.round(actual_days * daily_rate);
      const ot_pay_wd = Math.round(ot_wd * hourly_rate * 1.5);
      const ot_pay_sun = Math.round(ot_sun * hourly_rate * 2.0);
      const ot_pay_hol = Math.round(ot_hol * hourly_rate * 3.0);
      const ot_pay = ot_pay_wd + ot_pay_sun + ot_pay_hol;

      // meal_allowance phát tiền mặt riêng, không tính vào lương chuyển khoản
      const gross = salary_from_days + ot_pay + fixed_allowance + night_allowance;
      const bhxh = Math.round(base_salary * 0.105);
      const union_fee = Math.round(base_salary * 0.01);
      const taxable = Math.max(0, gross - bhxh - 11_000_000 - dependents * 4_400_000);
      const tncn = calcTNCN(taxable);
      const total_deductions = bhxh + union_fee + tncn + advance;
      const net = Math.round(gross - bhxh - union_fee - tncn - advance);

      return {
        key: row.employee_id,
        employee_id: row.employee_id,
        employee_code: row.employee_code,
        full_name: row.full_name,
        department: row.department,
        dependents,
        base_salary,
        fixed_allowance,
        standard_days: standardDays,
        actual_days,
        ot_wd, ot_sun, ot_hol,
        meal_allowance, night_allowance,
        salary_from_days, ot_pay_wd, ot_pay_sun, ot_pay_hol, ot_pay,
        gross, bhxh, union_fee, taxable, tncn, advance,
        total_deductions, net,
      };
    });
  }, [att, salariesData, advancesData, empList]);

  const totals = useMemo(() => {
    const sum = (key) => payrollRows.reduce((s, r) => s + (r[key] || 0), 0);
    return {
      gross: sum('gross'), salary_from_days: sum('salary_from_days'),
      ot_pay: sum('ot_pay'), fixed_allowance: sum('fixed_allowance'),
      meal_allowance: sum('meal_allowance'), night_allowance: sum('night_allowance'),
      bhxh: sum('bhxh'), union_fee: sum('union_fee'), tncn: sum('tncn'),
      advance: sum('advance'), net: sum('net'),
    };
  }, [payrollRows]);

  const columns = [
    {
      title: 'Mã NV',
      dataIndex: 'employee_code',
      width: 70,
      fixed: 'left',
      render: (v) => <span style={{ fontWeight: 600, color: '#276EF1', fontSize: 12 }}>{v}</span>,
    },
    {
      title: 'Họ tên',
      dataIndex: 'full_name',
      width: 160,
      fixed: 'left',
      render: (v, r) => (
        <div style={{ cursor: 'pointer' }} onClick={() => setPayslipRow(r)}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
          {r.department && <div style={{ fontSize: 10, color: '#9ca3af' }}>{r.department}</div>}
        </div>
      ),
    },
    {
      title: 'L.Cơ bản',
      dataIndex: 'base_salary',
      width: 110,
      render: (v) => <span style={{ fontSize: 12 }}>{fmt(v)}</span>,
    },
    {
      title: 'NC (TT/TC)',
      width: 90,
      render: (_, r) => (
        <span style={{ fontSize: 12 }}>
          <b>{r.actual_days}</b>/<span style={{ color: '#9ca3af' }}>{r.standard_days}</span>
        </span>
      ),
    },
    {
      title: 'Lương NC',
      dataIndex: 'salary_from_days',
      width: 110,
      render: (v) => <span style={{ fontSize: 12 }}>{fmt(v)}</span>,
    },
    {
      title: 'Tăng ca',
      width: 100,
      render: (_, r) => {
        const total = r.ot_pay;
        if (!total) return <span style={{ color: '#d1d5db' }}>–</span>;
        return (
          <Tooltip title={
            <div>
              <div>TC thường ({r.ot_wd}h): {fmt(r.ot_pay_wd)}</div>
              {r.ot_sun > 0 && <div>TC CN ({r.ot_sun}h): {fmt(r.ot_pay_sun)}</div>}
              {r.ot_hol > 0 && <div>TC Lễ ({r.ot_hol}h): {fmt(r.ot_pay_hol)}</div>}
            </div>
          }>
            <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>{fmt(total)}</span>
          </Tooltip>
        );
      },
    },
    {
      title: 'P.Cấp',
      dataIndex: 'fixed_allowance',
      width: 95,
      render: (v) => v ? <span style={{ fontSize: 12 }}>{fmt(v)}</span> : <span style={{ color: '#d1d5db' }}>–</span>,
    },
    {
      title: 'Tiền ăn',
      dataIndex: 'meal_allowance',
      width: 95,
      render: (v) => v ? <span style={{ fontSize: 12, color: '#10b981' }}>{fmt(v)}</span> : <span style={{ color: '#d1d5db' }}>–</span>,
    },
    {
      title: 'PC đêm',
      dataIndex: 'night_allowance',
      width: 90,
      render: (v) => v ? <span style={{ fontSize: 12, color: '#7c3aed' }}>{fmt(v)}</span> : <span style={{ color: '#d1d5db' }}>–</span>,
    },
    {
      title: 'TỔNG GỘP',
      dataIndex: 'gross',
      width: 120,
      render: (v) => <span style={{ fontWeight: 700, fontSize: 12, color: '#1e40af' }}>{fmt(v)}</span>,
    },
    {
      title: 'BHXH',
      dataIndex: 'bhxh',
      width: 100,
      render: (v) => <span style={{ fontSize: 12, color: '#ef4444' }}>{fmt(v)}</span>,
    },
    {
      title: 'Công đoàn',
      dataIndex: 'union_fee',
      width: 90,
      render: (v) => v ? <span style={{ fontSize: 12, color: '#f59e0b' }}>{fmt(v)}</span> : <span style={{ color: '#d1d5db' }}>–</span>,
    },
    {
      title: 'TNCN',
      dataIndex: 'tncn',
      width: 100,
      render: (v, r) => (
        <Tooltip title={r.taxable > 0 ? `Thu nhập chịu thuế: ${fmt(r.taxable)}đ` : 'Không đủ ngưỡng thuế'}>
          {v ? <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>{fmt(v)}</span> : <Tag color="default" style={{ fontSize: 10 }}>Miễn</Tag>}
        </Tooltip>
      ),
    },
    {
      title: 'Người PT',
      dataIndex: 'dependents',
      width: 80,
      render: (v) => <Tag color={v > 0 ? 'blue' : 'default'} style={{ fontSize: 10 }}>{v} người</Tag>,
    },
    {
      title: 'Tạm ứng',
      dataIndex: 'advance',
      width: 95,
      render: (v) => v ? <span style={{ fontSize: 12, color: '#f97316' }}>{fmt(v)}</span> : <span style={{ color: '#d1d5db' }}>–</span>,
    },
    {
      title: 'THỰC LĨNH',
      dataIndex: 'net',
      width: 120,
      fixed: 'right',
      render: (v) => <span style={{ fontWeight: 800, fontSize: 13, color: '#059669' }}>{fmt(v)}</span>,
    },
    {
      title: '',
      width: 50,
      fixed: 'right',
      render: (_, r) => (
        <Tooltip title="Xem phiếu lương">
          <Button size="small" icon={<PrinterOutlined />} onClick={() => setPayslipRow(r)} />
        </Tooltip>
      ),
    },
  ];

  const isLoading = loadingAtt || loadingSal;

  return (
    <div className="att-page">
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <h2 className="emp-title">Bảng lương tháng {dayjs(monthKey).format('MM/YYYY')}</h2>
          <div className="emp-stats">
            <div className="emp-stat-chip"><b style={{ color: '#1e40af' }}>{fmt(totals.gross)}</b> đ tổng gộp</div>
            <div className="emp-stat-chip"><b style={{ color: '#ef4444' }}>{fmt(totals.bhxh)}</b> đ BHXH</div>
            <div className="emp-stat-chip"><b style={{ color: '#ef4444' }}>{fmt(totals.tncn)}</b> đ TNCN</div>
            <div className="emp-stat-chip" style={{ fontWeight: 700, color: '#059669' }}><b>{fmt(totals.net)}</b> đ thực lĩnh</div>
          </div>
        </div>
      </div>

      <div className="emp-filterbar">
        <DatePicker
          picker="month"
          value={dayjs(monthKey)}
          onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
          format="MM/YYYY"
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b7280' }}>
          <span>PC đêm:</span>
          <InputNumber
            value={nightRate}
            onChange={(v) => { if (v != null) { setNightRate(v); localStorage.setItem('nightAllowanceRate', v); } }}
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(v) => v.replace(/,/g, '')}
            min={0} step={10000} size="middle" style={{ width: 130 }}
          />
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
          Nhấp tên nhân viên để xem phiếu lương
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : (
        <div className="ma-table-card">
          <Table
            dataSource={payrollRows}
            columns={columns}
            scroll={{ x: 1600 }}
            size="small"
            pagination={false}
            bordered
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ background: '#f0f4ff', fontWeight: 700 }}>
                  <Table.Summary.Cell index={0} colSpan={2} fixed="left">TỔNG CỘNG ({payrollRows.length} NV)</Table.Summary.Cell>
                  <Table.Summary.Cell index={2}>{fmt(payrollRows.reduce((s,r)=>s+r.base_salary,0))}</Table.Summary.Cell>
                  <Table.Summary.Cell index={3} />
                  <Table.Summary.Cell index={4}>{fmt(totals.salary_from_days)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={5}>{fmt(totals.ot_pay)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={6}>{fmt(totals.fixed_allowance)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={7}><span style={{color:'#10b981'}}>{fmt(totals.meal_allowance)}</span></Table.Summary.Cell>
                  <Table.Summary.Cell index={8}><span style={{color:'#7c3aed'}}>{fmt(totals.night_allowance)}</span></Table.Summary.Cell>
                  <Table.Summary.Cell index={9}><span style={{color:'#1e40af',fontWeight:800}}>{fmt(totals.gross)}</span></Table.Summary.Cell>
                  <Table.Summary.Cell index={10}><span style={{color:'#ef4444'}}>{fmt(totals.bhxh)}</span></Table.Summary.Cell>
                  <Table.Summary.Cell index={11}>{fmt(totals.union_fee)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={12}><span style={{color:'#ef4444'}}>{fmt(totals.tncn)}</span></Table.Summary.Cell>
                  <Table.Summary.Cell index={13} />
                  <Table.Summary.Cell index={14}>{fmt(totals.advance)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={15} fixed="right"><span style={{color:'#059669',fontWeight:800}}>{fmt(totals.net)}</span></Table.Summary.Cell>
                  <Table.Summary.Cell index={16} fixed="right" />
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </div>
      )}

      <PaySlip row={payslipRow} monthKey={monthKey} onClose={() => setPayslipRow(null)} />
    </div>
  );
}
