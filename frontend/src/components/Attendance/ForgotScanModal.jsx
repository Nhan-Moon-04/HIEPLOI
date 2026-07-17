import React, { useState, useEffect } from 'react';
import { Modal, Table, Input, Button, Upload, Tag, Tooltip, Alert, Space, Typography, message, notification } from 'antd';
import {
  DownloadOutlined,
  UploadOutlined,
  SaveOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  CalendarOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Text } = Typography;

export default function ForgotScanModal({ visible, onClose, monthKey, onSaveSuccess }) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [timeInputs, setTimeInputs] = useState({});
  // Track which rows have been swapped (check-in ↔ check-out)
  const [swappedKeys, setSwappedKeys] = useState(new Set());

  const fetchScans = async () => {
    if (!visible || !monthKey) return;
    setLoading(true);
    try {
      const res = await api.get('/attendance/forgot-scans', {
        params: { month_key: monthKey }
      });
      setScans(res.data || []);
      // Reset selections and inputs
      setSelectedRowKeys([]);
      setTimeInputs({});
      setSwappedKeys(new Set());
    } catch (error) {
      message.error(error.response?.data?.detail || 'Lỗi khi tải danh sách quên quẹt thẻ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScans();
  }, [visible, monthKey]);

  /**
   * Get the effective (displayed) state of a row, considering swaps.
   * Returns { checkIn, checkOut, notes } after swap.
   */
  const getEffectiveState = (record, key) => {
    const isSwapped = swappedKeys.has(key);
    if (isSwapped) {
      return {
        checkIn: record.last_check_out || null,
        checkOut: record.first_check_in || null,
        notes: record.notes === 'Quên check in' ? 'Quên check out' : 'Quên check in',
      };
    }
    return {
      checkIn: record.first_check_in || null,
      checkOut: record.last_check_out || null,
      notes: record.notes,
    };
  };

  const handleTimeInputChange = (key, val) => {
    setTimeInputs(prev => ({ ...prev, [key]: val }));
    // Automatically check the row if user types a value
    if (val && !selectedRowKeys.includes(key)) {
      setSelectedRowKeys(prev => [...prev, key]);
    }
  };

  const handleSwap = (record, key) => {
    setSwappedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    // Clear the time input for this row since the missing side changed
    setTimeInputs(prev => ({ ...prev, [key]: '' }));
    // Auto-select the row
    if (!selectedRowKeys.includes(key)) {
      setSelectedRowKeys(prev => [...prev, key]);
    }
  };

  const fillDefaultShiftTime = (record, key) => {
    // shift_start_end format: "07:00 - 16:00"
    if (!record.shift_start_end || record.shift_start_end === 'Chưa xếp ca') {
      message.warning('Mã ca này không có giờ quy định');
      return;
    }
    const parts = record.shift_start_end.split('-');
    if (parts.length < 2) return;

    const effective = getEffectiveState(record, key);
    let defaultTime = '';
    if (effective.notes === 'Quên check in') {
      defaultTime = parts[0].trim();  // Bổ sung giờ vào → lấy giờ bắt đầu ca
    } else {
      defaultTime = parts[1].trim();  // Bổ sung giờ ra → lấy giờ kết thúc ca
    }

    handleTimeInputChange(key, defaultTime);
  };

  const handleExportExcel = async () => {
    try {
      const response = await api.get(`/attendance/forgot-scans/export`, {
        params: { month_key: monthKey },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `quen_quet_the_${monthKey}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      message.success('Đã tải file Excel mẫu thành công');
    } catch (error) {
      message.error('Lỗi khi tải file Excel mẫu');
    }
  };

  const handleUploadExcel = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('month_key', monthKey);

    setSubmitting(true);
    try {
      const res = await api.post('/attendance/forgot-scans/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.errors && res.data.errors.length > 0) {
        notification.warning({
          message: 'Kết quả nhập Excel (có lỗi)',
          description: (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              <p>{res.data.message}</p>
              {res.data.errors.map((err, i) => (
                <div key={i} style={{ color: '#d32f2f', fontSize: 12, marginTop: 4 }}>• {err}</div>
              ))}
            </div>
          ),
          duration: 8,
        });
      } else {
        message.success(res.data.message || 'Cập nhật Excel thành công');
      }
      fetchScans();
      if (onSaveSuccess) onSaveSuccess();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Lỗi khi tải file Excel lên');
    } finally {
      setSubmitting(false);
    }
    return false; // Prevent auto upload
  };

  const handleQuickSave = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('Vui lòng chọn ít nhất một dòng để lưu');
      return;
    }

    const items = [];
    for (const key of selectedRowKeys) {
      const scan = scans.find(s => `${s.work_date}_${s.employee_id}` === key);
      if (!scan) continue;

      const val = (timeInputs[key] || '').trim();
      const effective = getEffectiveState(scan, key);

      // Check if user entered X → company off
      if (val.toUpperCase() === 'X') {
        items.push({
          employee_id: scan.employee_id,
          work_date: scan.work_date,
          is_off: true,
        });
        continue;
      }

      // Build check_in / check_out based on effective state + user input
      let checkIn = effective.checkIn || null;
      let checkOut = effective.checkOut || null;

      // The user input fills the MISSING side
      if (val) {
        if (effective.notes === 'Quên check in') {
          checkIn = val;      // User is filling in check-in
        } else {
          checkOut = val;     // User is filling in check-out
        }
      }

      // Must have at least one value to send
      if (!checkIn && !checkOut && !swappedKeys.has(key)) {
        message.error(`Nhân viên ${scan.full_name} ngày ${dayjs(scan.work_date).format('DD/MM')} chưa nhập thời gian!`);
        return;
      }

      items.push({
        employee_id: scan.employee_id,
        work_date: scan.work_date,
        check_in: checkIn || null,
        check_out: checkOut || null,
        is_off: false,
      });
    }

    setSubmitting(true);
    try {
      const res = await api.post('/attendance/forgot-scans/quick-fix', { items });
      message.success(res.data.message || 'Cập nhật thành công');
      setSelectedRowKeys([]);
      setTimeInputs({});
      setSwappedKeys(new Set());
      fetchScans();
      if (onSaveSuccess) onSaveSuccess();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Lỗi khi lưu thông tin');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      title: 'STT',
      key: 'index',
      width: 50,
      align: 'center',
      render: (_, __, index) => index + 1
    },
    {
      title: 'Mã NV',
      dataIndex: 'employee_code',
      key: 'employee_code',
      width: 80,
      align: 'center',
    },
    {
      title: 'Họ tên',
      dataIndex: 'full_name',
      key: 'full_name',
      width: 150,
      render: (text, r) => (
        <div>
          <div style={{ fontWeight: '600', color: '#1f2937' }}>{text}</div>
          <div style={{ fontSize: '11px', color: '#9ca3af' }}>{r.department}</div>
        </div>
      )
    },
    {
      title: 'Ngày làm',
      dataIndex: 'work_date',
      key: 'work_date',
      width: 110,
      align: 'center',
      render: (date, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontWeight: '500' }}>{dayjs(date).format('DD/MM/YYYY')}</span>
          <Tag color={r.dow === 'CN' ? 'red' : 'blue'} style={{ margin: 0, fontSize: '10px', scale: '0.9' }}>{r.dow}</Tag>
        </div>
      )
    },
    {
      title: 'Ca',
      dataIndex: 'shift_code',
      key: 'shift_code',
      width: 70,
      align: 'center',
      render: code => <Tag color="purple">{code || '–'}</Tag>
    },
    {
      title: 'Quy định',
      dataIndex: 'shift_start_end',
      key: 'shift_start_end',
      width: 120,
      align: 'center',
      render: text => <span style={{ color: '#4b5563', fontSize: '12px' }}>{text}</span>
    },
    {
      title: 'Giờ vào',
      key: 'effective_check_in',
      width: 80,
      align: 'center',
      render: (_, record) => {
        const key = `${record.work_date}_${record.employee_id}`;
        const { checkIn } = getEffectiveState(record, key);
        const isSwapped = swappedKeys.has(key);
        return checkIn
          ? <span style={{ fontWeight: '500', color: isSwapped ? '#f59e0b' : '#10b981' }}>{checkIn}</span>
          : <span style={{ color: '#d1d5db' }}>--:--</span>;
      }
    },
    {
      title: 'Giờ ra',
      key: 'effective_check_out',
      width: 80,
      align: 'center',
      render: (_, record) => {
        const key = `${record.work_date}_${record.employee_id}`;
        const { checkOut } = getEffectiveState(record, key);
        const isSwapped = swappedKeys.has(key);
        return checkOut
          ? <span style={{ fontWeight: '500', color: isSwapped ? '#f59e0b' : '#10b981' }}>{checkOut}</span>
          : <span style={{ color: '#d1d5db' }}>--:--</span>;
      }
    },
    {
      title: '',
      key: 'swap',
      width: 40,
      align: 'center',
      render: (_, record) => {
        const key = `${record.work_date}_${record.employee_id}`;
        const isSwapped = swappedKeys.has(key);
        return (
          <Tooltip title={isSwapped ? 'Hoàn tác đổi chiều' : 'Đổi chiều: chuyển Giờ vào ↔ Giờ ra'}>
            <Button
              type="text"
              size="small"
              icon={<SwapOutlined style={{ color: isSwapped ? '#f59e0b' : '#6b7280', fontSize: '14px' }} />}
              onClick={() => handleSwap(record, key)}
              style={{
                background: isSwapped ? '#fef3c7' : 'transparent',
                borderRadius: '4px',
                border: isSwapped ? '1px solid #fcd34d' : '1px solid transparent',
              }}
            />
          </Tooltip>
        );
      }
    },
    {
      title: 'Lỗi',
      key: 'effective_notes',
      width: 120,
      align: 'center',
      render: (_, record) => {
        const key = `${record.work_date}_${record.employee_id}`;
        const { notes } = getEffectiveState(record, key);
        const isCheckIn = notes === 'Quên check in';
        const isSwapped = swappedKeys.has(key);
        return (
          <Tag
            color={isCheckIn ? 'error' : 'warning'}
            style={{ fontWeight: '500', border: isSwapped ? '2px solid #f59e0b' : undefined }}
          >
            {notes}
          </Tag>
        );
      }
    },
    {
      title: 'Bổ sung thời gian',
      key: 'time_input',
      width: 180,
      render: (_, record) => {
        const key = `${record.work_date}_${record.employee_id}`;
        const { notes } = getEffectiveState(record, key);
        const isCheckIn = notes === 'Quên check in';
        return (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <Input
              size="small"
              placeholder={isCheckIn ? 'Giờ vào (VD: 07:00)' : 'Giờ ra (VD: 16:00)'}
              value={timeInputs[key] || ''}
              onChange={e => handleTimeInputChange(key, e.target.value)}
              style={{ width: '120px', borderRadius: '4px' }}
            />
            <Tooltip title="Điền giờ quy định của ca">
              <Button
                type="text"
                size="small"
                icon={<ThunderboltOutlined style={{ color: '#f59e0b' }} />}
                onClick={() => fillDefaultShiftTime(record, key)}
              />
            </Tooltip>
          </div>
        );
      }
    }
  ];

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarOutlined style={{ color: '#276EF1' }} />
          <span>Danh sách lỗi quên quẹt thẻ - Tháng {monthKey ? dayjs(monthKey).format('MM/YYYY') : ''}</span>
        </div>
      }
      width={1200}
      footer={[
        <Button key="close" onClick={onClose} icon={<CloseCircleOutlined />}>
          Đóng
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleQuickSave}
          loading={submitting}
          style={{ background: '#10b981', borderColor: '#10b981' }}
        >
          Lưu nhanh
        </Button>
      ]}
      bodyStyle={{ padding: '16px' }}
      className="forgot-scan-modal"
    >
      <style>{`
        .forgot-scan-modal .ant-modal-header {
          border-bottom: 1px solid #f3f4f6;
          padding: 16px 24px;
        }
        .forgot-scan-modal .ant-modal-footer {
          border-top: 1px solid #f3f4f6;
          padding: 16px 24px;
        }
        .forgot-scan-modal .ant-table-thead > tr > th {
          background-color: #f9fafb;
          font-weight: 600;
        }
      `}</style>

      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Alert
          message={
            <div style={{ fontSize: '13px' }}>
              <strong>Hướng dẫn sửa nhanh:</strong>
              <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                <li>Nhập thời gian cụ thể (ví dụ: <Text code>07:00</Text> hoặc <Text code>16h</Text>) để bổ sung giờ vào/ra bị thiếu.</li>
                <li>Nhập chữ <Text code>X</Text> nếu ngày đó công ty cho nghỉ.</li>
                <li>Bấm nút <SwapOutlined style={{ color: '#f59e0b' }} /> <strong>Đổi chiều</strong> nếu thời gian đang nằm sai cột (ví dụ: 16:00 đang ở Giờ vào nhưng thực ra là Giờ ra).</li>
              </ul>
            </div>
          }
          type="info"
          showIcon
          style={{ borderRadius: '6px' }}
        />

        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text type="secondary">
              Tìm thấy <strong>{scans.length}</strong> trường hợp quên quẹt thẻ
              {swappedKeys.size > 0 && (
                <Tag color="orange" style={{ marginLeft: 8 }}>
                  {swappedKeys.size} đã đổi chiều
                </Tag>
              )}
            </Text>
          </div>
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportExcel}
              style={{ borderRadius: '5px' }}
            >
              Tải Excel mẫu
            </Button>
            <Upload
              beforeUpload={handleUploadExcel}
              showUploadList={false}
              accept=".xlsx,.xls"
            >
              <Button
                icon={<UploadOutlined />}
                type="dashed"
                style={{ borderRadius: '5px' }}
                loading={submitting}
              >
                Nhập Excel kết quả
              </Button>
            </Upload>
          </Space>
        </div>

        <Table
          dataSource={scans}
          columns={columns}
          rowKey={record => `${record.work_date}_${record.employee_id}`}
          rowSelection={{
            selectedRowKeys,
            onChange: keys => setSelectedRowKeys(keys)
          }}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          size="middle"
          bordered
          style={{ borderRadius: '6px', overflow: 'hidden' }}
        />
      </Space>
    </Modal>
  );
}
