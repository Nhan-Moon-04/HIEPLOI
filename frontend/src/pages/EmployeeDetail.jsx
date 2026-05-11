import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DatePicker, Button, Card, Col, Row, Table, Spin } from 'antd';
import { ArrowLeftOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const employeeId = Number(id);

  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const [nightAllowanceRate, setNightAllowanceRate] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('nightAllowanceRate');
    if (saved) setNightAllowanceRate(Number(saved));
  }, []);

  const { data: emp, isLoading: empLoading } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => api.get(`/employees/${employeeId}`).then((r) => r.data),
    enabled: Number.isFinite(employeeId),
  });

  const { data: attendance, isLoading: attLoading } = useQuery({
    queryKey: ['attendance', employeeId, monthKey, nightAllowanceRate],
    queryFn: () => api.get('/attendance', {
      params: {
        month_key: monthKey,
        employee_id: employeeId,
        night_allowance_rate: nightAllowanceRate,
      }
    }).then((r) => r.data),
    enabled: Number.isFinite(employeeId),
  });

  const { data: salaryHistory = [], isLoading: salaryLoading } = useQuery({
    queryKey: ['salary-history', employeeId],
    queryFn: () => api.get('/salaries/history', { params: { employee_id: employeeId } }).then((r) => r.data),
    enabled: Number.isFinite(employeeId),
  });

  const row = attendance?.rows?.[0];
  const days = row?.days || [];
  const summary = row?.summary || {};

  const mealDays = days.filter((d) => (d.meal_allowance || 0) > 0).length;
  const nightDays = days.filter((d) => (d.night_allowance || 0) > 0).length;

  const totalMeal = summary.total_meal_allowance || 0;
  const totalNight = summary.total_night_allowance || 0;

  const currentSalary = salaryHistory.find((s) => s.month_key === monthKey);
  const baseSalary = currentSalary?.base_salary ?? emp?.base_salary ?? 0;
  const allowance = currentSalary?.allowance ?? 0;
  const totalSalary = baseSalary + allowance;

  const formatMoney = (v) => Number(v || 0).toLocaleString('vi-VN');

  const shiftSummaryData = useMemo(() => {
    const shiftSummary = {};
    days.forEach((cell) => {
      if (!cell.shift_code) return;
      if (!shiftSummary[cell.shift_code]) {
        shiftSummary[cell.shift_code] = {
          code: cell.shift_code,
          name: cell.shift_name,
          days: 0,
          totalMeal: 0,
        };
      }
      shiftSummary[cell.shift_code].days += 1;
      shiftSummary[cell.shift_code].totalMeal += (cell.meal_allowance || 0) + (cell.night_allowance || 0);
    });
    return Object.values(shiftSummary);
  }, [days]);

  const dayColumns = [
    { title: 'Ngay', dataIndex: 'work_date', key: 'work_date', width: 110, render: (t) => t ? dayjs(t).format('DD/MM/YYYY') : '-' },
    { title: 'Ma ca', dataIndex: 'shift_code', key: 'shift_code', width: 80 },
    { title: 'Gio vao', dataIndex: 'check_in', key: 'check_in', width: 120, render: (t, r) => t ? `${r.work_date} ${t}` : '-' },
    { title: 'Gio ra', dataIndex: 'check_out', key: 'check_out', width: 120, render: (t, r) => t ? `${r.work_date} ${t}` : '-' },
    { title: 'Gio thuc', dataIndex: 'actual_hours', key: 'actual_hours', width: 80, align: 'center', render: (v) => v ? v.toFixed(2) : '0.00' },
    { title: 'Tang ca', dataIndex: 'ot_hours', key: 'ot_hours', width: 80, align: 'center', render: (v) => v ? v.toFixed(2) : '0.00' },
    { title: 'So gio', dataIndex: 'standard_hours', key: 'standard_hours', width: 80, align: 'center', render: (v) => v ? v.toFixed(2) : '0.00' },
    { title: 'Tien an', dataIndex: 'meal_allowance', key: 'meal_allowance', width: 110, align: 'right', render: (v) => formatMoney(v) },
    { title: 'PC Dem', dataIndex: 'night_allowance', key: 'night_allowance', width: 110, align: 'right', render: (v) => formatMoney(v) },
    { title: 'Ghi chu', dataIndex: 'notes', key: 'notes' },
  ];

  const salaryColumns = [
    { title: 'Thang', dataIndex: 'month_key', key: 'month_key', width: 100 },
    { title: 'Luong co ban', dataIndex: 'base_salary', key: 'base_salary', width: 140, align: 'right', render: (v) => formatMoney(v) },
    { title: 'Phu cap', dataIndex: 'allowance', key: 'allowance', width: 140, align: 'right', render: (v) => formatMoney(v) },
    { title: 'Tong', key: 'total', width: 140, align: 'right', render: (_, r) => formatMoney((r.base_salary || 0) + (r.allowance || 0)) },
    { title: 'Luong/ngay', dataIndex: 'base_daily_wage', key: 'base_daily_wage', width: 120, align: 'right', render: (v) => formatMoney(v) },
    { title: 'He so', dataIndex: 'salary_coefficient', key: 'salary_coefficient', width: 90, align: 'center', render: (v) => v ? Number(v).toFixed(2) : '1.00' },
    { title: 'Hinh thuc', dataIndex: 'pay_method', key: 'pay_method', width: 110, render: (v) => v || '-' },
    { title: 'Cap nhat', dataIndex: 'updated_at', key: 'updated_at', width: 140, render: (v) => v ? dayjs(v).format('DD/MM/YYYY') : '-' },
  ];

  if (empLoading) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
            Quay lai
          </Button>
          <h1><UserOutlined style={{ marginRight: 6 }} />Nhan vien: {emp?.full_name || '-'} ({emp?.employee_code || '-'})</h1>
          <div className="sub">
            Bo phan: <b>{emp?.department || '-'}</b> | Chuc vu: <b>{emp?.position || '-'}</b> | Ngay vao: <b>{emp?.join_date ? dayjs(emp.join_date).format('DD/MM/YYYY') : '-'}</b>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <DatePicker
            picker="month"
            value={dayjs(monthKey)}
            onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
            format="[Thang] M / YYYY"
            style={{ width: 155 }}
            allowClear={false}
          />
        </div>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small" style={{ background: '#f8f9fc', borderColor: '#e8ecf1' }}>
            <div style={{ fontSize: 12, color: '#6b7a99' }}>So ngay lam</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{summary.total_present || 0}</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: '#f8f9fc', borderColor: '#e8ecf1' }}>
            <div style={{ fontSize: 12, color: '#6b7a99' }}>So bua</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{mealDays}</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: '#f5f3ff', borderColor: '#ede9fe' }}>
            <div style={{ fontSize: 12, color: '#6d28d9' }}>So ca dem</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#7c3aed' }}>{nightDays}</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: '#f0fdf4', borderColor: '#dcfce7' }}>
            <div style={{ fontSize: 12, color: '#166534' }}>Tien an + PC dem</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#16a34a' }}>{formatMoney(totalMeal + totalNight)} d</div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ background: '#fff7ed', borderColor: '#ffedd5' }}>
            <div style={{ fontSize: 12, color: '#c2410c' }}>Luong thang</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#ea580c' }}>{formatMoney(totalSalary)} d</div>
          </Card>
        </Col>
      </Row>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 16 }}>Tong hop ca lam</div>
        <Table
          dataSource={shiftSummaryData}
          rowKey="code"
          pagination={false}
          size="small"
          columns={[
            { title: 'Ma ca', dataIndex: 'code', key: 'code', width: 100 },
            { title: 'Ten ca', dataIndex: 'name', key: 'name' },
            { title: 'So ngay', dataIndex: 'days', key: 'days', width: 100, align: 'center' },
            { title: 'Tong (An + PC Dem)', dataIndex: 'totalMeal', key: 'totalMeal', width: 200, align: 'right', render: (v) => formatMoney(v) },
          ]}
          locale={{ emptyText: 'Chua co du lieu ca lam' }}
        />
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 16 }}>Lich cham cong</div>
        {attLoading ? (
          <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>
        ) : (
          <Table
            dataSource={days}
            rowKey="day"
            pagination={false}
            size="small"
            scroll={{ y: 420 }}
            columns={dayColumns}
            rowClassName={(record) => record.status === 'absent' ? 'row-absent' : ''}
            locale={{ emptyText: 'Chua co du lieu cham cong' }}
          />
        )}
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 16 }}>Lich su luong</div>
        {salaryLoading ? (
          <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>
        ) : (
          <Table
            dataSource={salaryHistory}
            rowKey="month_key"
            pagination={{ pageSize: 12 }}
            size="small"
            columns={salaryColumns}
            locale={{ emptyText: 'Chua co du lieu luong' }}
          />
        )}
      </div>

      <style>{`
        .row-absent { background-color: #fef2f2; }
      `}</style>
    </div>
  );
}
