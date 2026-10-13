import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GameTitle, RoomVisibility, InvitePolicy, CreateRoomRequest, GameDTO } from '@fg/contracts';
import { X } from 'lucide-react';
import { fetchGames } from '../lobby/api.js';
import { Button } from '../../components/ui/Button.js';
import { Alert } from '../../components/ui/Alert.js';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (request: CreateRoomRequest) => Promise<void>;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ isOpen, onClose, onSubmit }) => {
  // Query real games catalog from API (returns GameDTO[] with actual UUID ids)
  const gamesQuery = useQuery({
    queryKey: ['gamesCatalog'],
    queryFn: ({ signal }) => fetchGames(signal),
    staleTime: 1000 * 60 * 10,
  });

  const gamesCatalog: GameDTO[] = gamesQuery.data ?? [];

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [visibility, setVisibility] = useState<RoomVisibility>('PUBLIC');
  const [invitePolicy, setInvitePolicy] = useState<InvitePolicy>('OWNER_APPROVAL');
  const [playerCapacity, setPlayerCapacity] = useState<number>(5);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (isOpen && !openedRef.current) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setName('');
      setDescription('');
      if (gamesCatalog.length > 0) {
        setSelectedGameId(gamesCatalog[0].id);
      }
      setVisibility('PUBLIC');
      setInvitePolicy('OWNER_APPROVAL');
      setPlayerCapacity(5);
      setError(null);
      closeBtnRef.current?.focus();
    } else if (!isOpen && openedRef.current && previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
    openedRef.current = isOpen;
  }, [isOpen, gamesCatalog]);

  useEffect(() => {
    if (isOpen && !selectedGameId && gamesCatalog.length) setSelectedGameId(gamesCatalog[0].id);
  }, [isOpen, selectedGameId, gamesCatalog]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !isLoading) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === 'Tab' && dialogRef.current) {
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vui lòng nhập tên phòng.');
      return;
    }

    const selectedGame = gamesCatalog.find(g => g.id === selectedGameId) || gamesCatalog[0];
    if (!selectedGame) {
      setError('Vui lòng chọn game từ danh mục.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const payload: CreateRoomRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        gameId: selectedGame.id, // Real catalog UUID!
        gameTitle: selectedGame.title as GameTitle,
        visibility,
        invitePolicy,
        playerCapacity,
      };

      await onSubmit(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tạo phòng thất bại.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fg-room-modal-overlay"
      onClick={e => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="fg-room-modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-room-title"
        onKeyDown={handleKeyDown}
      >
        <div className="fg-room-modal-header">
          <h3 id="create-room-title">Tạo phòng mới</h3>
          <button
            type="button"
            ref={closeBtnRef}
            aria-label="Đóng bảng tạo phòng"
            onClick={onClose}
            disabled={isLoading}
            className="fg-room-modal-close"
          >
            <X size={20} />
          </button>
        </div>

        {error && <Alert type="error" message={error} />}

        <form onSubmit={handleSubmit} className="fg-room-modal-form">
          <div className="fg-room-form-group">
            <label htmlFor="room-name-input">Tên phòng *</label>
            <input
              id="room-name-input"
              type="text"
              required
              maxLength={100}
              placeholder="VD: Leo rank Kim Cương LOL..."
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="fg-room-form-group">
            <label htmlFor="room-game-select">Chọn Game *</label>
            <select
              id="room-game-select"
              value={selectedGameId}
              onChange={e => setSelectedGameId(e.target.value)}
              disabled={isLoading || gamesQuery.isLoading}
            >
              {gamesCatalog.map(game => (
                <option key={game.id} value={game.id}>
                  {game.title}
                </option>
              ))}
            </select>
          </div>

          <div className="fg-room-form-group">
            <label htmlFor="room-desc-input">Mô tả phòng</label>
            <textarea
              id="room-desc-input"
              maxLength={500}
              rows={3}
              placeholder="Mô tả mục tiêu, yêu cầu rank hoặc ghi chú..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="fg-room-form-row">
            <div className="fg-room-form-group">
              <label htmlFor="room-visibility-select">Quyền riêng tư</label>
              <select
                id="room-visibility-select"
                value={visibility}
                onChange={e => setVisibility(e.target.value as RoomVisibility)}
                disabled={isLoading}
              >
                <option value="PUBLIC">Công khai (PUBLIC)</option>
                <option value="PRIVATE">Riêng tư (PRIVATE)</option>
              </select>
            </div>

            <div className="fg-room-form-group">
              <label htmlFor="room-policy-select">Chính sách mời</label>
              <select
                id="room-policy-select"
                value={invitePolicy}
                onChange={e => setInvitePolicy(e.target.value as InvitePolicy)}
                disabled={isLoading}
              >
                <option value="OWNER_APPROVAL">Chủ phòng duyệt (OWNER_APPROVAL)</option>
                <option value="DIRECT_MEMBER">Thành viên mời trực tiếp (DIRECT_MEMBER)</option>
              </select>
            </div>
          </div>

          <div className="fg-room-form-group">
            <label htmlFor="room-capacity-select">Số lượng người chơi tối đa (1–10)</label>
            <select
              id="room-capacity-select"
              value={playerCapacity}
              onChange={e => setPlayerCapacity(Number(e.target.value))}
              disabled={isLoading}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(cap => (
                <option key={cap} value={cap}>
                  {cap} người chơi
                </option>
              ))}
            </select>
          </div>

          <div className="fg-room-modal-actions">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" isLoading={isLoading}>
              Tạo phòng
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
