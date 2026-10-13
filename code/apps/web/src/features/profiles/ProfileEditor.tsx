import {GameLogo} from '../../components/ui/GameLogo.js';
import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  UpdateGameProfileRequest,
  CustomStatus,
  GameTitle,
  GameTitleSchema,
} from '@fg/contracts';
import { updateGameProfile, updateProfile, updateInterests } from './api.js';
import { useAuth,fetchMe } from '../auth/index.js';
import {AUTH_QUERY_KEY} from '../auth/AuthProvider.js';
import {useActorMutation} from './useActorMutation.js';
import { Button } from '../../components/ui/Button.js';
import { Alert } from '../../components/ui/Alert.js';
import { Card } from '../../components/ui/Card.js';

export interface ProfileEditorProps {
  gameId?: string;
  gameTitle?: string;
  initialInGameName?: string;
  initialRank?: string;
  initialRole?: string;
  initialPlayHours?: number;
  initialPlayStyle?: string;
  initialDisplayName?: string;
  initialBio?: string;
  initialCustomStatus?: CustomStatus;
  initialInterestedGames?: GameTitle[];
  onClose?: () => void;
  onSaved?: () => void;
}

export const ProfileEditor: React.FC<ProfileEditorProps> = ({
  gameId,
  gameTitle,
  initialInGameName = '',
  initialRank = '',
  initialRole = '',
  initialPlayHours,
  initialPlayStyle = '',
  initialDisplayName,
  initialBio = '',
  initialCustomStatus,
  initialInterestedGames,
  onClose,
  onSaved,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const beginMutation=useActorMutation();

  // Per-game profile form state
  const [inGameName, setInGameName] = useState<string>(initialInGameName);
  const [rank, setRank] = useState<string>(initialRank);
  const [role, setRole] = useState<string>(initialRole);
  const [playHours, setPlayHours] = useState<string>(
    initialPlayHours !== undefined && initialPlayHours !== null ? String(initialPlayHours) : '',
  );
  const [playStyle, setPlayStyle] = useState<string>(initialPlayStyle);

  // Basic profile form state
  const [displayName, setDisplayName] = useState<string>(
    initialDisplayName !== undefined ? initialDisplayName : user?.displayName || '',
  );
  const [bio, setBio] = useState<string>(
    initialBio !== undefined ? initialBio : '',
  );
  const [customStatus, setCustomStatus] = useState<CustomStatus>(
    initialCustomStatus || user?.customStatus || 'JUST_CHATTING',
  );
  const [interestedGames, setInterestedGames] = useState<GameTitle[]>(
    initialInterestedGames || user?.interestedGames || [],
  );

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Synchronize initial values when gameId or initial props change
  useEffect(() => {
    setInGameName(initialInGameName);
    setRank(initialRank);
    setRole(initialRole);
    setPlayHours(initialPlayHours !== undefined && initialPlayHours !== null ? String(initialPlayHours) : '');
    setPlayStyle(initialPlayStyle);
  }, [initialInGameName, initialRank, initialRole, initialPlayHours, initialPlayStyle, user?.id]);

  const toggleInterest = (game: GameTitle) => {
    setInterestedGames((prev) =>
      prev.includes(game) ? prev.filter((g) => g !== game) : [...prev, game],
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const operation=beginMutation();
    if(!operation)return;
    setIsSubmitting(true);

    try {
      if (!gameId) {
        // Basic Profile & Interests edit mode
        const trimmedName = displayName.trim();
        if (trimmedName.length < 2) {
          setErrorMsg('Biệt danh phải có ít nhất 2 ký tự');
          setIsSubmitting(false);
          return;
        }
        if(interestedGames.length===0)throw new Error('Vui lòng chọn ít nhất một game quan tâm.');

        // 1. Update basic profile
        const savedProfile=await updateProfile({
          displayName: trimmedName,
          bio: bio.trim() ? bio.trim() : null, // Empty bio sends null to clear
          customStatus,
        },operation.signal);
        if(!operation.isCurrent())return;
        if(savedProfile.id!==operation.actorId)throw new Error('Không thể xác nhận tài khoản đã lưu.');

        // 2. Update interested games if non-empty
        if (interestedGames.length > 0) {
          const savedInterests=await updateInterests({ interestedGames },operation.signal);
          if(!operation.isCurrent())return;
          if(savedInterests.interestedGames.length!==interestedGames.length||!interestedGames.every(game=>savedInterests.interestedGames.includes(game)))throw new Error('Không thể xác nhận danh sách game đã lưu.');
        }

        // Check if queryClient still has the same active user identity
      } else {
        // Per-game Profile edit mode
        const payload: UpdateGameProfileRequest = {
          inGameName: inGameName.trim() || undefined,
          rank: rank.trim() || undefined, // Blank rank omitted from payload (optional rank)
          role: role.trim() || undefined,
          playHours: playHours.trim() ? Number(playHours.trim()) : undefined,
          playStyle: playStyle.trim() || undefined,
        };

        const savedGame=await updateGameProfile(gameId, payload,operation.signal);
        if(!operation.isCurrent())return;
        if(savedGame.gameId!==gameId)throw new Error('Không thể xác nhận hồ sơ game đã lưu.');

        // Check if queryClient still has the same active user identity
      }
      if(!operation.isCurrent())return;
      const freshUser=await fetchMe();
      if(!operation.isCurrent())return;
      if(freshUser?.id!==operation.actorId)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
      queryClient.setQueryData(AUTH_QUERY_KEY,freshUser);
      onSaved?.();
    } catch (err) {
      // Preserve form inputs intact on failure
      if(operation.isCurrent())setErrorMsg(err instanceof Error ? err.message : 'Có lỗi xảy ra khi lưu thông tin');
    } finally {
      if(operation.isCurrent())setIsSubmitting(false);
      operation.finish();
    }
  };

  return (
    <Card padding={24} style={{ maxWidth: '560px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
          {gameTitle ? `Chỉnh sửa hồ sơ game: ${gameTitle}` : 'Chỉnh sửa thông tin cá nhân'}
        </h3>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Đóng
          </Button>
        )}
      </div>

      {errorMsg && (
        <div role="alert" style={{ marginBottom: '16px' }}>
          <Alert type="error" message={errorMsg} testId="editor-error-alert" />
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {gameId ? (
          <>
            <div>
              <label
                htmlFor="editor-ign"
                style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}
              >
                Tên trong game (IGN)
              </label>
              <input
                id="editor-ign"
                type="text"
                value={inGameName}
                onChange={(e) => setInGameName(e.target.value)}
                disabled={isSubmitting}
                maxLength={50}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0 12px',
                  fontSize: '16px',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="editor-rank"
                style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}
              >
                Rank (Tự khai báo, tùy chọn)
              </label>
              <input
                id="editor-rank"
                type="text"
                value={rank}
                onChange={(e) => setRank(e.target.value)}
                disabled={isSubmitting}
                maxLength={50}
                placeholder="VD: Radiant, Kim Cương..."
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0 12px',
                  fontSize: '16px',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="editor-role"
                style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}
              >
                Vai trò (Role)
              </label>
              <input
                id="editor-role"
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={isSubmitting}
                maxLength={50}
                placeholder="VD: Duelist, Carry, Mid..."
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0 12px',
                  fontSize: '16px',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="editor-hours"
                style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}
              >
                Giờ chơi
              </label>
              <input
                id="editor-hours"
                type="number"
                value={playHours}
                onChange={(e) => setPlayHours(e.target.value)}
                disabled={isSubmitting}
                min={0}
                step={0.5}
                placeholder="VD: 150.5"
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0 12px',
                  fontSize: '16px',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="editor-style"
                style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}
              >
                Phong cách chơi (Playstyle)
              </label>
              <input
                id="editor-style"
                type="text"
                value={playStyle}
                onChange={(e) => setPlayStyle(e.target.value)}
                disabled={isSubmitting}
                maxLength={100}
                placeholder="VD: Aggressive, Tactical..."
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0 12px',
                  fontSize: '16px',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                }}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label
                htmlFor="editor-display-name"
                style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}
              >
                Biệt danh (DisplayName) *
              </label>
              <input
                id="editor-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isSubmitting}
                required
                minLength={2}
                maxLength={50}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0 12px',
                  fontSize: '16px',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="editor-bio"
                style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}
              >
                Giới thiệu bản thân (Bio)
              </label>
              <textarea
                id="editor-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                disabled={isSubmitting}
                maxLength={500}
                rows={3}
                placeholder="Nhập phần tự giới thiệu hoặc để trống để xóa"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '16px',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                  resize: 'vertical',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="editor-status"
                style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}
              >
                Trạng thái tự chọn
              </label>
              <select
                id="editor-status"
                value={customStatus}
                onChange={(e) => setCustomStatus(e.target.value as CustomStatus)}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  padding: '0 12px',
                  fontSize: '16px',
                  backgroundColor: 'var(--bg-canvas)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-main)',
                }}
              >
                <option value="LOOKING_FOR_TEAM">Đang tìm đội</option>
                <option value="PLAYING">Đang chơi</option>
                <option value="JUST_CHATTING">Chỉ trò chuyện</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                Game quan tâm
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                {GameTitleSchema.options.map((game) => {
                  const isChecked = interestedGames.includes(game);
                  return (
                    <label
                      key={game}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        minHeight: '44px',
                        backgroundColor: isChecked ? 'var(--bg-hover)' : 'var(--bg-canvas)',
                        border: `1px solid ${isChecked ? 'var(--color-action)' : 'var(--border-color)'}`,
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: 'var(--text-main)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleInterest(game)}
                        disabled={isSubmitting}
                        style={{ accentColor: 'var(--color-action)' }}
                      />
                      <GameLogo game={game} decorative/><span>{game}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
          {onClose && (
            <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isSubmitting}>
              Hủy
            </Button>
          )}
          <Button type="submit" variant="primary" size="md" isLoading={isSubmitting}>
            Lưu
          </Button>
        </div>
      </form>
    </Card>
  );
};
