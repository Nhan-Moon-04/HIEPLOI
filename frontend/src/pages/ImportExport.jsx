import { useState } from 'react';
import { Upload, Button, message, Modal, Tag, Divider, Alert, DatePicker, Table } from 'antd';
import dayjs from 'dayjs';
import {
  UploadOutlined, DownloadOutlined, CloudUploadOutlined,
  DatabaseOutlined, ImportOutlined, ThunderboltOutlined,
  ClockCircleOutlined, DeleteOutlined, EyeOutlined,
  ExclamationCircleOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import api from '../api/client';

const { RangePicker } = DatePicker;

export default function ImportExport() {
  const [importResult, setImportResult] = useState(null);
  const [restoreResult, setRestoreResult] = useState(null);
  const [importMonth, setImportMonth] = useState(dayjs().format('YYYY-MM'));
  const [otRange, setOtRange] = useState([dayjs().startOf('month'), dayjs()]);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const importAtt = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('month_key', importMonth);
      return api.post('/import-export/attendance', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
    },
    onSuccess: (res) => { message.success(res.data.message); setImportResult(res.data); },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi import'),
  });

  const restoreMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/import-export/restore', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => { message.success(res.data.message); setRestoreResult(res.data); },
    onError: (e) => message.error(e.response?.data?.detail || 'Lỗi restore'),
  });

  const handleBackup = async () => {
    try {
      const res = await api.get('/import-export/backup', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = res.headers['content-disposition']?.split('filename=')[1] || 'backup.json';
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      message.success('Đã tải backup!');
    } catch {
      message.error('Lỗi khi backup');
    }
  };

  const handlePreviewOT = async () => {
    if (!otRange[0] || !otRange[1]) return;
    setPreviewLoading(true);
    try {
      const res = await api.get('/schedules/x-overtime/range-preview', {
        params: { start_date: otRange[0].format('YYYY-MM-DD'), end_date: otRange[1].format('YYYY-MM-DD') },
      });
      setPreviewData(res.data);
    } catch {
      message.error('Lỗi khi tải dữ liệu tăng ca');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDeleteOTRange = () => {
    if (!previewData || previewData.count === 0) {
      message.info('Không có config tăng ca nào trong khoảng này');
      return;
    }
    Modal.confirm({
      title: `Xóa ${previewData.count} config tăng ca X?`,
      icon: <ExclamationCircleOutlined style={{ color: '#ef4444' }} />,
      content: (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 8 }}>
            Từ <b>{otRange[0]?.format('DD/MM/YYYY')}</b> đến <b>{otRange[1]?.format('DD/MM/YYYY')}</b>
          </div>
          <Alert
            type="warning" showIcon
            message="Hành động này không thể hoàn tác. Chỉ xóa config tăng ca, KHÔNG xóa dữ liệu chấm công."
            style={{ fontSize: 12 }}
          />
        </div>
      ),
      okText: `Xóa ${previewData.count} config`,
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        setDeleteLoading(true);
        try {
          const res = await api.delete('/schedules/x-overtime/range', {
            params: { start_date: otRange[0].format('YYYY-MM-DD'), end_date: otRange[1].format('YYYY-MM-DD') },
          });
          message.success(res.data.message);
          setPreviewData(null);
        } catch {
          message.error('Lỗi khi xóa');
        } finally {
          setDeleteLoading(false);
        }
      },
    });
  };

  const previewColumns = [
    { title: 'Ngày', dataIndex: 'work_date', key: 'date', width: 120, render: (v) => dayjs(v).format('DD/MM/YYYY') },
    { title: 'NV ID', dataIndex: 'employee_id', key: 'emp', width: 80 },
    { title: 'Giờ OT', dataIndex: 'ot_hours', key: 'ot', width: 100, render: (v) => v > 0 ? <Tag color="orange">{v}h</Tag> : '–' },
    { title: 'Số bữa OT', dataIndex: 'meal_count', key: 'meal', width: 100, render: (v) => v > 0 ? <Tag color="green">{v} bữa</Tag> : '–' },
  ];

  return (
    <div className="att-page">
      {/* Title bar */}
      <div className="emp-titlebar">
        <div className="emp-titlebar-left">
          <h2 className="emp-title">Import / Export</h2>
          <div className="emp-stats">
            <div className="emp-stat-chip">Nhập dữ liệu chấm công &amp; sao lưu hệ thống</div>
          </div>
        </div>
      </div>

      {/* Top 2-column grid */}
      <div className="ie-grid-2">

        {/* ── Import chấm công ── */}
        <div className="ed-section">
          <div className="ed-section-title">
            <ClockCircleOutlined style={{ color: '#276EF1', marginRight: 7 }} />
            Import Chấm Công
          </div>
          <div className="ie-section-body">
            <p className="ie-desc">Upload file Excel từ máy chấm công. Hệ thống sẽ tự động:</p>
            <ul className="ie-list">
              <li>Lọc trùng lặp (duplicate scans)</li>
              <li>Nhóm theo ngày cho mỗi nhân viên</li>
              <li>Tính giờ vào (first scan) và giờ ra (last scan)</li>
              <li>Xử lý ca đêm: scan trước 6h sáng = ca hôm trước</li>
            </ul>

            <Alert
              type="info" showIcon
              message="Format: Mã NV | Tên | Bộ phận | Thời gian scan (.xlsx hoặc .csv)"
              style={{ marginBottom: 14, fontSize: 11 }}
            />

            <div className="ie-field">
              <div className="ie-field-label">Chọn tháng chấm công:</div>
              <DatePicker
                picker="month"
                value={dayjs(importMonth)}
                onChange={(d) => d && setImportMonth(d.format('YYYY-MM'))}
                format="MM/YYYY"
                style={{ width: '100%' }}
                size="middle"
              />
            </div>

            <Upload
              accept=".xlsx,.xls,.csv"
              showUploadList={false}
              beforeUpload={(file) => { importAtt.mutate(file); return false; }}
            >
              <Button
                type="primary" icon={<UploadOutlined />}
                loading={importAtt.isPending} size="large" block
                style={{ background: '#276EF1', borderColor: '#276EF1', borderRadius: 8 }}
              >
                Chọn file chấm công (.xlsx, .csv)
              </Button>
            </Upload>

            {importResult && (
              <div className="ie-result ie-result--green">
                <div className="ie-result-title">
                  <CheckCircleOutlined /> Kết quả import
                </div>
                <div className="ie-result-rows">
                  <div>File: <b>{importResult.filename}</b></div>
                  <div>Tổng dòng: <b>{importResult.total_raw_rows}</b></div>
                  <div>NV xử lý: <b>{importResult.employees_processed}</b></div>
                  <div>Ngày mới: <Tag color="green">{importResult.days_created}</Tag></div>
                  <div>Ngày cập nhật: <Tag color="blue">{importResult.days_updated}</Tag></div>
                  {importResult.skipped_employees?.length > 0 && (
                    <div style={{ color: '#d97706', marginTop: 4 }}>
                      NV không nhận diện: {importResult.skipped_employees.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Backup & Restore ── */}
        <div className="ed-section">
          <div className="ed-section-title">
            <DatabaseOutlined style={{ color: '#7c3aed', marginRight: 7 }} />
            Backup &amp; Restore
          </div>
          <div className="ie-section-body">
            <p className="ie-desc">
              Sao lưu toàn bộ dữ liệu (nhân viên, ca, lịch làm, chấm công, ngày lễ) thành file JSON.
              Restore sẽ khôi phục dữ liệu từ file backup.
            </p>

            <div className="ie-action-stack">
              <Button
                icon={<DownloadOutlined />}
                onClick={handleBackup}
                size="large" block
                style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8 }}
              >
                Tải Backup (.json)
              </Button>

              <Divider style={{ margin: '10px 0', fontSize: 11, color: '#9ca3af' }}>hoặc</Divider>

              <Upload
                accept=".json"
                showUploadList={false}
                beforeUpload={(file) => {
                  Modal.confirm({
                    title: 'Xác nhận Restore',
                    content: 'Bạn có chắc muốn restore dữ liệu từ file backup? Dữ liệu trùng sẽ bị bỏ qua, dữ liệu mới sẽ được thêm vào.',
                    okText: 'Restore',
                    cancelText: 'Hủy',
                    onOk: () => restoreMut.mutate(file),
                  });
                  return false;
                }}
              >
                <Button icon={<CloudUploadOutlined />} loading={restoreMut.isPending} size="large" block style={{ borderRadius: 8 }}>
                  Restore từ Backup (.json)
                </Button>
              </Upload>
            </div>

            {restoreResult && (
              <div className="ie-result ie-result--purple">
                <div className="ie-result-title">
                  <CheckCircleOutlined /> Kết quả restore
                </div>
                <div className="ie-result-rows">
                  <div>Backup từ: <b>{restoreResult.backup_date}</b></div>
                  {restoreResult.restored && Object.entries(restoreResult.restored).map(([k, v]) => (
                    <div key={k}>{k}: <Tag color="purple">{v} mới</Tag></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── X Overtime Management ── */}
      <div className="ed-section">
        <div className="ed-section-title">
          <ThunderboltOutlined style={{ color: '#f59e0b', marginRight: 7 }} />
          Quản lý Config Tăng Ca X
          <span className="ie-section-sub">— Xem &amp; xóa có chọn lọc theo khoảng ngày</span>
        </div>
        <div className="ie-section-body">
          <Alert
            type="info" showIcon
            message="Chỉ xóa config tăng ca X (giờ ra, giờ OT, số bữa OT đã nhập). KHÔNG ảnh hưởng dữ liệu chấm công bình thường."
            style={{ marginBottom: 16, fontSize: 12 }}
          />

          <div className="ie-ot-bar">
            <div className="ie-ot-range">
              <div className="ie-field-label">Khoảng ngày:</div>
              <RangePicker
                value={otRange}
                onChange={(dates) => { if (dates) { setOtRange(dates); setPreviewData(null); } }}
                format="DD/MM/YYYY"
                style={{ width: '100%' }}
                allowClear={false}
                size="middle"
              />
            </div>
            <Button
              icon={<EyeOutlined />}
              onClick={handlePreviewOT}
              loading={previewLoading}
              size="middle"
              style={{ alignSelf: 'flex-end' }}
            >
              Xem trước
            </Button>
          </div>

          {previewData !== null && (
            <div style={{ marginTop: 16 }}>
              <div className="ie-preview-header">
                <div>
                  Tìm thấy&nbsp;
                  <Tag color={previewData.count > 0 ? 'orange' : 'default'} style={{ fontSize: 13 }}>
                    {previewData.count} config tăng ca
                  </Tag>
                  &nbsp;từ <b>{dayjs(previewData.start_date).format('DD/MM/YYYY')}</b> đến&nbsp;
                  <b>{dayjs(previewData.end_date).format('DD/MM/YYYY')}</b>
                </div>
                {previewData.count > 0 && (
                  <Button danger icon={<DeleteOutlined />} loading={deleteLoading} onClick={handleDeleteOTRange}>
                    Xóa {previewData.count} config này
                  </Button>
                )}
              </div>

              {previewData.count > 0 ? (
                <Table
                  dataSource={previewData.items}
                  columns={previewColumns}
                  rowKey={(r) => `${r.employee_id}_${r.work_date}`}
                  size="small"
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  scroll={{ y: 260 }}
                />
              ) : (
                <div className="ie-empty-state">
                  ✓ Không có config tăng ca nào trong khoảng ngày này
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
