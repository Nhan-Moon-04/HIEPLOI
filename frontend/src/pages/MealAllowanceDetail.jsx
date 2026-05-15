import React, { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeftOutlined,
  CalendarOutlined,
  DollarCircleOutlined,
  UserOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  PrinterOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  SearchOutlined,
  FilterOutlined,
  ArrowRightOutlined,
  PieChartOutlined,
  WarningOutlined,
  HistoryOutlined,
  CoffeeOutlined,
  MoonOutlined,
  HomeOutlined,
  TeamOutlined,
  SettingOutlined,
  AppstoreOutlined,
  BellOutlined,
  DoubleRightOutlined,
  SafetyCertificateOutlined,
  LayoutOutlined
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Spin, Button, Tag, Avatar, Tooltip, Input, Select, Dropdown, Menu } from 'antd';
import dayjs from 'dayjs';
import api from '../api/client';

// --- Sub-components ---

const Sidebar = () => (
  <aside className="fixed left-0 top-0 z-50 h-screen w-[72px] bg-slate-950 flex flex-col items-center py-6 gap-8 shrink-0">
    <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-xl shadow-lg shadow-indigo-500/20">
      <PieChartOutlined />
    </div>
    <div className="flex-1 flex flex-col gap-6">
      <SidebarItem icon={HomeOutlined} label="Dashboard" />
      <SidebarItem icon={TeamOutlined} label="Employees" active />
      <SidebarItem icon={AppstoreOutlined} label="Apps" />
      <SidebarItem icon={HistoryOutlined} label="History" />
      <SidebarItem icon={SettingOutlined} label="Settings" />
    </div>
    <div className="flex flex-col gap-6">
      <SidebarItem icon={BellOutlined} dot label="Notifications" />
      <Avatar icon={<UserOutlined />} className="bg-slate-800 cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all" />
    </div>
  </aside>
);

