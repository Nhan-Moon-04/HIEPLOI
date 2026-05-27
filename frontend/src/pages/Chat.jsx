/**
 * Chat Page — Full-featured real-time chat
 * Tính năng: 1-1, group, file/ảnh, đã xem, đang soạn, lịch sử, online status
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Input, Button, Avatar, Badge, Spin, Empty, Modal, Select, Upload,
  Tooltip, Dropdown, Typography, Tag, Popconfirm, message as antMessage,
} from 'antd';
import {
  SendOutlined, PaperClipOutlined, SmileOutlined, SearchOutlined,
  TeamOutlined, UserOutlined, PlusOutlined, MoreOutlined,
  FileOutlined, PictureOutlined, LoadingOutlined, ArrowLeftOutlined,
  UsergroupAddOutlined, EditOutlined, DeleteOutlined, CheckOutlined,
  CheckCircleFilled, CloseOutlined,
} from '@ant-design/icons';
import useAuthStore from '../stores/authStore';
import useChatStore from '../stores/chatStore';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';

dayjs.extend(relativeTime);
dayjs.locale('vi');

const { Text } = Typography;

// ── Hàm tiện ích ──────────────────────────────────────────────────────────────

const getAvatarColor = (str) => {
  const colors = [
    '#276EF1', '#05944F', '#E11900', '#FFC043', '#7356BF',
    '#0E8FDD', '#E54C6B', '#2FB67D', '#9B59B6', '#F39C12',
  ];
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const getInitials = (name) => {
  if (!name) return '?';
  return name.charAt(0).toUpperCase();
};

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const formatMsgTime = (dateStr) => {
  if (!dateStr) return '';
  const d = dayjs(dateStr);
  const now = dayjs();
  if (d.isSame(now, 'day')) return d.format('HH:mm');
  if (d.isSame(now.subtract(1, 'day'), 'day')) return 'Hôm qua ' + d.format('HH:mm');
  if (d.isSame(now, 'year')) return d.format('DD/MM HH:mm');
  return d.format('DD/MM/YYYY HH:mm');
};

const formatConvTime = (dateStr) => {
  if (!dateStr) return '';
  const d = dayjs(dateStr);
  const now = dayjs();
  if (d.isSame(now, 'day')) return d.format('HH:mm');
  if (d.isSame(now.subtract(1, 'day'), 'day')) return 'Hôm qua';
  if (d.isSame(now, 'week')) return d.format('dddd');
  return d.format('DD/MM');
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN CHAT COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function Chat() {
  const { user } = useAuthStore();
  const {
    conversations, activeConversationId, messages, hasMore,
    typingUsers, onlineUsers, unreadTotal, wsConnected,
    loading, messagesLoading, chattableUsers, sendingFile,
    connectWS, disconnectWS, loadConversations, loadMessages,
    setActiveConversation, sendTextMessage, sendFile, markRead,
    sendTyping, createDirectConversation, createGroupConversation,
    loadChattableUsers, addGroupMembers, removeGroupMember, updateGroup,
  } = useChatStore();

  const [searchText, setSearchText] = useState('');
  const [inputText, setInputText] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    connectWS();
    loadConversations();
    loadChattableUsers();
    return () => disconnectWS();
  }, []);

  // ── Auto scroll khi có tin mới ────────────────────────────────────────────
  useEffect(() => {
    const activeMsgs = messages[activeConversationId];
    if (activeMsgs && activeMsgs.length > 0) {
      // Chỉ scroll xuống nếu đang ở gần bottom
      const container = messagesContainerRef.current;
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        if (isNearBottom) {
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
      }
    }
  }, [messages[activeConversationId]?.length]);

  // ── Focus input khi chuyển conversation ───────────────────────────────────
  useEffect(() => {
    if (activeConversationId) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [activeConversationId]);

  // ── Active conversation data ──────────────────────────────────────────────
  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId]
  );
  const activeMsgs = messages[activeConversationId] || [];
  const activeTyping = typingUsers[activeConversationId] || {};
  const typingNames = Object.values(activeTyping)
    .map((t) => t.fullName || t.username)
    .filter(Boolean);

  // ── Filtered conversations ────────────────────────────────────────────────
  const filteredConvs = useMemo(() => {
    if (!searchText.trim()) return conversations;
    const s = searchText.toLowerCase();
    return conversations.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(s) ||
        c.members?.some(
          (m) =>
            (m.full_name || '').toLowerCase().includes(s) ||
            (m.username || '').toLowerCase().includes(s)
        )
    );
  }, [conversations, searchText]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !activeConversationId) return;
    setInputText('');
    sendTyping(activeConversationId, false);
    try {
      await sendTextMessage(activeConversationId, text);
    } catch (e) {
      antMessage.error('Gửi tin nhắn thất bại');
      setInputText(text);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    // Debounced typing indicator
    if (activeConversationId) {
      sendTyping(activeConversationId, true);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(activeConversationId, false);
      }, 2000);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversationId) return;
    if (file.size > 30 * 1024 * 1024) {
      antMessage.error('File quá lớn (tối đa 30MB)');
      return;
    }
    try {
      await sendFile(activeConversationId, file);
    } catch (err) {
      antMessage.error('Upload file thất bại');
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSelectConv = (convId) => {
    setActiveConversation(convId);
    setMobileShowChat(true);
  };

  const handleNewDirectChat = async (userId) => {
    setShowNewChat(false);
    try {
      await createDirectConversation(userId);
      setMobileShowChat(true);
    } catch (e) {
      antMessage.error(e.response?.data?.detail || 'Không thể tạo cuộc trò chuyện');
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      antMessage.error('Nhập tên nhóm');
      return;
    }
    if (selectedMembers.length < 1) {
      antMessage.error('Chọn ít nhất 1 thành viên');
      return;
    }
    try {
      await createGroupConversation(groupName.trim(), selectedMembers);
      setShowNewGroup(false);
      setGroupName('');
      setSelectedMembers([]);
      setMobileShowChat(true);
    } catch (e) {
      antMessage.error(e.response?.data?.detail || 'Tạo nhóm thất bại');
    }
  };

  const handleLoadMore = () => {
    if (activeConversationId && hasMore[activeConversationId]) {
      loadMessages(activeConversationId, true);
    }
  };

  const handleScroll = (e) => {
    if (e.target.scrollTop === 0 && hasMore[activeConversationId] && !messagesLoading) {
      handleLoadMore();
    }
    // Mark read khi scroll xuống
    if (activeConversationId) {
      markRead(activeConversationId);
    }
  };

  const handleSaveGroupName = async () => {
    if (!editGroupName.trim() || !activeConversationId) return;
    try {
      await updateGroup(activeConversationId, { name: editGroupName.trim() });
      setIsEditingName(false);
      antMessage.success('Đã đổi tên nhóm');
    } catch (e) {
      antMessage.error('Đổi tên thất bại');
    }
  };

  const handleAddMembersToGroup = async () => {
    if (selectedMembers.length === 0 || !activeConversationId) return;
    try {
      await addGroupMembers(activeConversationId, selectedMembers);
      setShowAddMembers(false);
      setSelectedMembers([]);
      antMessage.success('Đã thêm thành viên');
    } catch (e) {
      antMessage.error(e.response?.data?.detail || 'Thêm thất bại');
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!activeConversationId) return;
    try {
      await removeGroupMember(activeConversationId, userId);
      antMessage.success('Đã xóa thành viên');
    } catch (e) {
      antMessage.error(e.response?.data?.detail || 'Xóa thất bại');
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div className="chat-page">
      {/* ── Conversation List (Sidebar) ──────────────────────────────────── */}
      <div className={`chat-sidebar ${mobileShowChat ? 'chat-sidebar--hidden' : ''}`}>
        <div className="chat-sidebar-header">
          <h2 className="chat-sidebar-title">Tin nhắn</h2>
          <div className="chat-sidebar-actions">
            {user?.role === 'admin' && (
              <Tooltip title="Tạo nhóm">
                <Button
                  type="text" size="small"
                  icon={<UsergroupAddOutlined />}
                  onClick={() => { setShowNewGroup(true); loadChattableUsers(); }}
                  className="chat-action-btn"
                />
              </Tooltip>
            )}
            <Tooltip title="Tin nhắn mới">
              <Button
                type="text" size="small"
                icon={<PlusOutlined />}
                onClick={() => { setShowNewChat(true); loadChattableUsers(); }}
                className="chat-action-btn"
              />
            </Tooltip>
          </div>
        </div>

        <div className="chat-search-wrap">
          <Input
            prefix={<SearchOutlined className="chat-search-icon" />}
            placeholder="Tìm cuộc trò chuyện..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="chat-search-input"
            allowClear
          />
        </div>

        <div className="chat-conv-list">
          {loading ? (
            <div className="chat-center"><Spin /></div>
          ) : filteredConvs.length === 0 ? (
            <div className="chat-empty-state">
              <Empty description="Chưa có cuộc trò chuyện" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowNewChat(true)} style={{ marginTop: 12 }}>
                Bắt đầu nhắn tin
              </Button>
            </div>
          ) : (
            filteredConvs.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const isGroup = conv.type === 'group';
              const otherMember = !isGroup
                ? conv.members?.find((m) => m.user_id !== user?.id)
                : null;
              const isOtherOnline = otherMember ? onlineUsers.has(otherMember.user_id) : false;
              const displayName = conv.name || otherMember?.full_name || otherMember?.username || 'Chat';
              const lastMsg = conv.last_message;
              const lastMsgText = lastMsg
                ? lastMsg.message_type === 'system'
                  ? lastMsg.content
                  : lastMsg.message_type === 'image'
                  ? '📷 Hình ảnh'
                  : lastMsg.message_type === 'file'
                  ? '📎 File'
                  : lastMsg.content
                : '';
              const lastMsgSender =
                lastMsg && lastMsg.sender_id === user?.id
                  ? 'Bạn: '
                  : lastMsg && isGroup
                  ? (lastMsg.sender_name || lastMsg.sender_username || '').split(' ').pop() + ': '
                  : '';

              return (
                <div
                  key={conv.id}
                  className={`chat-conv-item ${isActive ? 'chat-conv-item--active' : ''}`}
                  onClick={() => handleSelectConv(conv.id)}
                >
                  <div className="chat-conv-avatar-wrap">
                    {isGroup ? (
                      <Avatar
                        size={44}
                        style={{ background: conv.avatar_color || '#276EF1', fontWeight: 700, fontSize: 16 }}
                        icon={<TeamOutlined />}
                      />
                    ) : (
                      <Badge dot={isOtherOnline} offset={[-4, 36]} color="#05944F" className="chat-online-badge">
                        <Avatar
                          size={44}
                          style={{ background: getAvatarColor(displayName), fontWeight: 700, fontSize: 16 }}
                        >
                          {getInitials(displayName)}
                        </Avatar>
                      </Badge>
                    )}
                  </div>

                  <div className="chat-conv-info">
                    <div className="chat-conv-top">
                      <span className="chat-conv-name">{displayName}</span>
                      <span className="chat-conv-time">
                        {formatConvTime(lastMsg?.created_at || conv.created_at)}
                      </span>
                    </div>
                    <div className="chat-conv-bottom">
                      <span className="chat-conv-preview">
                        {lastMsgSender}{lastMsgText || 'Bắt đầu trò chuyện...'}
                      </span>
                      {conv.unread_count > 0 && (
                        <span className="chat-conv-badge">{conv.unread_count > 99 ? '99+' : conv.unread_count}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Chat Area ────────────────────────────────────────────────────── */}
      <div className={`chat-main ${!mobileShowChat ? 'chat-main--hidden' : ''}`}>
        {!activeConversationId ? (
          <div className="chat-no-conv">
            <div className="chat-no-conv-icon">💬</div>
            <h3>Chọn cuộc trò chuyện</h3>
            <p>Chọn một cuộc trò chuyện từ danh sách bên trái hoặc bắt đầu cuộc trò chuyện mới</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="chat-header">
              <Button
                type="text" icon={<ArrowLeftOutlined />}
                className="chat-back-btn"
                onClick={() => { setMobileShowChat(false); setShowGroupInfo(false); }}
              />
              <div className="chat-header-info" onClick={() => activeConv?.type === 'group' && setShowGroupInfo(!showGroupInfo)}>
                {activeConv?.type === 'group' ? (
                  <Avatar size={36} style={{ background: activeConv.avatar_color || '#276EF1' }} icon={<TeamOutlined />} />
                ) : (
                  <Badge dot={onlineUsers.has(activeConv?.members?.find(m => m.user_id !== user?.id)?.user_id)} offset={[-2, 30]} color="#05944F">
                    <Avatar size={36} style={{ background: getAvatarColor(activeConv?.name) }}>
                      {getInitials(activeConv?.name)}
                    </Avatar>
                  </Badge>
                )}
                <div className="chat-header-text">
                  <span className="chat-header-name">{activeConv?.name || 'Chat'}</span>
                  <span className="chat-header-status">
                    {activeConv?.type === 'group'
                      ? `${activeConv.members?.length || 0} thành viên`
                      : onlineUsers.has(activeConv?.members?.find(m => m.user_id !== user?.id)?.user_id)
                        ? 'Đang hoạt động'
                        : 'Ngoại tuyến'}
                  </span>
                </div>
              </div>
              <div className="chat-header-actions">
                {activeConv?.type === 'group' && (
                  <Tooltip title="Thông tin nhóm">
                    <Button
                      type="text" size="small"
                      icon={<MoreOutlined style={{ fontSize: 18 }} />}
                      onClick={() => setShowGroupInfo(!showGroupInfo)}
                      className="chat-action-btn"
                    />
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Messages area */}
            <div className="chat-messages" ref={messagesContainerRef} onScroll={handleScroll}>
              {messagesLoading && (
                <div className="chat-loading-more"><Spin size="small" /> Đang tải...</div>
              )}
              {hasMore[activeConversationId] && !messagesLoading && (
                <div className="chat-load-more">
                  <Button type="link" size="small" onClick={handleLoadMore}>
                    Tải tin nhắn cũ hơn
                  </Button>
                </div>
              )}

              {activeMsgs.map((msg, idx) => {
                const isMe = msg.sender_id === user?.id;
                const isSystem = msg.message_type === 'system';
                const prevMsg = idx > 0 ? activeMsgs[idx - 1] : null;
                const showAvatar = !isMe && (!prevMsg || prevMsg.sender_id !== msg.sender_id || prevMsg.message_type === 'system');
                const showTime = !prevMsg ||
                  dayjs(msg.created_at).diff(dayjs(prevMsg.created_at), 'minute') > 5 ||
                  prevMsg.message_type === 'system';

                // Date separator
                const showDateSep = !prevMsg || !dayjs(msg.created_at).isSame(dayjs(prevMsg.created_at), 'day');

                // Read by (chỉ hiển thị cho tin nhắn cuối của mình)
                const isLastMyMsg = isMe && (idx === activeMsgs.length - 1 || activeMsgs[idx + 1]?.sender_id !== user?.id);
                const readByOthers = msg.read_by?.filter(r => r.user_id !== user?.id) || [];

                return (
                  <div key={msg.id}>
                    {showDateSep && (
                      <div className="chat-date-sep">
                        <span>{dayjs(msg.created_at).isSame(dayjs(), 'day') ? 'Hôm nay' : dayjs(msg.created_at).format('DD/MM/YYYY')}</span>
                      </div>
                    )}

                    {isSystem ? (
                      <div className="chat-system-msg">
                        <span>{msg.content}</span>
                      </div>
                    ) : (
                      <div className={`chat-msg ${isMe ? 'chat-msg--me' : 'chat-msg--other'}`}>
                        {!isMe && (
                          <div className="chat-msg-avatar">
                            {showAvatar ? (
                              <Avatar size={28} style={{ background: getAvatarColor(msg.sender_name || msg.sender_username), fontSize: 11 }}>
                                {getInitials(msg.sender_name || msg.sender_username)}
                              </Avatar>
                            ) : <div style={{ width: 28 }} />}
                          </div>
                        )}

                        <div className="chat-msg-content">
                          {showAvatar && !isMe && activeConv?.type === 'group' && (
                            <div className="chat-msg-sender">{msg.sender_name || msg.sender_username}</div>
                          )}

                          <div className={`chat-bubble ${isMe ? 'chat-bubble--me' : 'chat-bubble--other'}`}>
                            {/* Image message */}
                            {msg.message_type === 'image' && msg.file_url && (
                              <div className="chat-bubble-image">
                                <img
                                  src={msg.file_url}
                                  alt={msg.file_name || 'Image'}
                                  onClick={() => window.open(msg.file_url, '_blank')}
                                />
                              </div>
                            )}

                            {/* File message */}
                            {msg.message_type === 'file' && msg.file_url && (
                              <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="chat-bubble-file">
                                <FileOutlined className="chat-file-icon" />
                                <div className="chat-file-info">
                                  <span className="chat-file-name">{msg.file_name || 'File'}</span>
                                  <span className="chat-file-size">{formatFileSize(msg.file_size)}</span>
                                </div>
                              </a>
                            )}

                            {/* Text content */}
                            {msg.content && (
                              <div className="chat-bubble-text">{msg.content}</div>
                            )}

                            <div className="chat-bubble-time">
                              {formatMsgTime(msg.created_at)}
                              {isMe && (
                                <span className="chat-bubble-status">
                                  {readByOthers.length > 0 ? (
                                    <CheckCircleFilled className="chat-read-icon" />
                                  ) : (
                                    <CheckOutlined className="chat-sent-icon" />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Read receipts */}
                          {isLastMyMsg && readByOthers.length > 0 && (
                            <div className="chat-read-receipt">
                              <Tooltip title={readByOthers.map(r => r.full_name || r.username).join(', ')}>
                                <span className="chat-read-text">
                                  Đã xem {activeConv?.type === 'group' ? `(${readByOthers.length})` : ''}
                                </span>
                              </Tooltip>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Typing indicator */}
              {typingNames.length > 0 && (
                <div className="chat-msg chat-msg--other">
                  <div className="chat-msg-avatar">
                    <Avatar size={28} style={{ background: '#bbb', fontSize: 11 }}>...</Avatar>
                  </div>
                  <div className="chat-msg-content">
                    <div className="chat-typing-indicator">
                      <div className="chat-typing-dots">
                        <span></span><span></span><span></span>
                      </div>
                      <span className="chat-typing-text">
                        {typingNames.join(', ')} đang soạn tin...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="chat-input-area">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileSelect}
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar"
              />
              <Tooltip title="Đính kèm file">
                <Button
                  type="text" size="small"
                  icon={sendingFile ? <LoadingOutlined /> : <PaperClipOutlined />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendingFile}
                  className="chat-attach-btn"
                />
              </Tooltip>

              <div className="chat-input-wrap">
                <Input.TextArea
                  ref={inputRef}
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Nhập tin nhắn..."
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  className="chat-input"
                />
              </div>

              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSend}
                disabled={!inputText.trim()}
                className="chat-send-btn"
              />
            </div>
          </>
        )}
      </div>

      {/* ── Group Info Panel ──────────────────────────────────────────────── */}
      {showGroupInfo && activeConv?.type === 'group' && (
        <div className="chat-group-panel">
          <div className="chat-group-panel-header">
            <h3>Thông tin nhóm</h3>
            <Button type="text" icon={<CloseOutlined />} onClick={() => setShowGroupInfo(false)} />
          </div>

          <div className="chat-group-panel-body">
            <div className="chat-group-avatar-section">
              <Avatar size={64} style={{ background: activeConv.avatar_color || '#276EF1' }} icon={<TeamOutlined />} />
              {isEditingName ? (
                <div className="chat-group-edit-name">
                  <Input
                    value={editGroupName}
                    onChange={(e) => setEditGroupName(e.target.value)}
                    onPressEnter={handleSaveGroupName}
                    size="small"
                  />
                  <Button type="primary" size="small" icon={<CheckOutlined />} onClick={handleSaveGroupName} />
                  <Button size="small" onClick={() => setIsEditingName(false)}>Hủy</Button>
                </div>
              ) : (
                <div className="chat-group-name-row">
                  <h4>{activeConv.name}</h4>
                  {user?.role === 'admin' && (
                    <Button type="text" size="small" icon={<EditOutlined />}
                      onClick={() => { setEditGroupName(activeConv.name || ''); setIsEditingName(true); }}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="chat-group-members-section">
              <div className="chat-group-members-header">
                <span>Thành viên ({activeConv.members?.length || 0})</span>
                {user?.role === 'admin' && (
                  <Button type="link" size="small" icon={<PlusOutlined />}
                    onClick={() => { setShowAddMembers(true); loadChattableUsers(); setSelectedMembers([]); }}
                  >Thêm</Button>
                )}
              </div>
              <div className="chat-group-members-list">
                {activeConv.members?.map((m) => (
                  <div key={m.user_id} className="chat-group-member-item">
                    <Badge dot={onlineUsers.has(m.user_id)} offset={[-2, 24]} color="#05944F">
                      <Avatar size={32} style={{ background: getAvatarColor(m.full_name || m.username), fontSize: 12 }}>
                        {getInitials(m.full_name || m.username)}
                      </Avatar>
                    </Badge>
                    <div className="chat-group-member-info">
                      <span className="chat-group-member-name">
                        {m.full_name || m.username}
                        {m.user_id === user?.id && <Tag color="blue" style={{ marginLeft: 6, fontSize: 10 }}>Bạn</Tag>}
                        {m.role === 'admin' && <Tag color="gold" style={{ marginLeft: 4, fontSize: 10 }}>Admin</Tag>}
                      </span>
                    </div>
                    {user?.role === 'admin' && m.user_id !== user?.id && m.user_id !== activeConv.created_by && (
                      <Popconfirm
                        title={`Xóa ${m.full_name || m.username} khỏi nhóm?`}
                        onConfirm={() => handleRemoveMember(m.user_id)}
                        okText="Xóa" cancelText="Hủy"
                      >
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: New Chat ──────────────────────────────────────────────── */}
      <Modal
        title="Tin nhắn mới"
        open={showNewChat}
        onCancel={() => setShowNewChat(false)}
        footer={null}
        width={400}
        className="chat-modal"
      >
        <div className="chat-new-user-list">
          {chattableUsers.length === 0 ? (
            <Empty description="Không có người dùng nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            chattableUsers.map((u) => (
              <div key={u.id} className="chat-new-user-item" onClick={() => handleNewDirectChat(u.id)}>
                <Badge dot={onlineUsers.has(u.id)} offset={[-2, 30]} color="#05944F">
                  <Avatar size={36} style={{ background: getAvatarColor(u.full_name || u.username) }}>
                    {getInitials(u.full_name || u.username)}
                  </Avatar>
                </Badge>
                <div className="chat-new-user-info">
                  <span className="chat-new-user-name">{u.full_name || u.username}</span>
                  <span className="chat-new-user-role">{u.role === 'admin' ? 'Admin' : u.role}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* ── Modal: New Group ─────────────────────────────────────────────── */}
      <Modal
        title="Tạo nhóm mới"
        open={showNewGroup}
        onCancel={() => { setShowNewGroup(false); setGroupName(''); setSelectedMembers([]); }}
        onOk={handleCreateGroup}
        okText="Tạo nhóm"
        cancelText="Hủy"
        width={450}
        className="chat-modal"
      >
        <div style={{ marginBottom: 16 }}>
          <label className="chat-modal-label">Tên nhóm</label>
          <Input
            placeholder="Nhập tên nhóm..."
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
        </div>
        <div>
          <label className="chat-modal-label">Thành viên</label>
          <Select
            mode="multiple"
            placeholder="Chọn thành viên..."
            style={{ width: '100%' }}
            value={selectedMembers}
            onChange={setSelectedMembers}
            optionLabelProp="label"
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          >
            {chattableUsers.map((u) => (
              <Select.Option key={u.id} value={u.id} label={u.full_name || u.username}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar size={24} style={{ background: getAvatarColor(u.full_name || u.username), fontSize: 10 }}>
                    {getInitials(u.full_name || u.username)}
                  </Avatar>
                  <span>{u.full_name || u.username}</span>
                  <Tag color="default" style={{ marginLeft: 'auto', fontSize: 10 }}>{u.role}</Tag>
                </div>
              </Select.Option>
            ))}
          </Select>
        </div>
      </Modal>

      {/* ── Modal: Add Members ───────────────────────────────────────────── */}
      <Modal
        title="Thêm thành viên"
        open={showAddMembers}
        onCancel={() => { setShowAddMembers(false); setSelectedMembers([]); }}
        onOk={handleAddMembersToGroup}
        okText="Thêm"
        cancelText="Hủy"
        width={400}
        className="chat-modal"
      >
        <Select
          mode="multiple"
          placeholder="Chọn thành viên..."
          style={{ width: '100%' }}
          value={selectedMembers}
          onChange={setSelectedMembers}
          optionLabelProp="label"
          filterOption={(input, option) =>
            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
          }
        >
          {chattableUsers
            .filter((u) => !activeConv?.members?.some((m) => m.user_id === u.id))
            .map((u) => (
              <Select.Option key={u.id} value={u.id} label={u.full_name || u.username}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar size={24} style={{ background: getAvatarColor(u.full_name || u.username), fontSize: 10 }}>
                    {getInitials(u.full_name || u.username)}
                  </Avatar>
                  <span>{u.full_name || u.username}</span>
                </div>
              </Select.Option>
            ))}
        </Select>
      </Modal>
    </div>
  );
}
