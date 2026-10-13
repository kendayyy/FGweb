import {GameLogo} from '../../components/ui/GameLogo.js';
import React, { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GameTitle, GameTitleSchema, OnboardingRequest } from '@fg/contracts';
import { submitOnboarding } from './api.js';
import { useAuth, fetchMe } from '../auth/index.js';
import {AUTH_QUERY_KEY} from '../auth/AuthProvider.js';
import {useActorMutation} from '../profiles/useActorMutation.js';
import { Button } from '../../components/ui/Button.js';
import { Alert } from '../../components/ui/Alert.js';
import { Card } from '../../components/ui/Card.js';

// Use shared GameTitleSchema options from @fg/contracts, DO NOT duplicate 7 game enum
export const CATALOG_GAMES: readonly GameTitle[] = GameTitleSchema.options;

export interface OnboardingFormProps {
  defaultDisplayName?: string;
  onSuccess?: () => void;
}

export const OnboardingForm: React.FC<OnboardingFormProps> = ({ defaultDisplayName, onSuccess }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const beginMutation=useActorMutation();

  const [displayName, setDisplayName] = useState<string>(
    defaultDisplayName || user?.displayName || '',
  );
  const [bio, setBio] = useState<string>('');
  const [selectedGames, setSelectedGames] = useState<GameTitle[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleGame = useCallback((game: GameTitle) => {
    setSelectedGames((prev) =>
      prev.includes(game) ? prev.filter((g) => g !== game) : [...prev, game],
    );
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = displayName.trim();
    if (trimmedName.length < 2) {
      setErrorMsg('Biệt danh phải có ít nhất 2 ký tự');
      return;
    }

    if (selectedGames.length === 0) {
      setErrorMsg('Vui lòng chọn ít nhất 1 game quan tâm');
      return;
    }

    const operation=beginMutation();
    if(!operation)return;
    setIsSubmitting(true);
    try {
      const payload: OnboardingRequest = {
        displayName: trimmedName,
        bio: bio.trim() || undefined,
        avatarUrl: user?.avatarUrl || undefined,
        interestedGames: selectedGames,
      };

      const saved=await submitOnboarding(payload,operation.signal);
      if(!operation.isCurrent())return;
      if(saved.id!==operation.actorId)throw new Error('Không thể xác nhận tài khoản đã lưu.');

      // Refresh /me and fetch fresh user identity
      const freshUser = await fetchMe();
      if(!operation.isCurrent())return;

      // Verify same actor, completion status, AND that returned interestedGames matches expected selection

      const hasExpectedInterests =
        freshUser &&
        Array.isArray(freshUser.interestedGames) &&
        freshUser.interestedGames.length===selectedGames.length &&
        selectedGames.every((g) => freshUser.interestedGames!.includes(g));

      if (
        freshUser &&
        freshUser.id===operation.actorId &&
        freshUser.onboardingComplete === true &&
        hasExpectedInterests
      ) {
        queryClient.setQueryData(AUTH_QUERY_KEY,freshUser);
        if (onSuccess) {
          onSuccess();
        }
      } else {
        // Did not pass same-actor or expected interests validation
        setErrorMsg('Dữ liệu game quan tâm nhận từ máy chủ không khớp. Vui lòng thử lại.');
      }
    } catch (err) {
      // Preserve user form inputs intact on failure
      if(operation.isCurrent())setErrorMsg(err instanceof Error ? err.message : 'Có lỗi xảy ra khi hoàn tất thông tin');
    } finally {
      if(operation.isCurrent())setIsSubmitting(false);
      operation.finish();
    }
  };

  return (
    <Card data-testid="onboarding-form" padding={28} style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-main)' }}>
        Hoàn tất hồ sơ ban đầu
      </h2>
      <p style={{ fontSize: '14px', color: 'var(--text-sub)', marginBottom: '24px' }}>
        Chọn biệt danh và các tựa game bạn yêu thích để bắt đầu tìm đội và tham gia cộng đồng FG.
      </p>

      {errorMsg && (
        <div role="alert" style={{ marginBottom: '20px' }}>
          <Alert type="error" message={errorMsg} testId="onboarding-error-alert" />
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label
            htmlFor="onboarding-display-name"
            style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}
          >
            Biệt danh (Nickname) *
          </label>
          <input
            id="onboarding-display-name"
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
            htmlFor="onboarding-bio"
            style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}
          >
            Giới thiệu ngắn (Bio)
          </label>
          <textarea
            id="onboarding-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            disabled={isSubmitting}
            maxLength={500}
            rows={3}
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
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '12px' }}>
            Game bạn quan tâm (Chọn ít nhất 1) *
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '12px',
            }}
          >
            {CATALOG_GAMES.map((game) => {
              const isChecked = selectedGames.includes(game);
              return (
                <label
                  key={game}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 14px',
                    minHeight: '44px',
                    backgroundColor: isChecked ? 'var(--bg-hover)' : 'var(--bg-canvas)',
                    border: `1px solid ${isChecked ? 'var(--color-action)' : 'var(--border-color)'}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    color: 'var(--text-main)',
                    fontSize: '14px',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    aria-label={game}
                    checked={isChecked}
                    onChange={() => toggleGame(game)}
                    disabled={isSubmitting}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--color-action)' }}
                  />
                  <GameLogo game={game} decorative/><span>{game}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
          <Button type="submit" variant="primary" size="lg" isLoading={isSubmitting}>
            Hoàn tất
          </Button>
        </div>
      </form>
    </Card>
  );
};
