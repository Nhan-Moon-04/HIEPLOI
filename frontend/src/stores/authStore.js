import { create } from 'zustand';
import api from '../api/client';

const getOrCreateDeviceId = () => {
  let devId = localStorage.getItem('device_id');
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
    localStorage.setItem('device_id', devId);
  }
  return devId;
};

const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  isAuthenticated: !!localStorage.getItem('access_token'),
  sessionId: localStorage.getItem('session_id') || null,
  loading: false,

  login: async (username, password, deviceName = null) => {
    set({ loading: true });
    try {
      const deviceId = getOrCreateDeviceId();
      const res = await api.post('/auth/login', {
        username,
        password,
        device_id: deviceId,
        ...(deviceName ? { device_name: deviceName } : {}),
      });
      const data = res.data;

      // OTP required — IP lạ
      if (data.otp_required) {
        set({ loading: false });
        return {
          success: false,
          otp_required: true,
          otp_session_id: data.otp_session_id,
          email_hint: data.email_hint,
          resend_cooldown_secs: data.resend_cooldown_secs ?? 120,
        };
      }

      // Login thành công
      const { access_token, refresh_token, user, session_id } = data;
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('user', JSON.stringify(user));
      if (session_id) localStorage.setItem('session_id', session_id);
      set({ user, isAuthenticated: true, sessionId: session_id, loading: false });
      return { success: true };
    } catch (err) {
      set({ loading: false });
      const detail = err.response?.data?.detail || 'Đăng nhập thất bại';
      const headers = err.response?.headers || {};
      // Lockout: HTTP 429
      if (err.response?.status === 429) {
        const lockoutSecs = parseInt(headers['x-lockout-seconds'] || '900');
        return { success: false, error: detail, lockout_seconds: lockoutSecs };
      }
      // Cảnh báo số lần còn lại
      const remaining = headers['x-attempts-remaining'];
      if (remaining !== undefined) {
        return { success: false, error: detail, attempts_remaining: parseInt(remaining) };
      }
      return { success: false, error: detail };
    }
  },

  // Lưu token sau khi xác thực OTP thành công
  setAuthFromToken: (data) => {
    const { access_token, refresh_token, user, session_id } = data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    localStorage.setItem('user', JSON.stringify(user));
    if (session_id) localStorage.setItem('session_id', session_id);
    set({ user, isAuthenticated: true, sessionId: session_id });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {}
    const deviceId = localStorage.getItem('device_id');
    localStorage.clear();
    if (deviceId) {
      localStorage.setItem('device_id', deviceId);
    }
    set({ user: null, isAuthenticated: false, sessionId: null });
  },

  hasRole: (...roles) => {
    const user = get().user;
    return user && roles.includes(user.role);
  },

  updateProfile: async (data) => {
    try {
      const res = await api.put('/auth/me', data);
      const updatedUser = res.data;
      localStorage.setItem('user', JSON.stringify(updatedUser));
      set({ user: updatedUser });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.detail || 'Cập nhật thất bại' };
    }
  },

  changePassword: async (oldPassword, newPassword, confirmPassword) => {
    try {
      const res = await api.put('/auth/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      return { success: true, message: res.data?.detail };
    } catch (err) {
      return { success: false, error: err.response?.data?.detail || 'Đổi mật khẩu thất bại' };
    }
  },

  completeSetup: async (password, email) => {
    try {
      const res = await api.post('/auth/complete-setup', {
        password,
        email,
      });
      const updatedUser = res.data;
      localStorage.setItem('user', JSON.stringify(updatedUser));
      set({ user: updatedUser });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.detail || 'Thiết lập tài khoản thất bại' };
    }
  },

  // ── Quản lý thiết bị ────────────────────────────────────────────────────
  getSessions: async () => {
    try {
      const res = await api.get('/auth/sessions');
      return { success: true, data: res.data };
    } catch (err) {
      return { success: false, error: err.response?.data?.detail || 'Không lấy được danh sách phiên' };
    }
  },

  revokeSession: async (sessionId) => {
    try {
      await api.delete(`/auth/sessions/${sessionId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.detail || 'Thu hồi phiên thất bại' };
    }
  },

  revokeAllOtherSessions: async () => {
    try {
      const res = await api.delete('/auth/sessions');
      return { success: true, message: res.data?.detail };
    } catch (err) {
      return { success: false, error: err.response?.data?.detail || 'Thất bại' };
    }
  },
}));

export default useAuthStore;
