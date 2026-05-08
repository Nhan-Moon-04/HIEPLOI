import { useState } from 'react';
import { DatePicker, Button, Table, message, Modal, Upload, Tag, Alert, Popconfirm } from 'antd';
import { DollarOutlined, UploadOutlined, LockOutlined, UnlockOutlined, FileExcelOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

export default function BaseSalary() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [monthKey, setMonthKey] = useState(dayjs().format('YYYY-MM'));
  const [importModal, setImportModal] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['base-salaries', monthKey],
    queryFn: () => api.get('/salaries/base', { params: { month_key: monthKey } }).then(r => r.data),
  });

  const importMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('month_key', monthKey);
      return api.post('/salaries/import-base', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      message.success(res.data.message);
      setImportModal(false);
      qc.invalidateQueries(['base-salaries', monthKey]);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi import'),
  });

  const toggleLockMut = useMutation({
    mutationFn: (action) => {
      const fd = new FormData();
      fd.append('month_key', monthKey);
      fd.append('action', action);
      return api.post('/salaries/lock-month', fd);
    },
    onSuccess: (res) => {
      message.success(res.data.message);
      qc.invalidateQueries(['base-salaries', monthKey]);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi'),
  });

  const formatMoney = (v) => v ? v.toLocaleString() + ' đ' : '0 đ';

  const columns = [
    { title: 'Mã NV', dataIndex: 'employee_code', width: 100, fixed: 'left' },
    { title: 'Họ Tên', dataIndex: 'full_name', width: 200, fixed: 'left', render: t => <span style={{ fontWeight: 500 }}>{t}</span> },
    { title: 'Bộ phận', dataIndex: 'department', width: 150 },
    { title: 'Lương cơ bản', dataIndex: 'base_salary', width: 150, align: 'right', render: v => <span style={{ color: '#059669', fontWeight: 600 }}>{formatMoney(v)}</span> },
    { title: 'Phụ cấp', dataIndex: 'allowance', width: 150, align: 'right', render: v => <span style={{ color: '#7c3aed', fontWeight: 600 }}>{formatMoney(v)}</span> },
  ];

  const isLocked = data?.is_locked;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><DollarOutlined style={{ marginRight: 6 }} />Lương chung (Cố định)</h1>
          <div className="sub">
            Tháng {dayjs(monthKey).format('M/YYYY')} 
            {isLocked && <Tag color="red" style={{ marginLeft: 8 }} icon={<LockOutlined />}>Đã chốt</Tag>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <DatePicker 
            picker="month" 
            value={dayjs(monthKey)}
            onChange={(d) => d && setMonthKey(d.format('YYYY-MM'))}
            format="[Tháng] M / YYYY" 
            style={{ width: 155 }} 
            allowClear={false}
          />
          {isAdmin && (
            <>
              {isLocked ? (
                <Popconfirm title="Mở khóa sẽ cho phép cập nhật lại lương. Tiếp tục?" onConfirm={() => toggleLockMut.mutate('unlock')}>
                  <Button icon={<UnlockOutlined />}>Mở khóa tháng</Button>
                </Popconfirm>
              ) : (
                <>
                  <Button icon={<UploadOutlined />} type="primary" onClick={() => setImportModal(true)}>
                    Import Excel
                  </Button>
                  <Popconfirm title="Chốt tháng sẽ khóa dữ liệu lương, không cho phép import đè. Bạn chắc chắn?" onConfirm={() => toggleLockMut.mutate('lock')}>
                    <Button icon={<LockOutlined />} danger>Chốt tháng</Button>
                  </Popconfirm>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ background: '#fff', padding: 20, borderRadius: 8, border: '1px solid #f0f0f0', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#6b7a99', fontSize: 12 }}>Hệ số ngày công chuẩn (Tháng {dayjs(monthKey).format('M/YYYY')})</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#1e293b' }}>
              {data?.standard_days || '26.0'} <span style={{ fontSize: 14, fontWeight: 400, color: '#64748b' }}>ngày</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#6b7a99', fontSize: 12 }}>Tổng số nhân viên</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#1e293b' }}>
              {data?.rows?.length || 0}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Table 
          columns={columns} 
          dataSource={data?.rows || []} 
          rowKey="employee_code" 
          loading={isLoading}
          size="middle" 
          pagination={{ pageSize: 50 }} 
          scroll={{ x: 800 }}
          locale={{ emptyText: 'Chưa có dữ liệu lương tháng này. Vui lòng import file Excel.' }}
        />
      </div>

      {/* Modal Import */}
      <Modal 
        title={`Import Bảng Lương - Tháng ${dayjs(monthKey).format('M/YYYY')}`} 
        open={importModal} 
        onCancel={() => setImportModal(false)}
        footer={null}
      >
        <Alert 
          type="info" 
          showIcon 
          message="Lưu ý cấu trúc file Excel" 
          description={
            <ul style={{ paddingLeft: 20, marginTop: 8, fontSize: 13 }}>
              <li>Tên sheet phải là sheet đầu tiên trong file.</li>
              <li>Dữ liệu bắt đầu từ <b>Dòng 3</b>.</li>
              <li><b>Cột B:</b> Mã NV (Bắt buộc phải khớp với mã trong hệ thống).</li>
              <li><b>Cột D:</b> Lương cơ bản.</li>
              <li><b>Cột E:</b> Phụ cấp.</li>
              <li>Hệ số lương đọc tự động ở cột H (Ví dụ ô C8: 26).</li>
            </ul>
          }
          style={{ marginBottom: 16 }}
        />
        <Upload
          accept=".xlsx,.xls"
          showUploadList={false}
          beforeUpload={(file) => { importMut.mutate(file); return false; }}
        >
          <Button type="primary" icon={<FileExcelOutlined />} loading={importMut.isPending} size="large" block>
            Chọn file Excel
          </Button>
        </Upload>
      </Modal>
    </div>
  );
}
