import React, { useState, useMemo } from 'react';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { X, UserCheck, UserPlus, ShieldAlert } from 'lucide-react';
import { ProfileDTO, PendingFriendRequestDTO } from '@fg/contracts';
import { useAuth } from '../auth/index.js';
import {
  fetchFriends,
  fetchFriendRequests,
  fetchBlocks,
  respondFriendRequest,
  cancelFriendRequest,
  deleteBlock,
} from './api.js';
import { PeerSocialControls } from './PeerSocialControls.tsx';
import { useDialogFocusTrap } from './useDialogFocusTrap.js';

export interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDM?: (conversationId: string) => void;
}

export const FriendsModal: React.FC<FriendsModalProps> = ({ isOpen, onClose, onOpenDM }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'blocks'>('friends');
  const [requestDir, setRequestDir] = useState<'INCOMING' | 'OUTGOING'>('INCOMING');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const actorId = user?.id || null;
  const containerRef = useDialogFocusTrap<HTMLDivElement>(isOpen, onClose);

  const friendsQuery = useInfiniteQuery({
    queryKey: ['friends-infinite', actorId],
    queryFn: ({ pageParam, signal }) =>
      fetchFriends(pageParam ? { cursor: pageParam } : undefined, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    enabled: Boolean(isOpen && actorId),
  });

  const friendRequestsQuery = useInfiniteQuery({
    queryKey: ['friend-requests-infinite', requestDir, actorId],
    queryFn: ({ pageParam, signal }) =>
      fetchFriendRequests(requestDir, pageParam ? { cursor: pageParam } : undefined, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    enabled: Boolean(isOpen && actorId),
  });

  const blocksQuery = useQuery({
    queryKey: ['blocks', actorId],
    queryFn: ({ signal }) => fetchBlocks(signal),
    enabled: Boolean(isOpen && actorId),
  });

  const friends = useMemo(() => {
    if (!friendsQuery.data?.pages) return [];
    const map = new Map<string, ProfileDTO>();
    for (const page of friendsQuery.data.pages) {
      for (const item of page.items) {
        map.set(item.id, item);
      }
    }
    return Array.from(map.values());
  }, [friendsQuery.data?.pages]);

  const requests = useMemo(() => {
    if (!friendRequestsQuery.data?.pages) return [];
    const map = new Map<string, PendingFriendRequestDTO>();
    for (const page of friendRequestsQuery.data.pages) {
      for (const item of page.items) {
        map.set(item.requestId, item);
      }
    }
    return Array.from(map.values());
  }, [friendRequestsQuery.data?.pages]);

  const blocks = blocksQuery.data || [];

  if (!isOpen) return null;

  const handleRefresh = async () => {
    setActionError(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['friends'] }),
      queryClient.invalidateQueries({ queryKey: ['friends-infinite'] }),
      queryClient.invalidateQueries({ queryKey: ['friends-page'] }),
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['friend-requests-infinite'] }),
      queryClient.invalidateQueries({ queryKey: ['requests-incoming-page'] }),
      queryClient.invalidateQueries({ queryKey: ['requests-outgoing-page'] }),
      queryClient.invalidateQueries({ queryKey: ['blocks'] }),
      queryClient.invalidateQueries({ queryKey: ['peer-relationship'] }),
    ]);
  };

  const handleRespond = async (requestId: string, action: 'ACCEPT' | 'REJECT') => {
    setPendingId(requestId);
    setActionError(null);
    try {
      await respondFriendRequest(requestId, action);
      await handleRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Không thể phản hồi lời mời');
    } finally {
      setPendingId(null);
    }
  };

  const handleCancel = async (requestId: string) => {
    setPendingId(requestId);
    setActionError(null);
    try {
      await cancelFriendRequest(requestId);
      await handleRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Không thể hủy lời mời');
    } finally {
      setPendingId(null);
    }
  };

  const handleUnblock = async (blockedId: string) => {
    setPendingId(blockedId);
    setActionError(null);
    try {
      await deleteBlock(blockedId);
      await handleRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Không thể bỏ chặn');
    } finally {
      setPendingId(null);
    }
  };

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
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Bạn bè & Lời mời"
      data-testid="friends-modal"
    >
      <div
        className="fg-modal-card"
        style={{
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
            Bạn bè & Lời mời
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-quiet)',
              cursor: 'pointer',
              padding: '4px',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-sidebar)',
          }}
          role="tablist"
        >
          <button
            role="tab"
            aria-selected={activeTab === 'friends'}
            onClick={() => { setActiveTab('friends'); setActionError(null); }}
            style={{
              flex: 1,
              padding: '12px 16px',
              minHeight: '44px',
              border: 'none',
              backgroundColor: 'transparent',
              color: activeTab === 'friends' ? 'var(--color-focus)' : 'var(--text-sub)',
              borderBottom: activeTab === 'friends' ? '2px solid var(--color-focus)' : 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <UserCheck size={16} /> Bạn bè ({friends.length})
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'requests'}
            onClick={() => { setActiveTab('requests'); setActionError(null); }}
            style={{
              flex: 1,
              padding: '12px 16px',
              minHeight: '44px',
              border: 'none',
              backgroundColor: 'transparent',
              color: activeTab === 'requests' ? 'var(--color-focus)' : 'var(--text-sub)',
              borderBottom: activeTab === 'requests' ? '2px solid var(--color-focus)' : 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <UserPlus size={16} /> Lời mời
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'blocks'}
            onClick={() => { setActiveTab('blocks'); setActionError(null); }}
            style={{
              flex: 1,
              padding: '12px 16px',
              minHeight: '44px',
              border: 'none',
              backgroundColor: 'transparent',
              color: activeTab === 'blocks' ? 'var(--color-focus)' : 'var(--text-sub)',
              borderBottom: activeTab === 'blocks' ? '2px solid var(--color-focus)' : 'none',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <ShieldAlert size={16} /> Đã chặn ({blocks.length})
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {actionError && (
            <div role="alert" style={{ color: 'var(--color-danger)', fontSize: '13px', marginBottom: '12px', textAlign: 'center' }}>
              {actionError}
            </div>
          )}

          {activeTab === 'friends' && (
            <div>
              {friendsQuery.isLoading ? (
                <p style={{ color: 'var(--text-quiet)', textAlign: 'center', padding: '24px' }}>Đang tải danh sách bạn bè...</p>
              ) : friendsQuery.isError ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-danger)' }}>
                  <p style={{ marginBottom: '8px' }}>Không thể tải danh sách bạn bè.</p>
                  <button
                    type="button"
                    onClick={() => friendsQuery.refetch()}
                    style={{
                      padding: '6px 16px',
                      minHeight: '44px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-raised)',
                      color: 'var(--text-main)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Thử lại
                  </button>
                </div>
              ) : friends.length === 0 ? (
                <p style={{ color: 'var(--text-quiet)', textAlign: 'center', padding: '24px' }}>Chưa có bạn bè nào.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {friends.map((friend) => (
                    <div
                      key={friend.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        backgroundColor: 'var(--bg-raised)',
                        borderRadius: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--color-action)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--btn-primary-text)',
                            fontWeight: 700,
                          }}
                        >
                          {friend.displayName.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                            {friend.displayName}
                          </div>
                          {friend.customStatus && (
                            <div style={{ fontSize: '12px', color: 'var(--text-quiet)' }}>
                              {friend.customStatus}
                            </div>
                          )}
                        </div>
                      </div>
                      <PeerSocialControls
                        targetUser={friend}
                        onDMOpen={(convId) => {
                          onClose();
                          if (onOpenDM) onOpenDM(convId);
                        }}
                      />
                    </div>
                  ))}
                  {friendsQuery.hasNextPage && (
                    <button
                      type="button"
                      onClick={() => friendsQuery.fetchNextPage()}
                      disabled={friendsQuery.isFetchingNextPage}
                      style={{
                        alignSelf: 'center',
                        marginTop: '8px',
                        padding: '8px 16px',
                        minHeight: '44px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-raised)',
                        color: 'var(--text-main)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: friendsQuery.isFetchingNextPage ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {friendsQuery.isFetchingNextPage ? 'Đang tải...' : 'Tải thêm'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'requests' && (
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <button
                  type="button"
                  onClick={() => { setRequestDir('INCOMING'); setActionError(null); }}
                  style={{
                    padding: '6px 12px',
                    minHeight: '44px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: requestDir === 'INCOMING' ? 'var(--color-action)' : 'var(--bg-raised)',
                    color: 'var(--btn-primary-text)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Nhận được
                </button>
                <button
                  type="button"
                  onClick={() => { setRequestDir('OUTGOING'); setActionError(null); }}
                  style={{
                    padding: '6px 12px',
                    minHeight: '44px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: requestDir === 'OUTGOING' ? 'var(--color-action)' : 'var(--bg-raised)',
                    color: 'var(--btn-primary-text)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Đã gửi
                </button>
              </div>

              {friendRequestsQuery.isLoading ? (
                <p style={{ color: 'var(--text-quiet)', textAlign: 'center', padding: '24px' }}>Đang tải danh sách lời mời...</p>
              ) : friendRequestsQuery.isError ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-danger)' }}>
                  <p style={{ marginBottom: '8px' }}>Không thể tải danh sách lời mời.</p>
                  <button
                    type="button"
                    onClick={() => friendRequestsQuery.refetch()}
                    style={{
                      padding: '6px 16px',
                      minHeight: '44px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-raised)',
                      color: 'var(--text-main)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Thử lại
                  </button>
                </div>
              ) : requests.length === 0 ? (
                <p style={{ color: 'var(--text-quiet)', textAlign: 'center', padding: '24px' }}>Chưa có lời mời nào.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {requests.map((req) => {
                    const peer = requestDir === 'INCOMING' ? req.sender : req.receiver;
                    const isPending = pendingId === req.requestId;
                    return (
                      <div
                        key={req.requestId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          backgroundColor: 'var(--bg-raised)',
                          borderRadius: '8px',
                          opacity: isPending ? 0.6 : 1,
                        }}
                      >
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                          {peer.displayName}
                        </div>
                        {requestDir === 'INCOMING' ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleRespond(req.requestId, 'ACCEPT')}
                              style={{
                                padding: '4px 10px',
                                minHeight: '44px',
                                borderRadius: '6px',
                                border: 'none',
                                backgroundColor: 'var(--color-online)',
                                color: '#000000',
                                fontWeight: 600,
                                fontSize: '12px',
                                cursor: isPending ? 'not-allowed' : 'pointer',
                              }}
                            >
                              Chấp nhận
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleRespond(req.requestId, 'REJECT')}
                              style={{
                                padding: '4px 10px',
                                minHeight: '44px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'transparent',
                                color: 'var(--text-main)',
                                fontWeight: 500,
                                fontSize: '12px',
                                cursor: isPending ? 'not-allowed' : 'pointer',
                              }}
                            >
                              Từ chối
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleCancel(req.requestId)}
                            style={{
                              padding: '4px 10px',
                              minHeight: '44px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)',
                              backgroundColor: 'transparent',
                              color: 'var(--text-sub)',
                              fontWeight: 500,
                              fontSize: '12px',
                              cursor: isPending ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Hủy lời mời
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {friendRequestsQuery.hasNextPage && (
                    <button
                      type="button"
                      onClick={() => friendRequestsQuery.fetchNextPage()}
                      disabled={friendRequestsQuery.isFetchingNextPage}
                      style={{
                        alignSelf: 'center',
                        marginTop: '8px',
                        padding: '8px 16px',
                        minHeight: '44px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-raised)',
                        color: 'var(--text-main)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: friendRequestsQuery.isFetchingNextPage ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {friendRequestsQuery.isFetchingNextPage ? 'Đang tải...' : 'Tải thêm'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'blocks' && (
            <div>
              {blocksQuery.isLoading ? (
                <p style={{ color: 'var(--text-quiet)', textAlign: 'center', padding: '24px' }}>Đang tải danh sách chặn...</p>
              ) : blocksQuery.isError ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-danger)' }}>
                  <p style={{ marginBottom: '8px' }}>Không thể tải danh sách chặn.</p>
                  <button
                    type="button"
                    onClick={() => blocksQuery.refetch()}
                    style={{
                      padding: '6px 16px',
                      minHeight: '44px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-raised)',
                      color: 'var(--text-main)',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Thử lại
                  </button>
                </div>
              ) : blocks.length === 0 ? (
                <p style={{ color: 'var(--text-quiet)', textAlign: 'center', padding: '24px' }}>Chưa chặn ai.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {blocks.map((block) => {
                    const isPending = pendingId === block.blockedId;
                    return (
                      <div
                        key={block.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          backgroundColor: 'var(--bg-raised)',
                          borderRadius: '8px',
                          opacity: isPending ? 0.6 : 1,
                        }}
                      >
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                          {block.blockedUser?.displayName || block.blockedId}
                        </div>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleUnblock(block.blockedId)}
                          style={{
                            padding: '4px 10px',
                            minHeight: '44px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'transparent',
                            color: 'var(--text-main)',
                            fontWeight: 500,
                            fontSize: '12px',
                            cursor: isPending ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Bỏ chặn
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

