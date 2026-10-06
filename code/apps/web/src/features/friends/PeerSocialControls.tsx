import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/index.js';
import {
  fetchFriends,
  fetchFriendRequests,
  fetchBlocks,
  sendFriendRequest,
  respondFriendRequest,
  cancelFriendRequest,
  removeFriend,
  createBlock,
  deleteBlock,
} from './api.js';
import { createDirectConversation } from '../direct-messages/api.js';

export interface PeerSocialControlsProps {
  targetUser: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
  };
  onDMOpen?: (conversationId: string) => void;
  style?: React.CSSProperties;
  className?: string;
}

export const PeerSocialControls: React.FC<PeerSocialControlsProps> = ({
  targetUser,
  onDMOpen,
  style,
  className,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const actorId = user?.id || null;
  const isSelf = Boolean(actorId && actorId === targetUser.id);

  // Relationship Query with multi-page cursor resolution and shared page cache
  const relationshipQuery = useQuery({
    queryKey: ['peer-relationship', actorId, targetUser.id],
    queryFn: async ({ signal }) => {
      const [friendsRes, incomingRes, outgoingRes, blocksRes] = await Promise.all([
        queryClient.fetchQuery({
          queryKey: ['friends-page', actorId, 'first'],
          queryFn: ({ signal }) => fetchFriends(undefined, signal),
          staleTime: 0,
        }),
        queryClient.fetchQuery({
          queryKey: ['requests-incoming-page', actorId, 'first'],
          queryFn: ({ signal }) => fetchFriendRequests('INCOMING', undefined, signal),
          staleTime: 0,
        }),
        queryClient.fetchQuery({
          queryKey: ['requests-outgoing-page', actorId, 'first'],
          queryFn: ({ signal }) => fetchFriendRequests('OUTGOING', undefined, signal),
          staleTime: 0,
        }),
        queryClient.fetchQuery({
          queryKey: ['blocks', actorId],
          queryFn: ({ signal }) => fetchBlocks(signal),
          staleTime: 0,
        }),
      ]);

      const isBlocked = blocksRes.some((b) => b.blockedId === targetUser.id);
      if (isBlocked) {
        return { isFriend: false, isBlocked: true, incomingReq: null, outgoingReq: null };
      }

      let isFriend = friendsRes.items.some((f) => f.id === targetUser.id);
      if (!isFriend && friendsRes.hasMore && friendsRes.nextCursor) {
        let cursor: string | undefined = friendsRes.nextCursor;
        const visited = new Set<string>();
        while (cursor && !visited.has(cursor)) {
          visited.add(cursor);
          if (signal?.aborted) break;
          const currentCursor: string = cursor;
          const page = await queryClient.fetchQuery({
            queryKey: ['friends-page', actorId, currentCursor],
            queryFn: ({ signal }) => fetchFriends({ cursor: currentCursor }, signal),
            staleTime: 0,
          });
          if (page.items.some((f) => f.id === targetUser.id)) {
            isFriend = true;
            break;
          }
          cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined;
        }
      }

      let incomingReq = incomingRes.items.find((r) => r.sender.id === targetUser.id) || null;
      if (!incomingReq && incomingRes.hasMore && incomingRes.nextCursor) {
        let cursor: string | undefined = incomingRes.nextCursor;
        const visited = new Set<string>();
        while (cursor && !visited.has(cursor)) {
          visited.add(cursor);
          if (signal?.aborted) break;
          const currentCursor: string = cursor;
          const page = await queryClient.fetchQuery({
            queryKey: ['requests-incoming-page', actorId, currentCursor],
            queryFn: ({ signal }) => fetchFriendRequests('INCOMING', { cursor: currentCursor }, signal),
            staleTime: 0,
          });
          const match = page.items.find((r) => r.sender.id === targetUser.id);
          if (match) {
            incomingReq = match;
            break;
          }
          cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined;
        }
      }

      let outgoingReq = outgoingRes.items.find((r) => r.receiver.id === targetUser.id) || null;
      if (!outgoingReq && outgoingRes.hasMore && outgoingRes.nextCursor) {
        let cursor: string | undefined = outgoingRes.nextCursor;
        const visited = new Set<string>();
        while (cursor && !visited.has(cursor)) {
          visited.add(cursor);
          if (signal?.aborted) break;
          const currentCursor: string = cursor;
          const page = await queryClient.fetchQuery({
            queryKey: ['requests-outgoing-page', actorId, currentCursor],
            queryFn: ({ signal }) => fetchFriendRequests('OUTGOING', { cursor: currentCursor }, signal),
            staleTime: 0,
          });
          const match = page.items.find((r) => r.receiver.id === targetUser.id);
          if (match) {
            outgoingReq = match;
            break;
          }
          cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined;
        }
      }

      return { isFriend, isBlocked: false, incomingReq, outgoingReq };
    },
    enabled: Boolean(actorId) && !isSelf,
  });

  if (isSelf || !actorId) {
    return null;
  }

  const isQueryLoading = relationshipQuery.isLoading;
  const isQueryError = relationshipQuery.isError;

  const refreshSocialQueries = async () => {
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
      queryClient.invalidateQueries({ queryKey: ['direct-conversations'] }),
    ]);
  };

  if (isQueryLoading) {
    return (
      <div
        className={className || 'fg-peer-controls'}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', ...style }}
        data-testid="peer-social-controls-loading"
        aria-busy="true"
      >
        <span style={{ fontSize: '13px', color: 'var(--text-quiet)' }}>Đang kiểm tra...</span>
      </div>
    );
  }

  if (isQueryError) {
    return (
      <div
        className={className || 'fg-peer-controls'}
        style={{ display: 'flex', alignItems: 'center', gap: '8px', ...style }}
        data-testid="peer-social-controls-error"
        role="alert"
      >
        <span style={{ fontSize: '12px', color: 'var(--color-danger)' }}>
          Không thể tải thông tin mối quan hệ.
        </span>
        <button
          type="button"
          className="fg-btn fg-btn-secondary"
          style={{ padding: '4px 10px', fontSize: '12px', minHeight: '44px', borderRadius: '6px' }}
          onClick={() => refreshSocialQueries()}
        >
          Thử lại
        </button>
      </div>
    );
  }

  const isFriend = relationshipQuery.data?.isFriend ?? false;
  const isBlocked = relationshipQuery.data?.isBlocked ?? false;
  const incomingReq = relationshipQuery.data?.incomingReq ?? null;
  const outgoingReq = relationshipQuery.data?.outgoingReq ?? null;

  const getErrorMessage = (err: unknown, defaultMsg: string): string => {
    if (err instanceof Error && err.message) return err.message;
    return defaultMsg;
  };

  const handleSendRequest = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      await sendFriendRequest(targetUser.id);
      await refreshSocialQueries();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Không thể gửi lời mời kết bạn'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRespondRequest = async (requestId: string, action: 'ACCEPT' | 'REJECT') => {
    setIsLoading(true);
    setActionError(null);
    try {
      await respondFriendRequest(requestId, action);
      await refreshSocialQueries();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Không thể phản hồi lời mời'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    setIsLoading(true);
    setActionError(null);
    try {
      await cancelFriendRequest(requestId);
      await refreshSocialQueries();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Không thể hủy lời mời'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      await removeFriend(targetUser.id);
      await refreshSocialQueries();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Không thể xóa bạn'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleBlock = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      await createBlock(targetUser.id);
      await refreshSocialQueries();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Không thể chặn người dùng'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnblock = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      await deleteBlock(targetUser.id);
      await refreshSocialQueries();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Không thể bỏ chặn'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDM = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const res = await createDirectConversation(targetUser.id);
      await refreshSocialQueries();
      if (onDMOpen) {
        onDMOpen(res.conversationId);
      }
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Không thể mở nhắn tin riêng'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={className || 'fg-peer-controls'}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        alignItems: 'center',
        ...style,
      }}
      data-testid="peer-social-controls"
    >
      {actionError && (
        <div
          role="alert"
          style={{
            width: '100%',
            color: 'var(--color-danger)',
            fontSize: '12px',
            marginBottom: '4px',
          }}
        >
          {actionError}
        </div>
      )}

      {/* DM Button */}
      <button
        type="button"
        className="fg-btn fg-btn-primary"
        style={{
          padding: '6px 14px',
          fontSize: '13px',
          fontWeight: 600,
          minHeight: '44px',
          backgroundColor: 'var(--color-action)',
          color: 'var(--btn-primary-text)',
          border: 'none',
          borderRadius: '8px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.7 : 1,
        }}
        aria-disabled={isLoading}
        onClick={() => {
          if (isLoading) return;
          handleOpenDM();
        }}
        data-testid="btn-open-dm"
      >
        Nhắn tin
      </button>

      {/* Friendship Actions */}
      {isBlocked ? (
        <button
          type="button"
          className="fg-btn fg-btn-secondary"
          style={{
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: 500,
            minHeight: '44px',
            backgroundColor: 'var(--bg-raised)',
            color: 'var(--text-main)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
          disabled={isLoading}
          onClick={handleUnblock}
          data-testid="btn-unblock"
        >
          Bỏ chặn
        </button>
      ) : isFriend ? (
        <button
          type="button"
          className="fg-btn fg-btn-secondary"
          style={{
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: 500,
            minHeight: '44px',
            backgroundColor: 'var(--bg-raised)',
            color: 'var(--text-main)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
          disabled={isLoading}
          onClick={handleRemoveFriend}
          data-testid="btn-remove-friend"
        >
          Hủy kết bạn
        </button>
      ) : incomingReq ? (
        <>
          <button
            type="button"
            className="fg-btn fg-btn-primary"
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              minHeight: '44px',
              backgroundColor: 'var(--color-online)',
              color: '#000000',
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
            disabled={isLoading}
            onClick={() => handleRespondRequest(incomingReq.requestId, 'ACCEPT')}
            data-testid="btn-accept-request"
          >
            Chấp nhận
          </button>
          <button
            type="button"
            className="fg-btn fg-btn-secondary"
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 500,
              minHeight: '44px',
              backgroundColor: 'var(--bg-raised)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
            disabled={isLoading}
            onClick={() => handleRespondRequest(incomingReq.requestId, 'REJECT')}
            data-testid="btn-reject-request"
          >
            Từ chối
          </button>
        </>
      ) : outgoingReq ? (
        <button
          type="button"
          className="fg-btn fg-btn-secondary"
          style={{
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: 500,
            minHeight: '44px',
            backgroundColor: 'var(--bg-raised)',
            color: 'var(--text-sub)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
          disabled={isLoading}
          onClick={() => handleCancelRequest(outgoingReq.requestId)}
          data-testid="btn-cancel-request"
        >
          Đã gửi lời mời (Hủy)
        </button>
      ) : (
        <button
          type="button"
          className="fg-btn fg-btn-secondary"
          style={{
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: 500,
            minHeight: '44px',
            backgroundColor: 'var(--bg-raised)',
            color: 'var(--text-main)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
          disabled={isLoading}
          onClick={handleSendRequest}
          data-testid="btn-send-request"
        >
          Kết bạn
        </button>
      )}

      {/* Block Button */}
      {!isBlocked && (
        <button
          type="button"
          className="fg-btn fg-btn-danger"
          style={{
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: 500,
            minHeight: '44px',
            backgroundColor: 'transparent',
            color: 'var(--color-danger)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
          disabled={isLoading}
          onClick={handleBlock}
          data-testid="btn-block"
        >
          Chặn
        </button>
      )}
    </div>
  );
};
