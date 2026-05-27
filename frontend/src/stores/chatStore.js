/**
 * Chat Store — Zustand state management + WebSocket
 * Quản lý: conversations, messages, typing, online status, unread count
 */
import { create } from 'zustand';
import * as chatApi from '../api/chatApi';

const useChatStore = create((set, get) => ({
  // ── State ─────────────────────────────────────────────────────────────────
  conversations: [],
  activeConversationId: null,
  messages: {}, // { [convId]: Message[] }
  hasMore: {},  // { [convId]: boolean }
  typingUsers: {}, // { [convId]: { userId, username, fullName, timeout } }
  onlineUsers: new Set(), // set of user_ids
  unreadTotal: 0,
  ws: null,
  wsConnected: false,
  loading: false,
  messagesLoading: false,
  chattableUsers: [],
  sendingFile: false,

  // ── Actions ───────────────────────────────────────────────────────────────

  // Kết nối WebSocket
  connectWS: () => {
    const token = localStorage.getItem('access_token');
    if (!token) return;

    const existing = get().ws;
    if (existing && existing.readyState <= 1) return; // Đã kết nối

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/chat/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      set({ wsConnected: true });
      console.log('[Chat WS] Connected');
      // Ping mỗi 30s để giữ connection
      ws._pingInterval = setInterval(() => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ action: 'ping' }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        get()._handleWSMessage(data);
      } catch (e) {
        console.error('[Chat WS] Parse error:', e);
      }
    };

    ws.onclose = (e) => {
      set({ wsConnected: false });
      clearInterval(ws._pingInterval);
      console.log('[Chat WS] Disconnected', e.code);
      // Auto reconnect sau 3s (trừ khi chủ động disconnect)
      if (e.code !== 4001 && e.code !== 1000) {
        setTimeout(() => get().connectWS(), 3000);
      }
    };

    ws.onerror = (e) => {
      console.error('[Chat WS] Error:', e);
    };

    set({ ws });
  },

  disconnectWS: () => {
    const ws = get().ws;
    if (ws) {
      clearInterval(ws._pingInterval);
      ws.close(1000);
      set({ ws: null, wsConnected: false });
    }
  },

  // Xử lý message từ WebSocket
  _handleWSMessage: (data) => {
    const { type } = data;

    switch (type) {
      case 'new_message': {
        const msg = data.message;
        const convId = msg.conversation_id;
        set((state) => {
          const convMsgs = state.messages[convId] || [];
          // Tránh duplicate
          if (convMsgs.some((m) => m.id === msg.id)) return state;

          const newMessages = { ...state.messages, [convId]: [...convMsgs, msg] };

          // Update conversation list — move to top + update last_message
          const newConvs = state.conversations.map((c) => {
            if (c.id === convId) {
              const isActive = state.activeConversationId === convId;
              return {
                ...c,
                last_message: msg,
                unread_count: isActive ? c.unread_count : (c.unread_count || 0) + 1,
              };
            }
            return c;
          });
          // Sort: mới nhất lên đầu
          newConvs.sort((a, b) => {
            const ta = a.last_message?.created_at || a.created_at;
            const tb = b.last_message?.created_at || b.created_at;
            return tb > ta ? 1 : -1;
          });

          // Update unread total
          const user = JSON.parse(localStorage.getItem('user') || '{}');
          const isMyMsg = msg.sender_id === user?.id;
          const isActive = state.activeConversationId === convId;
          const addUnread = !isMyMsg && !isActive ? 1 : 0;

          return {
            messages: newMessages,
            conversations: newConvs,
            unreadTotal: state.unreadTotal + addUnread,
          };
        });

        // Play sound nếu không phải tin nhắn của mình và không đang xem conv đó
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (msg.sender_id !== user?.id && get().activeConversationId !== convId) {
          get()._playNotificationSound();
        }
        break;
      }

      case 'typing': {
        const { conversation_id, user_id, username, full_name, is_typing } = data;
        set((state) => {
          const convTyping = { ...(state.typingUsers[conversation_id] || {}) };
          if (is_typing) {
            // Clear previous timeout
            if (convTyping[user_id]?.timeout) clearTimeout(convTyping[user_id].timeout);
            // Auto-clear sau 5s
            const timeout = setTimeout(() => {
              set((s) => {
                const ct = { ...(s.typingUsers[conversation_id] || {}) };
                delete ct[user_id];
                return { typingUsers: { ...s.typingUsers, [conversation_id]: ct } };
              });
            }, 5000);
            convTyping[user_id] = { username, fullName: full_name, timeout };
          } else {
            if (convTyping[user_id]?.timeout) clearTimeout(convTyping[user_id].timeout);
            delete convTyping[user_id];
          }
          return { typingUsers: { ...state.typingUsers, [conversation_id]: convTyping } };
        });
        break;
      }

      case 'read': {
        const { conversation_id, user_id, username, full_name, message_id } = data;
        // Update read_by trong messages
        set((state) => {
          const convMsgs = state.messages[conversation_id];
          if (!convMsgs) return state;
          const newMsgs = convMsgs.map((m) => {
            if (m.sender_id !== user_id && m.id <= message_id) {
              const alreadyRead = m.read_by?.some((r) => r.user_id === user_id);
              if (!alreadyRead) {
                return {
                  ...m,
                  read_by: [
                    ...(m.read_by || []),
                    { user_id, username, full_name, read_at: new Date().toISOString() },
                  ],
                };
              }
            }
            return m;
          });
          return { messages: { ...state.messages, [conversation_id]: newMsgs } };
        });
        break;
      }

      case 'online_status': {
        const { user_id, is_online } = data;
        set((state) => {
          const newOnline = new Set(state.onlineUsers);
          if (is_online) newOnline.add(user_id);
          else newOnline.delete(user_id);
          return { onlineUsers: newOnline };
        });
        break;
      }

      case 'conversation_updated': {
        const conv = data.conversation;
        set((state) => ({
          conversations: state.conversations.map((c) => (c.id === conv.id ? conv : c)),
        }));
        break;
      }

      case 'member_removed': {
        const { conversation_id, user_id } = data;
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        if (user_id === currentUser?.id) {
          // Mình bị xóa khỏi group
          set((state) => ({
            conversations: state.conversations.filter((c) => c.id !== conversation_id),
            activeConversationId:
              state.activeConversationId === conversation_id ? null : state.activeConversationId,
          }));
        } else {
          // Người khác bị xóa
          get().loadConversations();
        }
        break;
      }

      case 'pong':
        break;

      default:
        console.log('[Chat WS] Unknown type:', type);
    }
  },

  // Play notification sound
  _playNotificationSound: () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) { /* ignore */ }
  },

  // ── REST API actions ────────────────────────────────────────────────────

  loadConversations: async () => {
    set({ loading: true });
    try {
      const res = await chatApi.getConversations();
      set({ conversations: res.data, loading: false });
    } catch (e) {
      console.error('Load conversations error:', e);
      set({ loading: false });
    }
  },

  loadMessages: async (convId, loadMore = false) => {
    set({ messagesLoading: true });
    try {
      const existing = get().messages[convId] || [];
      const beforeId = loadMore && existing.length > 0 ? existing[0].id : null;
      const res = await chatApi.getMessages(convId, beforeId, 50);
      const newMsgs = res.data.messages || [];

      set((state) => ({
        messages: {
          ...state.messages,
          [convId]: loadMore ? [...newMsgs, ...existing] : newMsgs,
        },
        hasMore: { ...state.hasMore, [convId]: res.data.has_more },
        messagesLoading: false,
      }));
    } catch (e) {
      console.error('Load messages error:', e);
      set({ messagesLoading: false });
    }
  },

  setActiveConversation: (convId) => {
    set({ activeConversationId: convId });
    if (convId) {
      get().loadMessages(convId);
      get().markRead(convId);
    }
  },

  sendTextMessage: async (convId, content) => {
    try {
      await chatApi.sendMessage(convId, content);
      // Message sẽ đến qua WebSocket
    } catch (e) {
      console.error('Send message error:', e);
      throw e;
    }
  },

  sendFile: async (convId, file, caption = '') => {
    set({ sendingFile: true });
    try {
      await chatApi.uploadFile(convId, file, caption);
      set({ sendingFile: false });
    } catch (e) {
      console.error('Upload file error:', e);
      set({ sendingFile: false });
      throw e;
    }
  },

  markRead: async (convId) => {
    try {
      await chatApi.markAsRead(convId);
      // Update local unread
      set((state) => {
        const conv = state.conversations.find((c) => c.id === convId);
        const removedUnread = conv?.unread_count || 0;
        return {
          conversations: state.conversations.map((c) =>
            c.id === convId ? { ...c, unread_count: 0 } : c
          ),
          unreadTotal: Math.max(0, state.unreadTotal - removedUnread),
        };
      });
      // Gửi WS read event
      const ws = get().ws;
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ action: 'read', conversation_id: convId }));
      }
    } catch (e) {
      console.error('Mark read error:', e);
    }
  },

  sendTyping: (convId, isTyping) => {
    const ws = get().ws;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ action: 'typing', conversation_id: convId, is_typing: isTyping }));
    }
  },

  createDirectConversation: async (userId) => {
    try {
      const res = await chatApi.createConversation({
        type: 'direct',
        member_ids: [userId],
      });
      const conv = res.data;
      set((state) => {
        const exists = state.conversations.some((c) => c.id === conv.id);
        return {
          conversations: exists ? state.conversations : [conv, ...state.conversations],
          activeConversationId: conv.id,
        };
      });
      get().loadMessages(conv.id);
      return conv;
    } catch (e) {
      console.error('Create conversation error:', e);
      throw e;
    }
  },

  createGroupConversation: async (name, memberIds, avatarColor) => {
    try {
      const res = await chatApi.createConversation({
        type: 'group',
        name,
        member_ids: memberIds,
        avatar_color: avatarColor,
      });
      const conv = res.data;
      set((state) => ({
        conversations: [conv, ...state.conversations],
        activeConversationId: conv.id,
      }));
      get().loadMessages(conv.id);
      return conv;
    } catch (e) {
      console.error('Create group error:', e);
      throw e;
    }
  },

  loadChattableUsers: async () => {
    try {
      const res = await chatApi.getChattableUsers();
      set({ chattableUsers: res.data.users || [] });
    } catch (e) {
      console.error('Load users error:', e);
    }
  },

  loadUnreadCount: async () => {
    try {
      const res = await chatApi.getUnreadCount();
      set({ unreadTotal: res.data.unread_count || 0 });
    } catch (e) {
      console.error('Load unread error:', e);
    }
  },

  addGroupMembers: async (convId, userIds) => {
    try {
      const res = await chatApi.addMembers(convId, userIds);
      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === convId ? res.data : c)),
      }));
      return res.data;
    } catch (e) {
      console.error('Add members error:', e);
      throw e;
    }
  },

  removeGroupMember: async (convId, userId) => {
    try {
      await chatApi.removeMember(convId, userId);
      get().loadConversations();
    } catch (e) {
      console.error('Remove member error:', e);
      throw e;
    }
  },

  updateGroup: async (convId, data) => {
    try {
      const res = await chatApi.updateConversation(convId, data);
      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === convId ? res.data : c)),
      }));
      return res.data;
    } catch (e) {
      console.error('Update group error:', e);
      throw e;
    }
  },
}));

export default useChatStore;
