import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { GameDTO, CustomStatus } from '@fg/contracts';
import { useAuth } from '../auth/index.js';
import { usePresence, StatusSelector, CUSTOM_STATUS_LABELS } from '../presence/index.js';
import '../presence/presence.css';

export function OnlineUsers({ game }: { game: GameDTO }) {
  const auth = useAuth();
  const actorKey = `${auth.user?.id ?? 'guest'}:${auth.isSigningOut}`;
  const presence = usePresence(game, actorKey);
  const [attemptedStatus, setAttemptedStatus] = useState<CustomStatus | null>(null);

  const canSelectStatus = Boolean(
    auth.user && !auth.isLoading && !auth.isError && !auth.isSigningOut
  );

  const handleStatusChange = (newStatus: CustomStatus) => {
    setAttemptedStatus(newStatus);
    void presence.saveStatus(newStatus);
  };

  const handleRetrySave = () => {
    if (attemptedStatus) {
      void presence.saveStatus(attemptedStatus);
    }
  };

  return (
    <div className="fg-online-users-panel">
      <div className="fg-online-header">
        <h2>Cộng đồng ({presence.onlineUsers.length})</h2>
        {presence.connection === 'offline' && (
          <span className="fg-presence-connection" role="status">
            Mất kết nối
          </span>
        )}
        {presence.connection === 'connecting' && (
          <span className="fg-presence-connection" role="status">
            Đang kết nối…
          </span>
        )}
      </div>

      {canSelectStatus && (
        <StatusSelector
          status={presence.selectedStatus}
          isSaving={presence.isSavingStatus}
          error={presence.saveStatusError}
          onChange={handleStatusChange}
          onRetry={handleRetrySave}
        />
      )}

      {presence.isLoading && (
        <p className="fg-online-state" role="status">
          Đang tải danh sách online…
        </p>
      )}

      {presence.isError && (
        <div className="fg-online-state" role="alert">
          Không tải được danh sách online.{' '}
          <button className="fg-btn-retry" onClick={() => void presence.retry()}>
            Thử lại
          </button>
        </div>
      )}

      {!presence.isLoading && !presence.isError && presence.onlineUsers.length === 0 && (
        <div className="fg-online-empty" role="status">
          Chưa có người chơi online trong Lobby này.
        </div>
      )}

      {!presence.isLoading && presence.onlineUsers.length > 0 && (
        <ul className="fg-online-list" aria-label="Danh sách người chơi online">
          {presence.onlineUsers.map((user) => (
            <li key={user.id} className="fg-online-item">
              <Link
                to={`/users/${encodeURIComponent(user.id)}/profile`}
                className="fg-online-profile-link"
                aria-label={`Hồ sơ ${user.displayName}`}
              >
                <div className="fg-online-avatar">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" />
                  ) : (
                    <span>{user.displayName.slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="fg-online-dot" title="Online" aria-hidden="true" />
                </div>
                <div className="fg-online-info">
                  <span className="fg-online-name">{user.displayName}</span>
                  <span className="fg-online-status-badge">
                    {CUSTOM_STATUS_LABELS[user.customStatus] ?? user.customStatus}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {presence.loadMoreError && (
        <div className="fg-online-load-more-error" role="alert">
          <span>{presence.loadMoreError}</span>
          <button className="fg-btn-retry-more" onClick={() => void presence.loadMore()}>
            Thử lại
          </button>
        </div>
      )}

      {presence.hasMore && !presence.loadMoreError && (
        <button
          className="fg-load-more-online"
          disabled={presence.loadingMore}
          onClick={() => void presence.loadMore()}
        >
          {presence.loadingMore ? 'Đang tải…' : 'Xem thêm'}
        </button>
      )}
    </div>
  );
}
