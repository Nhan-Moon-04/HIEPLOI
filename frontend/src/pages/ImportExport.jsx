import { useState } from 'react';
import { Upload, Button, Card, message, Modal, List, Tag, Divider, Alert } from 'antd';
import {
  UploadOutlined, DownloadOutlined, CloudUploadOutlined,
  DatabaseOutlined, ImportOutlined, ExportOutlined,
  ClockCircleOutlined, SafetyOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import api from '../api/client';

export default function ImportExport() {
  const [importResult, setImportResult] = useState(null);
  const [restoreResult, setRestoreResult] = useState(null);

  const importAtt = useMutation({
    mutationFn: (file) => {
      const fd = new FormData();
      fd.append('file', file);
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

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><ImportOutlined style={{ marginRight: 6 }} />Import / Export</h1>
          <div className="sub">Nhap du lieu cham cong & sao luu he thong</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
            message="Format: Ma NV | Ten | Bo phan (bo qua, lay trong DB) | Thoi gian scan"
            style={{ marginBottom: 16, fontSize: 11 }}
          />
          <Upload
            accept=".xlsx,.xls"
            showUploadList={false}
            beforeUpload={(file) => { importAtt.mutate(file); return false; }}
          >
            <Button type="primary" icon={<UploadOutlined />} loading={importAtt.isPending} size="large" block>
              Chon file cham cong (.xlsx)
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
            Backup & Restore
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
    </div>
  );
}