const SidebarItem = ({ icon: Icon, active, dot, label }) => (
  <Tooltip title={label} placement="right">
    <div className={`relative group cursor-pointer flex items-center justify-center h-10 w-10 rounded-xl transition-all ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-white hover:bg-slate-900'}`}>
      <Icon className="text-lg" />
      {dot && <div className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-slate-950" />}
    </div>
  </Tooltip>
);

const TopBar = ({ companyName, breadcrumbs }) => (
  <header className="sticky top-0 z-40 h-16 w-full bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
    <div className="flex items-center gap-6">
      <span className="text-sm font-black tracking-tight text-slate-950">{companyName}</span>
      <div className="h-4 w-px bg-slate-200" />
      <nav className="flex items-center gap-2">
        {breadcrumbs.map((item, idx) => (
          <React.Fragment key={idx}>
            <span className={`text-[11px] font-bold uppercase tracking-wider ${idx === breadcrumbs.length - 1 ? 'text-slate-950' : 'text-slate-300'}`}>
              {item}
            </span>
            {idx < breadcrumbs.length - 1 && <DoubleRightOutlined className="text-[10px] text-slate-200" />}
          </React.Fragment>
        ))}
      </nav>
    </div>

    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 mr-4">
        <Button size="small" type="text" icon={<FilePdfOutlined />} className="text-[11px] font-bold text-slate-500 hover:text-slate-900">PDF</Button>
        <Button size="small" type="text" icon={<FileExcelOutlined />} className="text-[11px] font-bold text-slate-500 hover:text-slate-900">Excel</Button>
        <Button size="small" type="text" icon={<PrinterOutlined />} className="text-[11px] font-bold text-slate-500 hover:text-slate-900">Print</Button>
      </div>
      <div className="flex items-center gap-3 pl-4 border-l border-slate-100">
         <div className="text-right">
           <p className="text-[11px] font-bold text-slate-950 leading-none">Admin</p>
           <p className="text-[9px] font-medium text-slate-400 mt-0.5">Manager</p>
         </div>
         <Avatar size="small" icon={<UserOutlined />} className="bg-slate-100 text-slate-400" />
      </div>
    </div>
  </header>
);

const PageHeader = ({ title, subtitle, period, dateRange, onBack }) => (
  <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-10 gap-6">
    <div className="flex items-start gap-6">
      <button 
        onClick={onBack}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-indigo-400 hover:text-indigo-600 transition-all group"
      >
        <ArrowLeftOutlined className="transition-transform group-hover:-translate-x-1" />
      </button>
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-950">{title}</h1>
        <p className="text-slate-500 font-medium mt-1">{subtitle}</p>
      </div>
    </div>
    <div className="flex items-center gap-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-1 flex items-center shadow-sm">
        <div className="px-5 py-2 rounded-xl bg-slate-950 text-white text-[11px] font-bold shadow-lg uppercase tracking-widest">
          {period}
        </div>
        <div className="px-6 py-2 text-[11px] font-bold text-slate-600 flex items-center gap-3">
          <CalendarOutlined className="text-slate-300" />
          <span className="tabular-nums">{dateRange}</span>
        </div>
      </div>
    </div>
  </div>
);

const EmployeeSummaryHero = ({ employee, income }) => (
  <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm mb-8 flex flex-col xl:flex-row gap-12 overflow-hidden relative">
    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600" />
    
    {/* Left: Identity */}
    <div className="flex items-center gap-8 xl:pr-12 xl:border-r xl:border-slate-100 min-w-[380px]">
      <div className="relative shrink-0">
        <div className="h-24 w-24 rounded-[32px] bg-slate-50 border border-slate-100 flex items-center justify-center text-[44px] font-black text-slate-300">
           {employee.full_name?.charAt(0)}
        </div>
        <div className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-emerald-500 border-4 border-white flex items-center justify-center text-white text-xs shadow-lg">
          <CheckCircleOutlined />
        </div>
      </div>
      <div>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h2 className="text-2xl font-black tracking-tight text-slate-950">{employee.full_name}</h2>
          <span className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-widest">#{employee.employee_code}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
           <Tag className="rounded-full bg-slate-100 border-none px-3 py-0.5 font-bold text-[10px] text-slate-500 uppercase tracking-widest m-0">{employee.department || 'Production'}</Tag>
           <Tag className="rounded-full bg-emerald-100 border-none px-3 py-0.5 font-bold text-[10px] text-emerald-600 uppercase tracking-widest m-0">Finalized</Tag>
        </div>
      </div>
    </div>

    {/* Middle: Details */}
    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-10">
      <DetailItem label="Payroll period" value="Monthly Report" sub="May 2026" />
      <DetailItem label="Working calendar" value="26 Days Plan" sub="Standard Policy" />
      <DetailItem label="Attendance policy" value="Tier 1 Allowance" sub="Updated Q2 2026" />
    </div>

    {/* Right: Income Block */}
    <div className="xl:pl-12 xl:border-l xl:border-slate-100 flex flex-col justify-center min-w-[300px]">
       <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl p-6 border border-slate-100 shadow-sm relative group transition-all hover:shadow-md">
         <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 mb-4">Estimated Income</p>
         <div className="flex items-baseline gap-2 mb-1">
           <span className="text-4xl font-black tracking-tighter text-slate-950">{income.toLocaleString()}</span>
           <span className="text-sm font-bold text-slate-400">VND</span>
         </div>
         <p className="text-[10px] font-medium text-slate-400 mb-6">Based on approved attendance data</p>
         <Button type="primary" block className="h-11 rounded-xl bg-slate-950 border-none font-bold text-xs shadow-lg shadow-slate-950/10 hover:translate-y-[-1px] transition-all">View payslip</Button>
       </div>
    </div>
  </div>
);

const DetailItem = ({ label, value, sub }) => (
  <div className="flex flex-col justify-center">
    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-300 mb-3">{label}</p>
    <p className="text-[14px] font-bold text-slate-950 mb-1 leading-none">{value}</p>
    <p className="text-[11px] font-medium text-slate-400 uppercase tracking-tighter">{sub}</p>
  </div>
);

const KpiGrid = ({ stats }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
    <KpiCard icon={HistoryOutlined} label="Paid work days" value={stats.present} sub="7 days" color="indigo" />
    <KpiCard icon={CalendarOutlined} label="Calendar days" value={stats.total} sub="31 days" color="slate" />
    <KpiCard icon={CoffeeOutlined} label="Meals" value={stats.meals} sub="7 meals" color="amber" />
    <KpiCard icon={MoonOutlined} label="Night allowance" value={stats.nightAll} sub="0 VND" color="purple" />
    <KpiCard icon={DollarCircleOutlined} label="Meal amount" value={stats.mealAll} sub="245,000 VND" color="emerald" />
    <KpiCard icon={WarningOutlined} label="Missing data" value={stats.missing} sub="17 days" color="rose" highlight />
  </div>
);

const KpiCard = ({ icon: Icon, label, value, sub, color, highlight }) => {
  const themes = {
    indigo: 'bg-indigo-50 text-indigo-600',
    slate: 'bg-slate-100 text-slate-500',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
  };

  return (
    <div className={`bg-white rounded-2xl border ${highlight ? 'border-rose-200 ring-4 ring-rose-500/5' : 'border-slate-200'} p-6 shadow-sm flex flex-col justify-between h-[112px] group transition-all hover:shadow-md`}>
      <div className="flex items-center justify-between">
        <div className={`h-10 w-10 rounded-xl ${themes[color]} flex items-center justify-center text-lg shadow-sm group-hover:scale-105 transition-transform`}>
          <Icon />
        </div>
        <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">{sub}</p>
      </div>
      <div className="flex flex-col mt-2">
        <p className="text-[10px] font-bold text-slate-400 mb-0.5">{label}</p>
        <span className={`text-2xl font-black tabular-nums leading-none ${highlight ? 'text-rose-600' : 'text-slate-950'}`}>{value.toLocaleString()}</span>
      </div>
    </div>
  );
};

const AttendanceTableCard = ({ days }) => (
  <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-0 h-full">
    <div className="p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shrink-0">
       <div>
         <h3 className="text-xl font-black tracking-tight text-slate-950">Daily Attendance</h3>
         <p className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-widest">Detailed working days, shifts, meals and allowances</p>
       </div>
       <div className="flex items-center gap-3">
         <Input prefix={<SearchOutlined className="text-slate-300" />} placeholder="Search day..." className="rounded-xl border-slate-200 h-10 w-40 bg-slate-50/30 text-xs font-bold" />
         <Select defaultValue="all" className="w-32 custom-select" options={[{value:'all', label:'All shifts'}]} />
         <Button icon={<LayoutOutlined />} className="rounded-xl border-slate-200 h-10 w-10 p-0 flex items-center justify-center" />
       </div>
    </div>

    <div className="overflow-auto flex-1 custom-scrollbar">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-30 bg-white/95 backdrop-blur-md text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          <tr>
            <th className="px-8 py-5 border-b border-slate-100">Date</th>
            <th className="px-6 py-5 border-b border-slate-100 text-center">Shift</th>
            <th className="px-6 py-5 border-b border-slate-100 text-center">Hours</th>
            <th className="px-6 py-5 border-b border-slate-100 text-center">OT</th>
            <th className="px-6 py-5 border-b border-slate-100 text-center">Meals</th>
            <th className="px-6 py-5 border-b border-slate-100 text-right">Amount</th>
            <th className="px-8 py-5 border-b border-slate-100">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {days.map((record) => {
            const isSunday = record.dow === 'CN';
            const isHoliday = record.is_holiday;
            const isAbsent = record.status === 'absent';
            
            return (
              <tr key={record.work_date} className={`group hover:bg-slate-50/80 transition-colors ${isSunday || isHoliday ? 'border-l-4 border-l-rose-500' : ''}`}>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-4">
                    <span className={`text-[15px] font-black tabular-nums ${isSunday || isHoliday ? 'text-rose-600' : 'text-slate-950'}`}>
                      {dayjs(record.work_date).format('DD/MM')}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-tighter ${isSunday || isHoliday ? 'text-rose-400' : 'text-slate-300'}`}>
                      {record.dow}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-5 text-center">
                  <ShiftBadge code={record.shift_code} isAbsent={isAbsent} />
                </td>
                <td className="px-6 py-5 text-center text-[13px] font-bold text-slate-800 tabular-nums">
                  {record.actual_hours > 0 ? record.actual_hours.toFixed(1) : <span className="text-slate-100">--</span>}
                </td>
                <td className="px-6 py-5 text-center">
                  {record.ot_hours > 0 ? (
                    <span className="text-[13px] font-black text-amber-500 tabular-nums">+{record.ot_hours.toFixed(1)}</span>
                  ) : <span className="text-slate-100">--</span>}
                </td>
                <td className="px-6 py-5 text-center text-[13px] font-black text-slate-950">
                  {record.meal_count || <span className="text-slate-100">--</span>}
                </td>
                <td className="px-6 py-5 text-right text-[13px] font-black text-slate-950 tabular-nums">
                  {record.meal_allowance > 0 ? record.meal_allowance.toLocaleString() : <span className="text-slate-100">--</span>}
                </td>
                <td className="px-8 py-5">
                   <StatusBadge status={record.status} isSunday={isSunday} isHoliday={isHoliday} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

const ShiftBadge = ({ code, isAbsent }) => {
  if (isAbsent) return <Tag className="rounded-lg bg-rose-50 border-none text-[9px] font-black uppercase tracking-widest text-rose-500 px-2 py-1">VẮNG</Tag>;
  if (!code) return <span className="text-slate-100 font-black">--</span>;
  
  const isNU = code.startsWith('NU');
  return (
    <Tag className={`rounded-lg border-none text-[10px] font-black px-2 py-1 uppercase tracking-wider ${isNU ? 'bg-indigo-50 text-indigo-600' : 'bg-blue-50 text-blue-600'}`}>
      {code}
    </Tag>
  );
};

const StatusBadge = ({ status, isSunday, isHoliday }) => {
  let label = 'Working day';
  let color = 'bg-emerald-500';
  let text = 'text-emerald-700';
  let bg = 'bg-emerald-50/50';

  if (isSunday || isHoliday) {
    label = 'Sunday / Holiday';
    color = 'bg-rose-500';
    text = 'text-rose-700';
    bg = 'bg-rose-50/50';
  } else if (status === 'absent') {
    label = 'Missing scan';
    color = 'bg-amber-500';
    text = 'text-amber-700';
    bg = 'bg-amber-50/50';
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${bg} ${text} text-[9px] font-bold uppercase tracking-widest border border-current border-opacity-10`}>
      <div className={`h-1 w-1 rounded-full ${color}`} />
      {label}
    </div>
  );
};

const PayrollBreakdownCard = ({ income }) => (
  <div className="bg-white rounded-[24px] border border-slate-200 p-8 shadow-sm">
    <h3 className="text-[15px] font-black tracking-tight text-slate-950 mb-8 flex items-center justify-between">
      Payroll Breakdown
      <DollarCircleOutlined className="text-slate-300" />
    </h3>
    <div className="mb-8">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Estimated income</p>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black tracking-tighter text-slate-950">{income.toLocaleString()}</span>
        <span className="text-sm font-bold text-slate-300">VND</span>
      </div>
    </div>
    <div className="space-y-6">
       <BreakdownItem label="Meal allowance" value={income} total={income} color="bg-indigo-600" />
       <BreakdownItem label="Night shift allowance" value={0} total={income} color="bg-purple-500" />
       <BreakdownItem label="Other allowance" value={0} total={income} color="bg-slate-200" />
    </div>
  </div>
);

const BreakdownItem = ({ label, value, total, color }) => (
  <div>
    <div className="flex items-center justify-between mb-2">
      <span className="text-[11px] font-bold text-slate-500">{label}</span>
      <span className="text-[11px] font-black text-slate-950">{value.toLocaleString()} <span className="text-slate-300 font-bold ml-0.5">đ</span></span>
    </div>
    <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }} />
    </div>
  </div>
);

const ShiftAllocationCard = ({ summary }) => (
  <div className="bg-white rounded-[24px] border border-slate-200 p-8 shadow-sm">
    <h3 className="text-[15px] font-black tracking-tight text-slate-950 mb-8 flex items-center justify-between">
      Shift Allocation
      <AppstoreOutlined className="text-slate-300" />
    </h3>
    <div className="space-y-4">
      {summary.map((item) => (
        <div key={item.code} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/50 border border-slate-100">
          <div className="flex items-center gap-4">
             <div className="h-10 w-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-950 shadow-sm uppercase">
               {item.code}
             </div>
             <div>
               <p className="text-[13px] font-bold text-slate-900 leading-none mb-1">{item.name || 'Standard'}</p>
               <p className="text-[10px] font-medium text-slate-400">{item.days} days</p>
             </div>
          </div>
          <span className="text-[13px] font-black text-slate-950">{item.totalMeal.toLocaleString()} đ</span>
        </div>
      ))}
      <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden mt-4">
          <div className="h-full bg-indigo-600 rounded-full" style={{width: '100%'}} />
      </div>
    </div>
  </div>
);

const AttendanceHealthCard = ({ stats }) => (
  <div className="bg-white rounded-[24px] border border-slate-200 p-8 shadow-sm relative overflow-hidden">
    <div className="absolute top-0 right-0 h-32 w-32 translate-x-12 -translate-y-12 rounded-full bg-rose-50 opacity-50" />
    <h3 className="text-[15px] font-black tracking-tight text-slate-950 mb-10 flex items-center justify-between relative z-10">
      Attendance Health
      <SafetyCertificateOutlined className="text-emerald-500" />
    </h3>
    
    <div className="grid grid-cols-2 gap-8 mb-10 relative z-10">
      <div className="flex flex-col">
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-300 mb-3">Avg Hours</span>
        <span className="text-2xl font-black text-slate-950 tabular-nums">{stats.avgHours}h</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-300 mb-3">Attendance</span>
        <span className="text-2xl font-black text-slate-950 tabular-nums">{stats.rate}%</span>
      </div>
    </div>

    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 mb-8 relative z-10">
       <div className="flex items-center gap-3 mb-3">
         <div className="h-6 w-6 rounded-full bg-rose-500 flex items-center justify-center text-white text-[10px]">
           <WarningOutlined />
         </div>
         <span className="text-[10px] font-black text-rose-700 uppercase tracking-widest">{stats.missing} days need review</span>
       </div>
       <p className="text-[11px] font-bold text-rose-500 leading-relaxed">System detected missing scans or absence that require manual approval.</p>
    </div>
    
    <Button block className="h-12 rounded-xl bg-white border-rose-200 text-rose-600 font-bold text-xs hover:bg-rose-50 transition-all relative z-10">Review attendance</Button>
  </div>
);

// --- Main Page Component ---

export default function MealAllowanceDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const monthKey = searchParams.get('month_key');
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const nightRate = Number(searchParams.get('night_rate') || 0);

  const { data: attResponse, isLoading } = useQuery({
    queryKey: ['attendance', id, monthKey, startDate, endDate, nightRate],
    queryFn: () => api.get('/attendance', {
      params: { 
        employee_id: id,
        month_key: monthKey, 
        start_date: startDate,
        end_date: endDate,
        night_allowance_rate: nightRate
      }
    }).then((r) => r.data),
    enabled: !!id,
  });

  const data = attResponse?.rows?.[0];

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Spin size="large" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <InfoCircleOutlined className="text-3xl text-slate-300 mb-4" />
          <h2 className="text-lg font-bold text-slate-900">Record Not Found</h2>
          <Button type="link" onClick={() => navigate(-1)}>Back to list</Button>
        </div>
      </div>
    );
  }

  const shiftSummary = {};
  data.days.forEach((cell) => {
    if (cell.status === 'no_data') return;
    const key = cell.shift_code || (cell.status === 'absent' ? 'N' : '?');
    if (!shiftSummary[key]) {
      shiftSummary[key] = { code: key, days: 0, totalMeal: 0, name: cell.shift_name };
    }
    shiftSummary[key].days += 1;
    shiftSummary[key].totalMeal += (cell.meal_allowance || 0) + (cell.night_allowance || 0);
  });

  const totalAll = (data.summary.total_meal_allowance || 0) + (data.summary.total_night_allowance || 0);
  const avgHours = (data.summary.total_hours / data.summary.total_present).toFixed(1);
  const attendanceRate = Math.round((data.summary.total_present / data.days.length) * 100);

  return (
    <div className="min-h-screen bg-[#F8FAFC] selection:bg-indigo-600 selection:text-white antialiased">
      <Sidebar />
      
      <div className="ml-[72px] flex flex-col min-h-screen">
        <TopBar 
          companyName="Cty TNHH Hiep Loi" 
          breadcrumbs={['Payroll', 'Monthly Report', dayjs(startDate).format('MMMM YYYY')]} 
        />

        <main className="flex-1 w-full max-w-[1440px] mx-auto px-10 py-12">
          <PageHeader 
            title="Payroll Report" 
            subtitle="Monthly attendance and allowance summary"
            period={dayjs(startDate).format('MMMM YYYY')}
            dateRange={`${dayjs(startDate).format('DD MMM')} — ${dayjs(endDate).format('DD MMM, YYYY')}`}
            onBack={() => navigate(-1)}
          />

          <EmployeeSummaryHero employee={data} income={totalAll} />

          <KpiGrid stats={{
            present: data.summary.total_present,
            total: data.days.length,
            meals: data.summary.total_meal_count,
            nightAll: data.summary.total_night_allowance,
            mealAll: data.summary.total_meal_allowance,
            missing: data.summary.total_absent
          }} />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-8 flex flex-col h-full min-h-[800px]">
               <AttendanceTableCard days={data.days} />
            </div>

            <div className="lg:col-span-4 flex flex-col gap-8">
               <PayrollBreakdownCard income={totalAll} />
               <ShiftAllocationCard summary={Object.values(shiftSummary)} />
               <AttendanceHealthCard stats={{ avgHours, rate: attendanceRate, missing: data.summary.total_absent }} />
            </div>
          </div>
        </main>

        <footer className="px-10 py-10 border-t border-slate-200 bg-white/50 flex flex-col md:flex-row items-center justify-between mt-20 gap-6">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">© 2026 Hiep Loi HR Management System • v2.4.0</p>
          <div className="flex items-center gap-10">
             <a href="#" className="text-[10px] font-black text-slate-300 hover:text-indigo-600 uppercase tracking-widest transition-colors">Internal documentation</a>
             <a href="#" className="text-[10px] font-black text-slate-300 hover:text-indigo-600 uppercase tracking-widest transition-colors">Help & Support</a>
          </div>
        </footer>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E2E8F0;
          border-radius: 10px;
          border: 2px solid white;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #CBD5E1;
        }

        .custom-select .ant-select-selector {
          border-radius: 12px !important;
          background-color: #F8FAFC !important;
          border-color: #E2E8F0 !important;
          font-weight: 800 !important;
          font-size: 11px !important;
          height: 40px !important;
          display: flex !important;
          align-items: center !important;
          text-transform: uppercase !important;
          letter-spacing: 0.1em !important;
        }

        .ant-btn {
          border-radius: 12px;
          font-weight: 800;
        }
        
        .ant-tag {
          border-radius: 8px;
        }

        * {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
      `}</style>
    </div>
  );
}
