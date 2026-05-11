import { useState } from 'react';
import { Form, Input, Button, Card, Tabs, message, Space, Divider, Typography, Row, Col, Switch, Radio } from 'antd';
import {
  SettingOutlined,
  UserOutlined,
  LockOutlined,
  BankOutlined,
  FormatPainterOutlined,
  SaveOutlined
} from '@ant-design/icons';
import useAuthStore from '../stores/authStore';
import useThemeStore from '../stores/themeStore';

const { Title, Text } = Typography;

export default function Settings() {
  const { user } = useAuthStore();
  const { mode, primaryColor, setTheme } = useThemeStore();
  const [activeTab, setActiveTab] = useState('profile');

  const onFinishProfile = (values) => {
    message.success('Đã cập nhật thông tin cá nhân');
  };

  const onFinishPassword = (values) => {
    if (values.newPassword !== values.confirmPassword) {
      return message.error('Mật khẩu xác nhận không khớp');
    }
    message.success('Đã đổi mật khẩu thành công');
  };

  const onFinishCompany = (values) => {
    message.success('Đã lưu thông tin công ty');
  };

  const colors = [
    { name: 'Xanh chuyên nghiệp', value: '#4361ee' },
    { name: 'Tím hiện đại', value: '#7209b7' },
    { name: 'Xanh ngọc', value: '#06d6a0' },
    { name: 'Cam năng động', value: '#f77f00' },
    { name: 'Hồng quý phái', value: '#f72585' },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1><SettingOutlined style={{ marginRight: 8 }} />Cài đặt hệ thống</h1>
          <div className="sub">Quản lý cấu hình cá nhân và thông tin tổ chức</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          tabPosition="left"
          style={{ minHeight: 500 }}
          items={[
            {
              key: 'profile',
              label: (
                <span>
                  <UserOutlined /> Hồ sơ cá nhân
                </span>
              ),
              children: (
                <div style={{ padding: '24px 40px' }}>
                  <Title level={4}>Thông tin tài khoản</Title>
                  <Text type="secondary">Cập nhật thông tin cơ bản của bạn</Text>
                  <Divider />

                  <Form
                    layout="vertical"
                    initialValues={{ username: user?.username, full_name: user?.full_name }}
                    onFinish={onFinishProfile}
                    style={{ maxWidth: 400 }}
                  >
                    <Form.Item label="Tên đăng nhập" name="username">
                      <Input disabled />
                    </Form.Item>
                    <Form.Item label="Họ và tên" name="full_name" rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item label="Email" name="email">
                      <Input placeholder="Chưa cập nhật email" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>Lưu thay đổi</Button>
                  </Form>

                  <Divider style={{ margin: '40px 0' }} />

                  <Title level={4}>Đổi mật khẩu</Title>
                  <Form
                    layout="vertical"
                    onFinish={onFinishPassword}
                    style={{ maxWidth: 400 }}
                  >
                    <Form.Item label="Mật khẩu hiện tại" name="oldPassword" rules={[{ required: true }]}>
                      <Input.Password />
                    </Form.Item>
                    <Form.Item label="Mật khẩu mới" name="newPassword" rules={[{ required: true }]}>
                      <Input.Password />
                    </Form.Item>
                    <Form.Item label="Xác nhận mật khẩu mới" name="confirmPassword" rules={[{ required: true }]}>
                      <Input.Password />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<LockOutlined />}>Cập nhật mật khẩu</Button>
                  </Form>
                </div>
              ),
            },
            {
              key: 'company',
              label: (
                <span>
                  <BankOutlined /> Thông tin công ty
                </span>
              ),
              children: (
                <div style={{ padding: '24px 40px' }}>
                  <Title level={4}>Thông tin tổ chức</Title>
                  <Text type="secondary">Các thông tin này sẽ hiển thị trên các báo cáo Excel và Phiếu lương</Text>
                  <Divider />

                  <Form
                    layout="vertical"
                    initialValues={{
                      name: 'CÔNG TY TNHH HIỆP LỢI',
                      mst: '3701609885',
                      address: 'Số 123, Đường ABC, KCN VSIP, Bình Dương'
                    }}
                    onFinish={onFinishCompany}
                    style={{ maxWidth: 500 }}
                  >
                    <Form.Item label="Tên công ty (Tiếng Việt)" name="name" rules={[{ required: true }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item label="Mã số thuế" name="mst">
                      <Input />
                    </Form.Item>
                    <Form.Item label="Địa chỉ" name="address">
                      <Input.TextArea rows={3} />
                    </Form.Item>
                    <Form.Item label="Số điện thoại liên hệ" name="phone">
                      <Input />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>Lưu cấu hình</Button>
                  </Form>
                </div>
              ),
            },
            {
              key: 'appearance',
              label: (
                <span>
                  <FormatPainterOutlined /> Giao diện
                </span>
              ),
              children: (
                <div style={{ padding: '24px 40px' }}>
                  <Title level={4}>Tùy chỉnh giao diện</Title>
                  <Text type="secondary">Thay đổi màu sắc và chế độ hiển thị phù hợp với bạn</Text>
                  <Divider />

                  <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    <div>
                      <Title level={5}>Chế độ hiển thị</Title>
                      <Radio.Group
                        value={mode}
                        onChange={(e) => setTheme(e.target.value, primaryColor)}
                        buttonStyle="solid"
                      >
                        <Radio.Button value="light">Sáng (Light)</Radio.Button>
                        <Radio.Button value="dark">Tối (Dark)</Radio.Button>
                      </Radio.Group>
                    </div>

                    <div>
                      <Title level={5}>Màu chủ đạo</Title>
                      <Row gutter={[16, 16]}>
                        {colors.map(c => (
                          <Col key={c.value}>
                            <Card
                              hoverable
                              size="small"
                              style={{
                                width: 140,
                                border: primaryColor === c.value ? `2px solid ${c.value}` : '1px solid #f0f0f0',
                                textAlign: 'center'
                              }}
                              onClick={() => setTheme(mode, c.value)}
                            >
                              <div style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                background: c.value,
                                margin: '0 auto 8px'
                              }} />
                              <Text style={{ fontSize: 12 }}>{c.name}</Text>
                            </Card>
                          </Col>
                        ))}
                      </Row>
                    </div>
                  </Space>
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
