import { useState } from 'react';
import { Button, Switch, Tooltip } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import Sidebar from './Sidebar';
import useThemeStore from '../../stores/themeStore';

export default function MainLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const { mode, toggle } = useThemeStore();

  return (
    <div className="main-layout">
      <Sidebar collapsed={collapsed} />
      <div className={`main-content ${collapsed ? 'collapsed' : ''}`}>
        <div className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              type="text"
              size="small"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ color: '#6b7a99' }}
            />
            <span style={{ color: '#9ba8bf', fontSize: 12 }}>
              Cty TNHH Hiep Loi
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Tooltip title={mode === 'light' ? 'Chuyen sang Dark mode' : 'Chuyen sang Light mode'}>
              <Button
                type="text"
                size="small"
                icon={mode === 'light' ? <MoonOutlined /> : <SunOutlined />}
                onClick={toggle}
                style={{ color: '#6b7a99' }}
              />
            </Tooltip>
          </div>
        </div>
        <div className="page-content">{children}</div>
      </div>
    </div>
  );
}
