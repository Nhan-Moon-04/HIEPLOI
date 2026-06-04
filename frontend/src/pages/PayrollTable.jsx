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
      body{font-family:Arial,sans-serif;font-size:12px;padding:20px;color:#000;background-color:#fff;}
      table{width:100%;border-collapse:collapse;border:2px solid #000;color:#000;background:#fff;}
      td{padding:6px 8px;border:1px solid #000;font-size:12px;}
      .text-center{text-align:center;}
      .text-right{text-align:right;}
      .font-bold{font-weight:bold;}
    </style></head><body>${content}</body></html>`);
    win.document.close();
    win.print();
  };

  const r = row;
  const lastDayStr = dayjs(monthKey).endOf('month').format('DD/MM/YYYY');
  const monthYearStr = dayjs(monthKey).format('M/YYYY');

  const fmtVal = (val) => {
    if (val === undefined || val === null || val === 0 || val === '' || val === '0' || val === '-') {
      return '-';
    }
    return Math.round(val).toLocaleString('vi-VN');
  };

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
      <div ref={printRef} style={{ padding: '10px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', color: '#000', backgroundColor: '#fff' }}>
          <tbody>
            {/* Header Block */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', backgroundColor: '#ffff00', width: '30%', fontSize: '13px' }}>Bảng lương</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', backgroundColor: '#ffff00', textAlign: 'center', width: '40%', fontSize: '13px' }}>{lastDayStr}</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', backgroundColor: '#ffff00', textAlign: 'center', width: '30%', fontSize: '13px' }}>THÁNG {monthYearStr}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', fontSize: '13px' }}>
                HỌ TÊN :<br/>
                <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#333' }}>姓名 :</span>
              </td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', textAlign: 'center', fontSize: '14px' }}>{r.full_name}</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', textAlign: 'center', fontSize: '14px' }}>{r.employee_code}</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', fontSize: '13px' }}>
                CHỨC VỤ :<br/>
                <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#333' }}>職位 :</span>
              </td>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', textAlign: 'center', fontSize: '13px' }}>
                {r.department || '-'}
              </td>
            </tr>
            
            {/* Base Salary */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>基本薪資</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Lương căn bản</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right', fontWeight: 'bold' }}>{fmtVal(r.base_salary)}</td>
            </tr>
            {/* Working Days */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>考勤日</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Ngày đi làm</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}>{fmtVal(r.actual_days - r.total_paid_leave)}</td>
            </tr>
            {/* Used Paid Leaves */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>本月休年假天數</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Số ngày phép sử dụng tháng</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}>{r.total_paid_leave > 0 ? r.total_paid_leave.toFixed(2) : '-'}</td>
            </tr>
            {/* Leave Remaining (purple background) */}
            <tr style={{ backgroundColor: '#e2dbf0' }}>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>年假存</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Số ngày Phép năm tồn</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}>-</td>
            </tr>
            {/* Total Workdays of the month */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>本月上班日數</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Tổng Ngày công tháng</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right', fontWeight: 'bold' }}>{fmtVal(r.actual_days)}</td>
            </tr>
            {/* Salary from days */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>考勤金額</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>LƯƠNG NGÀY CÔNG THÁNG</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right', fontWeight: 'bold' }}>{fmtVal(r.salary_from_days)}</td>
            </tr>
            {/* Regular OT hours */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>加班時間</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Tổng giờ tăng ca thường</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}>{r.ot_wd > 0 ? r.ot_wd : '-'}</td>
            </tr>
            {/* Regular OT Pay */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>加班平常</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Tăng ca ngày thường (*1.5)</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}>{fmtVal(r.ot_pay_wd)}</td>
            </tr>
            {/* Sunday OT Hours */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>加班時間</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Tổng giờ tăng ca Chủ nhật</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}>{r.ot_sun > 0 ? r.ot_sun : '-'}</td>
            </tr>
            {/* Sunday OT Pay */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>加班星期日</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Tăng ca ngày CN (*2)</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}>{fmtVal(r.ot_pay_sun)}</td>
            </tr>
            {/* Total OT Pay */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>共加班費</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Tổng tiền tăng ca</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right', fontWeight: 'bold' }}>{fmtVal(r.ot_pay)}</td>
            </tr>
            {/* Responsibility/Position Allowance */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>職務獎</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Bồi dưỡng chức vụ & trách nhiệm</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}>{fmtVal(r.fixed_allowance)}</td>
            </tr>
            {/* Child Allowance under 6 years (blank placeholder) */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}></td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Bồi dưỡng /Phụ cấp nuôi con nhỏ &lt; 6 tuổi</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}>-</td>
            </tr>
            {/* Petrol & Phone Allowance (blank placeholder) */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>考勤薪資</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Tiền xăng & điện thoại, Thưởng</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}>-</td>
            </tr>
            {/* Lunch Allowance (blank placeholder) */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>餐費</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Tiền cơm</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}>-</td>
            </tr>
            {/* Diligent Allowance (blank placeholder) */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>考勤薪資</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Tiền chuyên cần</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}>-</td>
            </tr>
            {/* Night Allowance (if > 0, show it) */}
            {r.night_allowance > 0 && (
              <tr>
                <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}></td>
                <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Phụ cấp ca đêm</td>
                <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right' }}>{fmtVal(r.night_allowance)}</td>
              </tr>
            )}
            
            {/* Gross Salary (yellow background) */}
            <tr style={{ backgroundColor: '#ffff00' }}>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>合計薪資</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>TỔNG LƯƠNG</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right', fontWeight: 'bold' }}>{fmtVal(r.gross)}</td>
            </tr>
            
            {/* Deductions */}
            {/* Social Insurance */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>醫療保險</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Trừ BHXH*10.5%</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right', color: '#ef4444' }}>{fmtVal(r.bhxh)}</td>
            </tr>
            {/* Union Fee */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>工團費</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Tiền công đoàn</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right', color: '#ef4444' }}>{fmtVal(r.union_fee)}</td>
            </tr>
            {/* Income Tax */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>個人所得稅</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>Thuế TNCN</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right', color: '#ef4444' }}>{fmtVal(r.tncn)}</td>
            </tr>
            {/* Advance Payment (pink background) */}
            <tr style={{ backgroundColor: '#f5e0e0' }}>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}></td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px' }}>TRỪ TIỀN TẠM ỨNG</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '13px', textAlign: 'right', color: '#ef4444' }}>{fmtVal(r.advance)}</td>
            </tr>
            
            {/* Net Salary (yellow background) */}
            <tr style={{ backgroundColor: '#ffff00' }}>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>實領金額</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '12px', fontWeight: 'bold' }}>LƯƠNG THỰC LÃNH</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '14px', textAlign: 'right', fontWeight: '800', color: '#1d4ed8' }}>{fmtVal(r.net)}</td>
            </tr>
            
            {/* Signature Row */}
            <tr>
              <td style={{ border: '1px solid #000', padding: '12px 8px', fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}>
                簽名
              </td>
              <td colSpan={2} style={{ border: '1px solid #000', padding: '12px 8px', fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}>
                Ký nhận tiền ( ghi họ tên )
              </td>
            </tr>
          </tbody>
        </table>
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
          <h2 className="emp-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Bảng lương tháng {dayjs(monthKey).format('MM/YYYY')}
            <Tag color={otStyle === 'new' ? 'success' : 'default'} style={{ fontSize: 12, margin: 0 }}>
              OT: {otStyle === 'new' ? 'Duyệt thực tế (Kiểu mới)' : 'Tự động (Kiểu cũ)'}
            </Tag>
          </h2>
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
