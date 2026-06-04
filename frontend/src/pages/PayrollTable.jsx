import { useState, useMemo, useRef } from 'react';
import { DatePicker, Select, Spin, Button, Modal, Tag, Tooltip, InputNumber, message, Table, Input, Checkbox, Upload } from 'antd';
import {
  PrinterOutlined, DownloadOutlined, TeamOutlined, DollarOutlined,
  UserOutlined, BankOutlined, SafetyCertificateOutlined, EditOutlined, SearchOutlined,
  UploadOutlined, FileExcelOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import useMonthStore from '../stores/monthStore';
import './PayrollOvertime.css';

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
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const isWorker = user?.role === 'worker';
  const isAccountant = user?.role === 'accountant';
  const canApprove = isAdmin || isAccountant;
  const { monthKey, setMonthKey } = useMonthStore();
  const [nightRate, setNightRate] = useState(() => Number(localStorage.getItem('nightAllowanceRate')) || 100000);
  const [dept, setDept] = useState(null);
  const [search, setSearch] = useState('');
  const [payslipRow, setPayslipRow] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [editValue, setEditValue] = useState(null);
  const queryClient = useQueryClient();

  const otStyle = localStorage.getItem('otCalculationStyle') || 'old';

  const [otModalOpen, setOtModalOpen] = useState(false);
  const [actualOtData, setActualOtData] = useState([]);
  const [loadingActualOt, setLoadingActualOt] = useState(false);
  const [approvedOtMap, setApprovedOtMap] = useState({});
  const [otSearchText, setOtSearchText] = useState('');
  const [savingOt, setSavingOt] = useState(false);

  const { data: att, isLoading: loadingAtt } = useQuery({
    queryKey: ['payroll-att', monthKey, nightRate, dept, otStyle],
    queryFn: () => api.get('/attendance', {
      params: {
        month_key: monthKey,
        night_allowance_rate: nightRate,
        department: dept || undefined,
        ot_style: otStyle,
      },
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

  const { data: departmentsList = [] } = useQuery({
    queryKey: ['departments_list'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });
  const departments = departmentsList.map((d) => d.name);

  const deptOrderMap = useMemo(() => {
    const map = {};
    departmentsList.forEach((d, idx) => {
      map[d.name] = idx;
    });
    return map;
  }, [departmentsList]);

  const isLocked = salariesData?.is_locked || false;

  const updateSalaryMut = useMutation({
    mutationFn: ({ employee_id, base_salary }) =>
      api.put('/salaries/base', { employee_id, month_key: monthKey, base_salary }),
    onSuccess: (res) => {
      message.success(res.data?.message || 'Đã cập nhật lương');
      queryClient.invalidateQueries({ queryKey: ['payroll-sal', monthKey] });
      setEditingKey(null);
      setEditValue(null);
    },
    onError: (err) => {
      message.error(err.response?.data?.detail || 'Lỗi cập nhật lương');
    },
  });

  const handleSaveSalary = (employeeId, originalValue) => {
    if (editValue == null || editValue < 0) {
      setEditingKey(null);
      setEditValue(null);
      return;
    }
    // Không gọi API nếu giá trị không thay đổi
    if (editValue === originalValue) {
      setEditingKey(null);
      setEditValue(null);
      return;
    }
    updateSalaryMut.mutate({ employee_id: employeeId, base_salary: editValue });
  };

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

    const rows = (att.rows || []).map((row) => {
      const sal = salMap[row.employee_code] || {};
      const emp = empMap[row.employee_id] || {};
      const base_salary = sal.base_salary || 0;
      const fixed_allowance = sal.allowance || 0;
      const dependents = emp.dependents ?? 0;
      const summary = row.summary || {};

      const actual_days = (summary.total_present || 0) + (summary.total_paid_leave || 0);
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
        total_paid_leave: summary.total_paid_leave || 0,
        ot_wd, ot_sun, ot_hol,
        meal_allowance, night_allowance,
        salary_from_days, ot_pay_wd, ot_pay_sun, ot_pay_hol, ot_pay,
        gross, bhxh, union_fee, taxable, tncn, advance,
        total_deductions, net,
      };
    });

    const filtered = rows.filter(item => {
      if (search) {
        const s = search.toLowerCase().trim();
        const codeMatch = item.employee_code?.toLowerCase().includes(s);
        const nameMatch = item.full_name?.toLowerCase().includes(s);
        return codeMatch || nameMatch;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      const orderA = deptOrderMap[a.department] !== undefined ? deptOrderMap[a.department] : 9999;
      const orderB = deptOrderMap[b.department] !== undefined ? deptOrderMap[b.department] : 9999;
      if (orderA !== orderB) return orderA - orderB;
      return (a.employee_code || '').localeCompare(b.employee_code || '', undefined, { numeric: true });
    });
  }, [att, salariesData, advancesData, empList, search, deptOrderMap]);

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
      sorter: (a, b) => Number(a.employee_code || 0) - Number(b.employee_code || 0),
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
      sorter: (a, b) => {
        const orderA = deptOrderMap[a.department] !== undefined ? deptOrderMap[a.department] : 9999;
        const orderB = deptOrderMap[b.department] !== undefined ? deptOrderMap[b.department] : 9999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.full_name || '').localeCompare(b.full_name || '', 'vi');
      },
    },
    {
      title: 'L.Cơ bản',
      dataIndex: 'base_salary',
      width: 130,
      sorter: (a, b) => (a.base_salary || 0) - (b.base_salary || 0),
      render: (v, r) => {
        if (editingKey === r.employee_id) {
          return (
            <InputNumber
              autoFocus
              size="small"
              value={editValue}
              onChange={setEditValue}
              onPressEnter={() => handleSaveSalary(r.employee_id, v)}
              onBlur={() => handleSaveSalary(r.employee_id, v)}
              formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(val) => val.replace(/,/g, '')}
              min={0}
              step={100000}
              style={{ width: 120 }}
              status={updateSalaryMut.isPending ? 'warning' : undefined}
            />
          );
        }
        return (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              cursor: isAdmin && !isLocked ? 'pointer' : 'default',
            }}
            onClick={() => {
              if (isAdmin && !isLocked) {
                setEditingKey(r.employee_id);
                setEditValue(v);
              }
            }}
          >
            <span style={{ fontSize: 12 }}>{fmt(v)}</span>
            {isAdmin && !isLocked && (
              <EditOutlined style={{ fontSize: 10, color: '#9ca3af', opacity: 0.5 }} />
            )}
          </div>
        );
      },
    },
    {
      title: 'NC (TT/TC)',
      width: 90,
      render: (_, r) => (
        <Tooltip title={
          <div>
            <div>Đi làm thực tế: {r.actual_days - (r.total_paid_leave || 0)} ngày</div>
            {r.total_paid_leave > 0 && <div>Nghỉ phép có lương: {r.total_paid_leave} ngày</div>}
          </div>
        }>
          <span style={{ fontSize: 12 }}>
            <b>{r.actual_days}</b>/<span style={{ color: '#9ca3af' }}>{r.standard_days}</span>
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Lương NC',
      dataIndex: 'salary_from_days',
      width: 110,
      render: (v) => <span style={{ fontSize: 12 }}>{fmt(v)}</span>,
      sorter: (a, b) => (a.salary_from_days || 0) - (b.salary_from_days || 0),
    },
    {
      title: 'Tăng ca',
      width: 100,
      sorter: (a, b) => (a.ot_pay || 0) - (b.ot_pay || 0),
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
      sorter: (a, b) => (a.fixed_allowance || 0) - (b.fixed_allowance || 0),
    },
    {
      title: 'Tiền ăn',
      dataIndex: 'meal_allowance',
      width: 95,
      render: (v) => v ? <span style={{ fontSize: 12, color: '#10b981' }}>{fmt(v)}</span> : <span style={{ color: '#d1d5db' }}>–</span>,
      sorter: (a, b) => (a.meal_allowance || 0) - (b.meal_allowance || 0),
    },
    {
      title: 'PC đêm',
      dataIndex: 'night_allowance',
      width: 90,
      render: (v) => v ? <span style={{ fontSize: 12, color: '#7c3aed' }}>{fmt(v)}</span> : <span style={{ color: '#d1d5db' }}>–</span>,
      sorter: (a, b) => (a.night_allowance || 0) - (b.night_allowance || 0),
    },
    {
      title: 'TỔNG GỘP',
      dataIndex: 'gross',
      width: 120,
      render: (v) => <span style={{ fontWeight: 700, fontSize: 12, color: '#1e40af' }}>{fmt(v)}</span>,
      sorter: (a, b) => (a.gross || 0) - (b.gross || 0),
    },
    {
      title: 'BHXH',
      dataIndex: 'bhxh',
      width: 100,
      render: (v) => <span style={{ fontSize: 12, color: '#ef4444' }}>{fmt(v)}</span>,
      sorter: (a, b) => (a.bhxh || 0) - (b.bhxh || 0),
    },
    {
      title: 'Công đoàn',
      dataIndex: 'union_fee',
      width: 90,
      render: (v) => v ? <span style={{ fontSize: 12, color: '#f59e0b' }}>{fmt(v)}</span> : <span style={{ color: '#d1d5db' }}>–</span>,
      sorter: (a, b) => (a.union_fee || 0) - (b.union_fee || 0),
    },
    {
      title: 'TNCN',
      dataIndex: 'tncn',
      width: 100,
      sorter: (a, b) => (a.tncn || 0) - (b.tncn || 0),
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
      sorter: (a, b) => (a.advance || 0) - (b.advance || 0),
    },
    {
      title: 'THỰC LĨNH',
      dataIndex: 'net',
      width: 120,
      fixed: 'right',
      render: (v) => <span style={{ fontWeight: 800, fontSize: 13, color: '#059669' }}>{fmt(v)}</span>,
      sorter: (a, b) => (a.net || 0) - (b.net || 0),
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

  const empCodeToIdMap = useMemo(() => {
    const map = {};
    empList.forEach(e => {
      map[String(e.employee_code).trim()] = e.id;
    });
    return map;
  }, [empList]);

  const parseDateStr = (dateStr) => {
    if (!dateStr) return '';
    const [d, m, y] = dateStr.split('/');
    return `${y}-${m}-${d}`;
  };

  const openOtApprovalModal = async () => {
    setOtModalOpen(true);
    setLoadingActualOt(true);
    try {
      const [resActual, resConfig] = await Promise.all([
        api.get('/overtime/actual-ot', { params: { month_key: monthKey } }),
        api.get('/schedules/x-overtime', { params: { month_key: monthKey } })
      ]);
      
      const actualRows = resActual.data.rows || [];
      const savedConfigs = resConfig.data || [];
      
      const configMap = {};
      savedConfigs.forEach(c => {
        configMap[`${c.employee_id}_${c.work_date}`] = c;
      });
      
      const initialMap = {};
      actualRows.forEach(row => {
        const empId = empCodeToIdMap[String(row.employee_code).trim()];
        const dbDate = parseDateStr(row.work_date);
        const key = `${row.employee_code}_${dbDate}`;
        
        const saved = configMap[`${empId}_${dbDate}`];
        if (saved && Number(saved.ot_hours) > 0) {
          initialMap[key] = {
            approved: true,
            ot_hours: Number(saved.ot_hours),
            meal_count: saved.meal_count || 0,
            ot_end_time: saved.ot_end_time || null,
          };
        } else {
          initialMap[key] = {
            approved: false,
            ot_hours: Number(row.ot_hours),
            meal_count: 0,
            ot_end_time: null,
          };
        }
      });
      
      setActualOtData(actualRows);
      setApprovedOtMap(initialMap);
    } catch (err) {
      message.error('Lỗi tải dữ liệu tăng ca: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoadingActualOt(false);
    }
  };

  const handleToggleApprove = (key, checked, actualHours) => {
    setApprovedOtMap(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        approved: checked,
        ot_hours: checked ? (prev[key]?.ot_hours || actualHours) : 0,
      }
    }));
  };

  const handleHoursChange = (key, val) => {
    setApprovedOtMap(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        ot_hours: val || 0,
      }
    }));
  };

  const handleSaveOtBatch = async () => {
    setSavingOt(true);
    try {
      const payload = Object.entries(approvedOtMap).map(([key, state]) => {
        const [empCode, workDate] = key.split('_');
        const empId = empCodeToIdMap[empCode];
        return {
          employee_id: empId,
          work_date: workDate,
          ot_hours: state.approved ? state.ot_hours : 0,
          meal_count: state.approved ? state.meal_count : 0,
          ot_end_time: state.approved ? state.ot_end_time : null
        };
      }).filter(item => item.employee_id);

      await api.put('/schedules/x-overtime/batch', payload);
      message.success('Đã lưu phê duyệt tăng ca');
      queryClient.invalidateQueries({ queryKey: ['payroll-att'] });
      setOtModalOpen(false);
    } catch (err) {
      message.error('Lỗi lưu phê duyệt: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingOt(false);
    }
  };

  const handleExportOtTemplate = async () => {
    try {
      const response = await api.get('/overtime/actual-ot/export', {
        params: { month_key: monthKey },
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `OT_thuc_te_${monthKey}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      message.error('Lỗi tải file mẫu: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleUploadExcel = async ({ file, onSuccess, onError }) => {
    const formData = new FormData();
    formData.append('month_key', monthKey);
    formData.append('file', file);
    try {
      const res = await api.post('/schedules/x-overtime/import-actual', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      message.success(res.data?.message || 'Import thành công');
      queryClient.invalidateQueries({ queryKey: ['payroll-att'] });
      openOtApprovalModal();
      onSuccess();
    } catch (err) {
      message.error('Lỗi import: ' + (err.response?.data?.detail || err.message));
      onError(err);
    }
  };

  const filteredOtData = useMemo(() => {
    if (!otSearchText) return actualOtData;
    const s = otSearchText.toLowerCase().trim();
    return actualOtData.filter(r => 
      r.employee_code?.toLowerCase().includes(s) || 
      r.full_name?.toLowerCase().includes(s)
    );
  }, [actualOtData, otSearchText]);

  const otColumns = [
    {
      title: 'Mã NV',
      dataIndex: 'employee_code',
      width: 70,
      fixed: 'left',
      render: (v) => <span style={{ fontWeight: 600, color: '#276EF1' }}>{v}</span>,
    },
    {
      title: 'Họ tên',
      dataIndex: 'full_name',
      width: 140,
      fixed: 'left',
      render: (v) => <span style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: 'Ngày',
      dataIndex: 'work_date',
      width: 90,
    },
    {
      title: 'Thứ',
      dataIndex: 'weekday',
      width: 50,
      align: 'center',
    },
    {
      title: 'Giờ ca',
      dataIndex: 'shift_hours',
      width: 110,
    },
    {
      title: 'Giờ vào',
      dataIndex: 'check_in',
      width: 70,
      align: 'center',
    },
    {
      title: 'Giờ ra',
      dataIndex: 'check_out',
      width: 70,
      align: 'center',
    },
    {
      title: 'OT thực tế',
      dataIndex: 'ot_hours',
      width: 90,
      align: 'center',
      render: (v) => <span style={{ fontWeight: 600, color: '#4b5563' }}>{v}</span>,
    },
    {
      title: 'Duyệt',
      width: 60,
      align: 'center',
      fixed: 'right',
      render: (_, r) => {
        const dbDate = parseDateStr(r.work_date);
        const key = `${r.employee_code}_${dbDate}`;
        const state = approvedOtMap[key] || { approved: false, ot_hours: r.ot_hours };
        return (
          <Checkbox 
            checked={state.approved} 
            onChange={(e) => handleToggleApprove(key, e.target.checked, r.ot_hours)}
          />
        );
      }
    },
    {
      title: 'Giờ duyệt',
      width: 100,
      align: 'center',
      fixed: 'right',
      render: (_, r) => {
        const dbDate = parseDateStr(r.work_date);
        const key = `${r.employee_code}_${dbDate}`;
        const state = approvedOtMap[key] || { approved: false, ot_hours: r.ot_hours };
        return (
          <InputNumber
            size="small"
            min={0}
            max={24}
            step={0.5}
            disabled={!state.approved}
            value={state.approved ? state.ot_hours : undefined}
            onChange={(val) => handleHoursChange(key, val)}
            style={{ width: 80 }}
          />
        );
      }
    }
  ];

  const getOtRowClassName = (record) => {
    const classes = [];
    if (record.is_sunday) {
      classes.push('ot-row-sunday');
    }
    const dbDate = parseDateStr(record.work_date);
    const key = `${record.employee_code}_${dbDate}`;
    const state = approvedOtMap[key];
    if (state && state.approved) {
      classes.push('ot-approved-row');
    }
    return classes.join(' ');
  };

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
        {!isWorker && (
          <>
            <Select
              placeholder="Bộ phận"
              allowClear
              style={{ width: 150 }}
              value={dept}
              onChange={setDept}
              options={departmentsList.map((d) => ({ value: d.name, label: d.name }))}
              suffixIcon={<TeamOutlined style={{ color: '#9ca3af' }} />}
              size="middle"
            />
            <Input
              placeholder="Tìm mã NV, họ tên..."
              prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
              style={{ width: 200 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              allowClear
              size="middle"
            />
          </>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b7280' }}>
          <span>PC đêm:</span>
          <InputNumber
            value={nightRate}
            disabled={isWorker}
            onChange={(v) => { if (v != null) { setNightRate(v); localStorage.setItem('nightAllowanceRate', v); } }}
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(v) => v.replace(/,/g, '')}
            min={0} step={10000} size="middle" style={{ width: 130 }}
          />
        </div>
        {canApprove && (
          <Button
            type="primary"
            onClick={openOtApprovalModal}
            style={{ background: '#059669', borderColor: '#059669' }}
            size="middle"
          >
            Duyệt tăng ca thực tế
          </Button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
          {isWorker ? 'Nhấp dòng lương để xem/in phiếu chi tiết' : 'Nhấp tên nhân viên để xem phiếu lương'}
          {isAdmin && !isLocked && <span style={{ marginLeft: 8, color: '#6366f1' }}>· Nhấp L.Cơ bản để sửa</span>}
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
            summary={() => isWorker ? null : (
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

      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircleOutlined style={{ color: '#059669' }} />Duyệt tăng ca thực tế tháng {dayjs(monthKey).format('MM/YYYY')}</div>}
        open={otModalOpen}
        onCancel={() => setOtModalOpen(false)}
        width={1000}
        centered
        footer={[
          <Button key="cancel" onClick={() => setOtModalOpen(false)}>Hủy</Button>,
          <Button key="save" type="primary" style={{ background: '#059669', borderColor: '#059669' }} loading={savingOt} onClick={handleSaveOtBatch}>Lưu tất cả</Button>
        ]}
      >
        <div className="ot-modal-filterbar">
          <Input
            placeholder="Tìm mã NV, họ tên..."
            prefix={<SearchOutlined style={{ color: '#9ca3af' }} />}
            value={otSearchText}
            onChange={(e) => setOtSearchText(e.target.value)}
            allowClear
            className="ot-modal-search"
            size="middle"
          />
          <div className="ot-modal-actions">
            <Button icon={<DownloadOutlined />} onClick={handleExportOtTemplate} size="middle">
              Tải file mẫu Excel
            </Button>
            <Upload
              customRequest={handleUploadExcel}
              showUploadList={false}
              accept=".xlsx,.xls"
            >
              <Button type="dashed" icon={<UploadOutlined />} size="middle">Import Excel duyệt nhanh</Button>
            </Upload>
          </div>
        </div>
        
        <div className="ot-table-container">
          <Table
            dataSource={filteredOtData}
            columns={otColumns}
            rowKey={(r) => `${r.employee_code}_${parseDateStr(r.work_date)}`}
            rowClassName={getOtRowClassName}
            pagination={false}
            scroll={{ y: 380, x: 900 }}
            size="small"
            loading={loadingActualOt}
            bordered
          />
        </div>
      </Modal>
    </div>
  );
}
