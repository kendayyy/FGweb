import React, { useMemo } from 'react';
import { ProfileDTO, CustomStatus } from '@fg/contracts';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';

export interface ProfileHeaderProps {
  profile: ProfileDTO;
  isOwner?: boolean;
  onEditClick?: () => void;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({ profile, isOwner, onEditClick }) => {
  const formattedCreatedAt = useMemo(() => {
    if (!profile.createdAt) return '';
    try {
      const date = new Date(profile.createdAt);
      return new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    } catch {
      return profile.createdAt;
    }
  }, [profile.createdAt]);

  const getStatusLabel = (status?: CustomStatus): string => {
    switch (status) {
      case 'LOOKING_FOR_TEAM':
        return 'Trạng thái tự chọn: Đang tìm đội';
      case 'PLAYING':
        return 'Trạng thái tự chọn: Đang chơi';
      case 'JUST_CHATTING':
      default:
        return 'Trạng thái tự chọn: Chỉ trò chuyện';
    }
  };

  return (
    <Card padding={24} style={{ marginBottom: '24px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '20px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--border-color)',
              }}
            />
          ) : (
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-action)',
                color: 'var(--btn-primary-text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
                fontWeight: 700,
              }}
            >
              {profile.displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 6px 0' }}>
              {profile.displayName}
            </h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <span
                data-testid="profile-custom-status"
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--color-focus)',
                  backgroundColor: 'var(--bg-hover)',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {getStatusLabel(profile.customStatus)}
              </span>

              <span
                data-testid="profile-created-at"
                style={{ fontSize: '13px', color: 'var(--text-quiet)' }}
              >
                Tham gia: {formattedCreatedAt}
              </span>
            </div>

            {profile.bio && (
              <p style={{ fontSize: '14px', color: 'var(--text-sub)', margin: 0, lineHeight: 1.5 }}>
                {profile.bio}
              </p>
            )}
          </div>
        </div>

        {isOwner && onEditClick && (
          <Button variant="outline" size="md" onClick={onEditClick}>
            Chỉnh sửa
          </Button>
        )}
      </div>
    </Card>
  );
};
