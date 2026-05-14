import React from 'react';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CoffeeOutlined,
  MoonOutlined,
  DollarCircleOutlined,
  UserOutlined,
  CloseOutlined,
  ArrowRightOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const formatMoney = (amount, emptyValue = '-') => {
  if (amount === null || amount === undefined) return emptyValue;
  const numeric = Number(amount);
  if (Number.isNaN(numeric)) return emptyValue;
  if (numeric === 0) return emptyValue;
  return numeric.toLocaleString();
};

const getShiftBadgeClass = (code, status) => {
  const isNU = code?.startsWith('NU');
  const isN = code === 'N' || status === 'absent';

  if (isNU) return 'bg-blue-50 text-blue-600 border-blue-100';
  if (isN) return 'bg-rose-50 text-rose-600 border-rose-100';
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

const getRowClass = (record) => {
  const isSunday = record.dow === 'CN';
  const isAbsent = record.status === 'absent';
  const isHoliday = record.status === 'holiday' || record.is_holiday;
  let rowClass = 'min-h-[48px] bg-white transition-colors hover:bg-slate-50 group';

  if (isAbsent) rowClass += ' bg-rose-50/70';
  else if (isSunday || isHoliday) rowClass += ' bg-amber-50/70';

  if (record.ot_hours > 0) rowClass += ' border-l-4 border-orange-400';
  return rowClass;
};

const MoneyText = ({ amount, highlight = false, colorClass = '' }) => {
  const value = formatMoney(amount);
  if (value === '-') return <span className="text-slate-300 font-medium">-</span>;
  return (
    <span className={`font-bold tabular-nums ${highlight ? 'text-emerald-600' : colorClass || 'text-slate-700'}`}>
      {value}
    </span>
  );
};

const ShiftBadge = ({ code, status }) => {
  if (!code && status !== 'absent') return <span className="text-slate-300">-</span>;
  const badgeClass = getShiftBadgeClass(code, status);
  const baseStyle = 'inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[11px] font-extrabold min-w-[36px] border transition-colors';
  return <span className={`${baseStyle} ${badgeClass}`}>{code || 'N'}</span>;
};

const SummaryCard = ({ icon: Icon, label, value, colorType }) => {
  const isTotal = colorType === 'green';
  const toneConfigs = {
    blue: { icon: 'bg-blue-50 text-blue-600', value: 'text-blue-700' },
    indigo: { icon: 'bg-indigo-50 text-indigo-600', value: 'text-indigo-700' },
    red: { icon: 'bg-rose-50 text-rose-600', value: 'text-rose-600' },
    amber: { icon: 'bg-amber-50 text-amber-600', value: 'text-amber-600' },
    purple: { icon: 'bg-violet-50 text-violet-600', value: 'text-violet-600' },
  };
  const tone = toneConfigs[colorType] || toneConfigs.blue;

  return (
    <div
      className={`flex min-h-[92px] min-w-0 flex-col justify-between gap-3 rounded-[18px] p-4 shadow-sm ${
        isTotal
          ? 'bg-gradient-to-br from-emerald-600 via-green-500 to-green-400 text-white'
          : 'border border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[11px] font-extrabold uppercase tracking-[0.04em] ${
            isTotal ? 'text-white/85' : 'text-slate-500'
          }`}
        >
          {label}
        </span>
        <span
          className={`flex h-[30px] w-[30px] items-center justify-center rounded-[10px] text-[13px] ${
            isTotal ? 'bg-white/20 text-white' : tone.icon
          }`}
        >
          <Icon />
        </span>
      </div>
      <span
        className={`text-[26px] font-extrabold leading-none tabular-nums whitespace-nowrap ${
          isTotal ? 'text-white' : tone.value
        }`}
      >
        {value}
      </span>
    </div>
  );
};

const InfoPanel = ({ title, dotColor, meta, children }) => (
  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm">
    <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 px-[18px]">
      <div className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.025em] text-slate-900">
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span>{title}</span>
      </div>
      {meta && <span className="text-[12px] font-semibold text-slate-400">{meta}</span>}
    </div>
    <div className="min-h-0 flex-1 overflow-auto custom-scrollbar">
      {children}
    </div>
  </div>
);

