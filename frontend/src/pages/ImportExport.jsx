import { useState } from 'react';
import { Upload, Button, message, Modal, Tag, Divider, Alert, DatePicker, Table } from 'antd';
import dayjs from 'dayjs';
import {
  UploadOutlined, DownloadOutlined, CloudUploadOutlined,
  DatabaseOutlined, ImportOutlined, ThunderboltOutlined,
  ClockCircleOutlined, DeleteOutlined, EyeOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import api from '../api/client';

const { RangePicker } = DatePicker;

export default function ImportExport() {
  const [importResult, setImportResult] = useState(null);
  const [restoreResult, setRestoreResult] = useState(null);
  const [importMonth, setImportMonth] = useState(dayjs().format('YYYY-MM'));

  // X Overtime management
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
    onSuccess: (res) => {
      message.success(res.data.message);
      setImportResult(res.data);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Loi import'),
  });

  const restoreMut = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/import-export/restore', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      message.success(res.data.message);
      setRestoreResult(res.data);
    },
    onError: (e) => message.error(e.response?.data?.detail || 'Loi restore'),
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
      message.success('Da tai backup!');
    } catch (e) {
      message.error('Loi khi backup');
    }
  };

  const handlePreviewOT = async () => {
    if (!otRange[0] || !otRange[1]) return;
    setPreviewLoading(true);
    try {
      const res = await api.get('/schedules/x-overtime/range-preview', {
        params: {
          start_date: otRange[0].format('YYYY-MM-DD'),
          end_date: otRange[1].format('YYYY-MM-DD'),
        },
      });
      setPreviewData(res.data);
    } catch (e) {
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
          <div style={{ color: '#6b7a99', fontSize: 13, marginBottom: 8 }}>
            Từ <b>{otRange[0]?.format('DD/MM/YYYY')}</b> đến <b>{otRange[1]?.format('DD/MM/YYYY')}</b>
          </div>
          <Alert
            type="warning"
            showIcon
            message="Hành động này không thể hoàn tác. Chỉ xóa config tăng ca (giờ ra, số bữa OT), KHÔNG xóa dữ liệu chấm công."
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
            params: {
              start_date: otRange[0].format('YYYY-MM-DD'),
              end_date: otRange[1].format('YYYY-MM-DD'),
            },
          });
          message.success(res.data.message);
          setPreviewData(null);
        } catch (e) {
          message.error('Lỗi khi xóa');
        } finally {
          setDeleteLoading(false);
        }
      },
    });
  };

  const previewColumns = [
    {
      title: 'Ngày', dataIndex: 'work_date', key: 'date', width: 120,
      render: (v) => dayjs(v).format('DD/MM/YYYY'),
    },
    { title: 'NV ID', dataIndex: 'employee_id', key: 'emp', width: 80 },
    {
      title: 'Giờ OT', dataIndex: 'ot_hours', key: 'ot', width: 100,
      render: (v) => v > 0 ? <Tag color="orange">{v}h</Tag> : '-',
    },
    {
      title: 'Số bữa OT', dataIndex: 'meal_count', key: 'meal', width: 100,
      render: (v) => v > 0 ? <Tag color="green">{v} bữa</Tag> : '-',
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><ImportOutlined style={{ marginRight: 6 }} />Import / Export</h1>
          <div className="sub">Nhap du lieu cham cong &amp; sao luu he thong</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Import Attendance */}
        <div className="card">
          <div className="card-title">
            <ClockCircleOutlined style={{ color: '#4361ee' }} />
            Import Cham Cong
          </div>
          <p style={{ color: '#6b7a99', fontSize: 12, marginBottom: 16 }}>
            Upload file Excel tu may cham cong. He thong se tu dong:
          </p>
          <ul style={{ color: '#6b7a99', fontSize: 12, paddingLeft: 20, marginBottom: 16 }}>
            <li>Loc trung lap (duplicate scans)</li>
            <li>Nhom theo ngay cho moi nhan vien</li>
            <li>Tinh gio vao (first scan) va gio ra (last scan)</li>
            <li>Xu ly ca dem: scan truoc 6h sang = ca hom truoc</li>
          </ul>
          <Alert
            type="info" showIcon
            message="Format: Ma NV | Ten | Bo phan | Thoi gian scan (.xlsx hoặc .csv)"
            style={{ marginBottom: 16, fontSize: 11 }}
          />
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 500 }}>Chon thang cham cong:</div>
            <DatePicker
              picker="month"
              value={dayjs(importMonth)}
              onChange={(d) => d && setImportMonth(d.format('YYYY-MM'))}
              format="MM / YYYY"
              style={{ width: '100%' }}
            />
          </div>
          <Upload
            accept=".xlsx,.xls,.csv"
            showUploadList={false}
            beforeUpload={(file) => { importAtt.mutate(file); return false; }}
          >
            <Button type="primary" icon={<UploadOutlined />} loading={importAtt.isPending} size="large" block>
              Chon file cham cong (.xlsx, .csv)
            </Button>
          </Upload>

          {importResult && (
            <div style={{ marginTop: 16, padding: 12, background: '#f0fdf4', borderRadius: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: '#22c55e', marginBottom: 8 }}>Ket qua import:</div>
              <div>File: <b>{importResult.filename}</b></div>
              <div>Tong dong: <b>{importResult.total_raw_rows}</b></div>
              <div>NV xu ly: <b>{importResult.employees_processed}</b></div>
              <div>Ngay moi: <Tag color="green">{importResult.days_created}</Tag></div>
              <div>Ngay cap nhat: <Tag color="blue">{importResult.days_updated}</Tag></div>
              {importResult.skipped_employees?.length > 0 && (
                <div style={{ color: '#f59e0b', marginTop: 4 }}>
                  NV khong nhan dien: {importResult.skipped_employees.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Backup & Restore */}
        <div className="card">
          <div className="card-title">
            <DatabaseOutlined style={{ color: '#8b5cf6' }} />
            Backup &amp; Restore
          </div>
          <p style={{ color: '#6b7a99', fontSize: 12, marginBottom: 16 }}>
            Sao luu toan bo du lieu (nhan vien, ca, lich lam, cham cong, ngay le) thanh file JSON.
            Restore se khoi phuc du lieu tu file backup.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Button icon={<DownloadOutlined />} onClick={handleBackup} size="large" block
              style={{ background: '#8b5cf6', color: '#fff', border: 'none' }}>
              Tai Backup (.json)
            </Button>

            <Divider style={{ margin: '8px 0', fontSize: 11, color: '#9ba8bf' }}>hoac</Divider>

            <Upload
              accept=".json"
              showUploadList={false}
              beforeUpload={(file) => {
                Modal.confirm({
                  title: 'Xac nhan Restore',
                  content: 'Ban co chac muon restore du lieu tu file backup? Du lieu trung se bi bo qua, du lieu moi se duoc them vao.',
                  okText: 'Restore',
                  cancelText: 'Huy',
                  onOk: () => restoreMut.mutate(file),
                });
                return false;
              }}
            >
              <Button icon={<CloudUploadOutlined />} loading={restoreMut.isPending} size="large" block>
                Restore tu Backup (.json)
              </Button>
            </Upload>
          </div>

          {restoreResult && (
            <div style={{ marginTop: 16, padding: 12, background: '#f5f3ff', borderRadius: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: '#8b5cf6', marginBottom: 8 }}>Ket qua restore:</div>
              <div>Backup tu: <b>{restoreResult.backup_date}</b></div>
              {restoreResult.restored && Object.entries(restoreResult.restored).map(([k, v]) => (
                <div key={k}>{k}: <Tag color="purple">{v} moi</Tag></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── X Overtime Management ─────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">
          <ThunderboltOutlined style={{ color: '#f59e0b' }} />
          Quản lý Config Tăng Ca X
          <span style={{ fontSize: 12, fontWeight: 400, color: '#6b7a99', marginLeft: 8 }}>
            — Xem &amp; xóa có chọn lọc theo khoảng ngày
          </span>
        </div>

        <Alert
          type="info" showIcon
          message="Chỉ xóa config tăng ca X (giờ ra, giờ OT, số bữa OT đã nhập). KHÔNG ảnh hưởng dữ liệu chấm công bình thường."
          style={{ marginBottom: 16, fontSize: 12 }}
        />

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>Chọn khoảng ngày:</div>
            <RangePicker
              value={otRange}
              onChange={(dates) => { if (dates) { setOtRange(dates); setPreviewData(null); } }}
              format="DD/MM/YYYY"
              style={{ width: '100%' }}
              allowClear={false}
            />
          </div>
          <Button
            icon={<EyeOutlined />}
            onClick={handlePreviewOT}
            loading={previewLoading}
            style={{ height: 32 }}
          >
            Xem trước
          </Button>
        </div>

        {previewData !== null && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 13 }}>
                Tìm thấy&nbsp;
                <Tag color={previewData.count > 0 ? 'orange' : 'default'} style={{ fontSize: 13 }}>
                  {previewData.count} config tăng ca
                </Tag>
                &nbsp;từ <b>{dayjs(previewData.start_date).format('DD/MM/YYYY')}</b> đến&nbsp;
                <b>{dayjs(previewData.end_date).format('DD/MM/YYYY')}</b>
              </div>
              {previewData.count > 0 && (
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={deleteLoading}
                  onClick={handleDeleteOTRange}
                >
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
                style={{ fontSize: 12 }}
              />
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: 13, background: '#f8fafc', borderRadius: 8 }}>
                ✓ Không có config tăng ca nào trong khoảng ngày này
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
