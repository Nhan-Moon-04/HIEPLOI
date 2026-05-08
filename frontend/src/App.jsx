import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import useAuthStore from './stores/authStore';
import useThemeStore from './stores/themeStore';
import { getThemeConfig } from './theme';
import MainLayout from './components/Layout/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Shifts from './pages/Shifts';
import Employees from './pages/Employees';
import Holidays from './pages/Holidays';
import Schedules from './pages/Schedules';

function PrivateRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { mode, primaryColor } = useThemeStore();

  useEffect(() => {
    document.body.className = mode === 'dark' ? 'dark' : '';
  }, [mode]);

  return (
    <ConfigProvider theme={getThemeConfig(mode, primaryColor)} locale={viVN}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <PrivateRoute>
              <MainLayout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/shifts" element={<Shifts />} />
                  <Route path="/employees" element={<Employees />} />
                  <Route path="/holidays" element={<Holidays />} />
                  <Route path="/schedules" element={<Schedules />} />
                </Routes>
              </MainLayout>
            </PrivateRoute>
          }
        />
      </Routes>
    </ConfigProvider>
  );
}
