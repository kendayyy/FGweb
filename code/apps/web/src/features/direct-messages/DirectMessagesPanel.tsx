import {InitialLoading} from '../../components/ui/InitialLoading.js';
import React, { useState, useEffect } from 'react';
import { X, MessageCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../auth/index.js';
import { PrivateChatPane } from '../crypto/PrivateChatPane';
import { useDirectMessages, DMState } from './useDirectMessages.ts';
import { useDialogFocusTrap } from '../friends/useDialogFocusTrap.js';

export interface DirectMessagesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialConversationId?: string | null;
  dm?: DMState;
}

export const DirectMessagesPanel: React.FC<DirectMessagesPanelProps> = (props) => {
  if (props.dm) {
    return <DirectMessagesPanelPresentation {...props} dm={props.dm} />;
  }
  return <DirectMessagesPanelWithHook {...props} />;
};

function DirectMessagesPanelWithHook(props: DirectMessagesPanelProps) {
  const dm = useDirectMessages();
  return <DirectMessagesPanelPresentation {...props} dm={dm} />;
}

function DirectMessagesPanelPresentation({
  isOpen,
  onClose,
  initialConversationId,
  dm,
}: DirectMessagesPanelProps & { dm: DMState }) {
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState(false);

  const containerRef = useDialogFocusTrap<HTMLDivElement>(isOpen, () => {
    dm.setActiveConversationId(null);
    onClose();
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const { setActiveConversationId } = dm;

  useEffect(() => {
    if (isOpen && initialConversationId) {
      setActiveConversationId(initialConversationId);
    }
  }, [isOpen, initialConversationId, setActiveConversationId]);

  if (!isOpen || !user) return null;

  const handleClose = () => {
    setActiveConversationId(null);
    onClose();
  };

  const activePeer = dm.activePeer;
  const showSidebar = !isMobile || !dm.activeConversationId;
  const showMain = !isMobile || Boolean(dm.activeConversationId);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fg-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--bg-overlay-heavy)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: isMobile ? '8px' : '16px',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Tin nhắn riêng"
      data-testid="direct-messages-panel"
    >
      <div
        className="fg-modal-card"
        style={{
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '900px',
          height: isMobile ? '95vh' : '80vh',
          minHeight: isMobile ? '360px' : '440px',
          display: 'flex',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        {/* Sidebar / Conversation List */}
        {showSidebar && (
          <div
            style={{
              width: isMobile ? '100%' : '280px',
              borderRight: isMobile ? 'none' : '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-sidebar)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '16px',
                borderBottom: '1px solid var(--border-color)',
                fontWeight: 700,
                fontSize: '16px',
                color: 'var(--text-main)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Tin nhắn riêng</span>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Đóng tin nhắn"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-quiet)',
                  cursor: 'pointer',
                  minWidth: '44px',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {dm.isLoadingConversations && dm.conversations.length===0 ? (
                <InitialLoading pending layout="list" label="Đang tải cuộc trò chuyện"/>
              ) : dm.conversationsError ? (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-danger)' }} role="alert">
                  <AlertCircle size={24} style={{ marginBottom: '8px' }} />
                  <p style={{ fontSize: '13px', marginBottom: '12px' }}>
                    {dm.conversationsError.message || 'Không thể tải danh sách cuộc trò chuyện.'}
                  </p>
                  <button
                    type="button"
                    className="fg-btn fg-btn-secondary"
                    onClick={() => dm.refetchConversations()}
                    style={{ minHeight: '44px', padding: '6px 16px', fontSize: '13px' }}
                  >
                    Thử lại
                  </button>
                </div>
              ) : dm.conversations.length === 0 ? (
                <p style={{ color: 'var(--text-quiet)', textAlign: 'center', padding: '16px', fontSize: '13px' }}>
                  Chưa có cuộc trò chuyện nào.
                </p>
              ) : (
                dm.conversations.map((conv) => {
                  const isActive = conv.conversationId === dm.activeConversationId;
                  const unread = dm.unreadCounts[conv.conversationId] || 0;

                  return (
                    <button
                      key={conv.conversationId}
                      type="button"
                      onClick={() => dm.setActiveConversationId(conv.conversationId)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        backgroundColor: isActive ? 'var(--bg-raised)' : 'transparent',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        marginBottom: '4px',
                        minHeight: '44px',
                      }}
                      data-testid={`dm-conv-item-${conv.conversationId}`}
                    >
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--color-action)',
                          color: 'var(--btn-primary-text)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                        }}
                      >
                        {conv.peer.displayName.slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '14px' }}>
                          {conv.peer.displayName}
                        </div>
                      </div>
                      {unread > 0 && (
                        <span
                          style={{
                            backgroundColor: 'var(--color-action)',
                            color: 'var(--btn-primary-text)',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '10px',
                          }}
                        >
                          {unread}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Main Conversation Thread */}
        {showMain && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-chat)', minWidth: 0 }}>
            {dm.activeConversationId ? (
              activePeer ? (
                <>
                  {/* Header */}
                  <div
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    {isMobile && (
                      <button
                        type="button"
                        onClick={() => dm.setActiveConversationId(null)}
                        aria-label="Quay lại danh sách"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-focus)',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: '4px 8px',
                          minWidth: '44px',
                          minHeight: '44px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        ← Danh sách
                      </button>
                    )}
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-action)',
                        color: 'var(--btn-primary-text)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '14px',
                      }}
                    >
                      {activePeer.displayName.slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '16px', flex: 1, minWidth: 0 }}>
                      {activePeer.displayName}
                    </div>
                    <button
                      type="button"
                      onClick={handleClose}
                      aria-label="Đóng tin nhắn"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-quiet)',
                        cursor: 'pointer',
                        minWidth: '44px',
                        minHeight: '44px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* Error Banner */}
                  {dm.sendError && (
                    <div
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'var(--bg-error-inline)',
                        borderBottom: '1px solid var(--color-danger)',
                        color: 'var(--text-danger)',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                      role="alert"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={16} />
                        <span>{dm.sendError.message || 'Không thể gửi tin nhắn'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={dm.clearSendError}
                        aria-label="Ẩn lỗi"
                        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  <PrivateChatPane key={user.id + ':' + dm.activeConversationId} conversationId={dm.activeConversationId} actorId={user.id}
                    participants={[{id:user.id,displayName:user.displayName},{id:activePeer.id,displayName:activePeer.displayName}]}/>
                </>
              ) : (
                <div style={{ margin: 'auto', textAlign: 'center', padding: '24px' }}>
                  {dm.isLoadingConversations && dm.conversations.length===0 ? (
                    <InitialLoading pending layout="chat" label="Đang tải cuộc trò chuyện"/>
                  ) : dm.conversationsError ? (
                    <div style={{ color: 'var(--text-danger)' }} role="alert">
                      <AlertCircle size={32} style={{ marginBottom: '8px' }} />
                      <p style={{ marginBottom: '12px' }}>
                        {dm.conversationsError.message || 'Không thể tải danh sách cuộc trò chuyện.'}
                      </p>
                      <button
                        type="button"
                        className="fg-btn fg-btn-secondary"
                        onClick={() => dm.refetchConversations()}
                        style={{ minHeight: '44px', padding: '6px 16px', fontSize: '13px' }}
                      >
                        Thử lại
                      </button>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-quiet)' }}>
                      <p style={{ marginBottom: '12px' }}>Đang tìm thông tin cuộc trò chuyện...</p>
                      <button
                        type="button"
                        className="fg-btn fg-btn-secondary"
                        onClick={() => dm.refetchConversations()}
                        style={{ minHeight: '44px', padding: '6px 16px', fontSize: '13px' }}
                      >
                        Thử lại
                      </button>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-quiet)' }}>
                <MessageCircle size={40} style={{ marginBottom: '12px' }} />
                <p>Chọn một cuộc trò chuyện để bắt đầu nhắn tin</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


