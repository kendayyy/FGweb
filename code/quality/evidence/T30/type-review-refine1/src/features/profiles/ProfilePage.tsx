import React, { useState, useEffect } from 'react';
import {GameTitleSchema} from '@fg/contracts';
import {GameLogo} from '../../components/ui/GameLogo.js';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicProfile, fetchGames } from './api.js';
import { ProfileHeader } from './ProfileHeader.js';
import { ProfileEditor } from './ProfileEditor.js';
import { useAuth } from '../auth/index.js';
import { Spinner } from '../../components/ui/Spinner.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { PeerSocialControls } from '../friends/index.ts';
import { DirectMessagesPanel, useDirectMessages } from '../direct-messages/index.ts';

export const ProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const dm = useDirectMessages();
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editingGameTitle, setEditingGameTitle] = useState<string | undefined>(undefined);
  const [isEditingBasic, setIsEditingBasic] = useState<boolean>(false);
  const [isDMOpen, setIsDMOpen] = useState(false);
  const [dmConvId, setDmConvId] = useState<string | null>(null);

  // Reset editor modal when account changes or viewed ID changes
  useEffect(() => {
    setEditingGameId(null);
    setEditingGameTitle(undefined);
    setIsEditingBasic(false);
    setIsDMOpen(false);
    setDmConvId(null);
  }, [id, user?.id]);

  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
    error: profileError,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ['profile', id, user?.id],
    queryFn: ({signal}) => fetchPublicProfile(id!,signal),
    enabled: Boolean(id),
    retry: false,
  });

  const { data: games } = useQuery({
    queryKey: ['games'],
    queryFn: ({signal}) => fetchGames(signal),
    staleTime: 1000 * 60 * 10,
  });

  if (isProfileLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: '16px',
        }}
      >
        <Spinner size={40} testId="profile-loading-spinner" />
        <span style={{ color: 'var(--text-sub)', fontSize: '14px' }}>
          Đang tải thông tin hồ sơ...
        </span>
      </div>
    );
  }

  if (isProfileError || !profile) {
    return (
      <div style={{ padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
        <Card data-testid="profile-error-state" padding={28} style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '12px' }}>
            Không tìm thấy hồ sơ người dùng
          </h3>
          <p style={{ color: 'var(--text-sub)', fontSize: '14px', marginBottom: '20px' }}>
            {profileError instanceof Error ? profileError.message : 'Hồ sơ không tồn tại hoặc đã bị ẩn.'}
          </p>
          <Button variant="primary" onClick={() => refetchProfile()}>
            Thử lại
          </Button>
        </Card>
      </div>
    );
  }

  const isOwner = Boolean(user && user.id === profile.id);

  const activeGp = editingGameId && profile.gameProfiles
    ? profile.gameProfiles.find((gp) => {
        return gp.gameId === editingGameId;
      })
    : undefined;

  const handleOpenDM = (convId: string) => {
    setDmConvId(convId);
    setIsDMOpen(true);
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: '1000px', margin: '0 auto' }}>
      <ProfileHeader
        profile={profile}
        isOwner={isOwner}
        onEditClick={() => {
          setIsEditingBasic(true);
          setEditingGameId(null);
        }}
      />

      {/* Peer Social Controls when viewing another user's profile */}
      {!isOwner && user && (
        <div style={{ marginTop: '16px', marginBottom: '24px' }}>
          <PeerSocialControls targetUser={profile} onDMOpen={handleOpenDM} />
        </div>
      )}

      {/* Direct Messages Panel Mount */}
      <DirectMessagesPanel
        isOpen={isDMOpen}
        onClose={() => {
          setIsDMOpen(false);
          setDmConvId(null);
        }}
        initialConversationId={dmConvId}
        dm={dm}
      />

      {isEditingBasic && isOwner && (
        <div style={{ marginBottom: '32px' }}>
          <ProfileEditor
            key={`${user?.id}:basic`}
            initialDisplayName={profile.displayName}
            initialBio={profile.bio || ''}
            initialCustomStatus={profile.customStatus}
            onClose={() => setIsEditingBasic(false)}
            onSaved={() => {
              setIsEditingBasic(false);
              refetchProfile();
            }}
          />
        </div>
      )}

      {editingGameId && isOwner && (
        <div style={{ marginBottom: '32px' }}>
          <ProfileEditor
            key={`${user?.id}:${editingGameId}`}
            gameId={editingGameId}
            gameTitle={editingGameTitle}
            initialInGameName={activeGp?.inGameName || ''}
            initialRank={activeGp?.rank || ''}
            initialRole={activeGp?.role || ''}
            initialPlayHours={activeGp?.playHours}
            initialPlayStyle={activeGp?.playStyle || ''}
            onClose={() => {
              setEditingGameId(null);
              setEditingGameTitle(undefined);
            }}
            onSaved={() => {
              setEditingGameId(null);
              setEditingGameTitle(undefined);
              refetchProfile();
            }}
          />
        </div>
      )}

      {/* Game Profiles Section */}
      <Card padding={24}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '16px' }}>
          Thông tin chi tiết từng game
        </h3>

        {profile.gameProfiles && profile.gameProfiles.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
            {profile.gameProfiles.map((gp) => {
              const matchedGame = games?.find((g) => g.id === gp.gameId);
              const targetGameId = matchedGame ? matchedGame.id : gp.gameId;
              const logoTitle = GameTitleSchema.safeParse(gp.gameTitle);

              return (
                <div
                  key={gp.gameId}
                  style={{
                    backgroundColor: 'var(--bg-canvas)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div>
                    <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 700, color: 'var(--color-focus)', margin: '0 0 10px 0' }}>
                      {logoTitle.success && <GameLogo game={logoTitle.data} decorative/>}
                      {gp.gameTitle}
                    </h4>

                    {gp.inGameName && (
                      <div style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '4px' }}>
                        <strong>IGN:</strong> {gp.inGameName}
                      </div>
                    )}
                    {gp.rank && (
                      <div style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '4px' }}>
                        <strong>Rank:</strong> {gp.rank}
                      </div>
                    )}
                    {gp.role && (
                      <div style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '4px' }}>
                        <strong>Vai trò:</strong> {gp.role}
                      </div>
                    )}
                    {gp.playHours !== undefined && gp.playHours !== null && (
                      <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginBottom: '4px' }}>
                        <strong>Giờ chơi:</strong> {gp.playHours} giờ
                      </div>
                    )}
                    {gp.playStyle && (
                      <div style={{ fontSize: '13px', color: 'var(--text-sub)' }}>
                        <strong>Phong cách:</strong> {gp.playStyle}
                      </div>
                    )}
                  </div>

                  {isOwner && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsEditingBasic(false);
                          setEditingGameId(targetGameId);
                          setEditingGameTitle(gp.gameTitle);
                        }}
                      >
                        Chỉnh sửa {gp.gameTitle}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ fontSize: '14px', color: 'var(--text-quiet)' }}>
            Chưa có thông tin game chi tiết.
          </p>
        )}

        {/* Add Game Profile Button for Owner */}
        {isOwner && games && (
          <div style={{ marginTop: '20px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {games
              .filter((g) => !profile.gameProfiles?.some((gp) => gp.gameId === g.id || gp.gameTitle === g.title))
              .map((g) => (
                <Button
                  key={g.id}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsEditingBasic(false);
                    setEditingGameId(g.id);
                    setEditingGameTitle(g.title);
                  }}
                >
                  + Khai báo {g.title}
                </Button>
              ))}
          </div>
        )}
      </Card>
    </div>
  );
};
