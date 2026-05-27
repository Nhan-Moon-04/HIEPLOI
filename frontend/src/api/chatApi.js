/**
 * Chat API client — REST endpoints
 */
import api from './client';

// ── Users ────────────────────────────────────────────────────────────────────
export const getChattableUsers = () => api.get('/chat/users');

// ── Conversations ────────────────────────────────────────────────────────────
export const getConversations = () => api.get('/chat/conversations');

export const createConversation = (data) => api.post('/chat/conversations', data);

export const getConversationDetail = (id) => api.get(`/chat/conversations/${id}`);

export const updateConversation = (id, data) => api.put(`/chat/conversations/${id}`, data);

// ── Members ──────────────────────────────────────────────────────────────────
export const addMembers = (convId, userIds) =>
  api.post(`/chat/conversations/${convId}/members`, { user_ids: userIds });

export const removeMember = (convId, userId) =>
  api.delete(`/chat/conversations/${convId}/members/${userId}`);

// ── Messages ─────────────────────────────────────────────────────────────────
export const getMessages = (convId, beforeId = null, limit = 50) => {
  const params = { limit };
  if (beforeId) params.before_id = beforeId;
  return api.get(`/chat/conversations/${convId}/messages`, { params });
};

export const sendMessage = (convId, content) =>
  api.post(`/chat/conversations/${convId}/messages`, { content });

export const uploadFile = (convId, file, caption = '') => {
  const formData = new FormData();
  formData.append('file', file);
  if (caption) formData.append('caption', caption);
  return api.post(`/chat/conversations/${convId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000, // 60s cho upload
  });
};

// ── Read ─────────────────────────────────────────────────────────────────────
export const markAsRead = (convId) => api.put(`/chat/conversations/${convId}/read`);

// ── Unread ───────────────────────────────────────────────────────────────────
export const getUnreadCount = () => api.get('/chat/unread-count');