const ShiftSummaryTable = ({ data }) => {
  const totalShift = data.reduce((sum, item) => sum + (item.totalMeal || 0), 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse text-left text-[13px]">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="w-[70px] px-[14px] py-[11px] text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500">Mã</th>
              <th className="w-[70px] px-[14px] py-[11px] text-center text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500">Công</th>
              <th className="px-[14px] py-[11px] text-right text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500">Tiền</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.length > 0 ? (
              data.map((item) => (
                <tr key={item.code} className="min-h-[48px] transition-colors hover:bg-slate-50">
                  <td className="px-[14px] py-[13px]"><ShiftBadge code={item.code} /></td>
                  <td className="px-[14px] py-[13px] text-center font-bold text-slate-700">{item.days}</td>
                  <td className="px-[14px] py-[13px] text-right">
                    <MoneyText amount={item.totalMeal} colorClass="text-blue-600" />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="py-12 text-center text-slate-400">
                  <InfoCircleOutlined className="mb-1 text-xl" />
                  <p className="text-[11px] font-bold uppercase tracking-wider">Chưa có dữ liệu</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-[14px] py-[12px] text-[12px] font-semibold text-slate-600">
        <span>Tổng tiền</span>
        <span className="font-extrabold text-slate-900 tabular-nums">{formatMoney(totalShift, '0')}</span>
      </div>
    </div>
  );
};

const DailyDetailTable = ({ days }) => (
  <div className="h-full overflow-auto">
    <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
        <tr>
          <th className="px-[14px] py-[12px] text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500 whitespace-nowrap">Ngày</th>
          <th className="px-[14px] py-[12px] text-center text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500 whitespace-nowrap">Ca</th>
          <th className="px-[14px] py-[12px] text-center text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500 whitespace-nowrap">Vào - Ra</th>
          <th className="px-[14px] py-[12px] text-center text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500 whitespace-nowrap">Giờ</th>
          <th className="px-[14px] py-[12px] text-center text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500 whitespace-nowrap">TC</th>
          <th className="px-[14px] py-[12px] text-center text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500 whitespace-nowrap">Bữa</th>
          <th className="px-[14px] py-[12px] text-right text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500 whitespace-nowrap">Tiền ăn</th>
          <th className="px-[14px] py-[12px] text-right text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500 whitespace-nowrap">PC Đêm</th>
          <th className="px-[14px] py-[12px] text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500 whitespace-nowrap">Ghi chú</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {days.map((record) => {
          const isSunday = record.dow === 'CN';
          const isAbsent = record.status === 'absent';

          return (
            <tr key={record.work_date} className={getRowClass(record)}>
              <td className="px-[14px] py-[13px]">
                <div className="flex flex-col leading-tight">
                  <span className="text-[13px] font-extrabold text-slate-900">
                    {dayjs(record.work_date).format('DD/MM')}
                  </span>
                  <span className={`text-[11px] font-semibold ${isSunday ? 'text-rose-500' : 'text-slate-400'}`}>
                    {record.dow}
                  </span>
                </div>
              </td>
              <td className="px-[14px] py-[13px] text-center">
                <ShiftBadge code={record.shift_code} status={record.status} />
              </td>
              <td className="px-[14px] py-[13px] text-center">
                {isAbsent ? (
                  <span className="text-[11px] font-bold uppercase italic tracking-tight text-slate-400">Vắng mặt</span>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-[13px] font-semibold text-slate-600 tabular-nums">
                    <span>{record.check_in ? dayjs(record.check_in).format('HH:mm') : '--:--'}</span>
                    <ArrowRightOutlined className="text-[11px] text-slate-300" />
                    <span>{record.check_out ? dayjs(record.check_out).format('HH:mm') : '--:--'}</span>
                  </div>
                )}
              </td>
              <td className="px-[14px] py-[13px] text-center">
                {record.actual_hours > 0 ? (
                  <span className="font-bold text-slate-900">{record.actual_hours.toFixed(1)}</span>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td className="px-[14px] py-[13px] text-center">
                {record.ot_hours > 0 ? (
                  <span className="font-bold text-orange-500">{record.ot_hours.toFixed(1)}</span>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td className="px-[14px] py-[13px] text-center">
                {record.meal_count > 0 ? (
                  <span className="font-bold text-slate-700">{record.meal_count}</span>
                ) : (
                  <span className="text-slate-300">-</span>
                )}
              </td>
              <td className="px-[14px] py-[13px] text-right">
                <MoneyText amount={record.meal_allowance} highlight />
              </td>
              <td className="px-[14px] py-[13px] text-right">
                <MoneyText amount={record.night_allowance} colorClass="text-violet-600" />
              </td>
              <td className="px-[14px] py-[13px]">
                <div
                  className={`max-w-[280px] text-[12px] leading-[1.4] break-words ${
                    isAbsent ? 'font-semibold text-rose-500' : 'text-slate-600'
                  }`}
                >
                  {record.notes || '-'}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default function EmployeeDetailModal({ visible, onClose, data }) {
  if (!data) return null;

  const shiftSummary = {};
  data.days.forEach((cell) => {
    if (cell.status === 'no_data') return;
    const key = cell.shift_code || (cell.status === 'absent' ? 'N' : '?');
    if (!shiftSummary[key]) {
      shiftSummary[key] = {
        code: key,
        days: 0,
        totalMeal: 0,
      };
    }
    shiftSummary[key].days += 1;
    shiftSummary[key].totalMeal += (cell.meal_allowance || 0) + (cell.night_allowance || 0);
  });

  const shiftSummaryData = Object.values(shiftSummary);
  const totalNight = formatMoney(data.summary.total_night_allowance, '0');
  const totalReceive = formatMoney(
    (data.summary.total_meal_allowance || 0) + (data.summary.total_night_allowance || 0),
    '0'
  );

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm transition-opacity duration-200 sm:p-4 lg:p-8 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative flex w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)] transition-all duration-200 sm:w-[calc(100vw-32px)] sm:max-h-[calc(100vh-32px)] lg:w-[min(1120px,calc(100vw-64px))] lg:max-h-[calc(100vh-64px)] lg:rounded-[24px] ${
          visible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-2 opacity-0 scale-[0.98]'
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-5 border-b border-slate-200 bg-white px-4 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-2xl text-blue-600">
              <UserOutlined />
            </div>
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate text-[20px] font-extrabold leading-tight text-slate-900">
                {data.full_name}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[12px] font-bold text-blue-700">
                  Mã nhân viên: <span className="font-extrabold">{data.employee_code}</span>
                </span>
                <span className="h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                <span className="text-slate-400">Chi tiết tiền ăn theo ngày và ca làm</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95"
          >
            <CloseOutlined className="text-base" />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-7 sm:py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <SummaryCard icon={CalendarOutlined} label="Ngày làm" value={data.summary.total_present || 0} colorType="blue" />
            <SummaryCard icon={CheckCircleOutlined} label="Nghỉ phép" value={data.summary.total_paid_leave || 0} colorType="indigo" />
            <SummaryCard icon={CloseCircleOutlined} label="Vắng/K.phép" value={data.summary.total_absent || 0} colorType="red" />
            <SummaryCard icon={CoffeeOutlined} label="Số bữa" value={data.summary.total_meal_count || 0} colorType="amber" />
            <SummaryCard icon={MoonOutlined} label="PC Ca đêm" value={totalNight} colorType="purple" />
            <SummaryCard icon={DollarCircleOutlined} label="Tổng nhận" value={totalReceive} colorType="green" />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-white p-4 sm:px-7 sm:pb-7 sm:pt-6">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)]">
            <InfoPanel title="Tổng hợp theo ca" dotColor="bg-blue-500" meta={`${shiftSummaryData.length} ca`}>
              <ShiftSummaryTable data={shiftSummaryData} />
            </InfoPanel>

            <InfoPanel title="Chi tiết từng ngày" dotColor="bg-emerald-500" meta={`${data.days.length} ngày`}>
              <DailyDetailTable days={data.days} />
            </InfoPanel>
          </div>
        </div>

        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 5px;
            height: 5px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #e2e8f0;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #cbd5e1;
          }
        `}</style>
      </div>
    </div>
  );
}
