import React, { useState, useEffect } from 'react';
import {
  RoomDTO,
  RoomMemberDTO,
  RoomVisibility,
  InvitePolicy,
  HelperPermissionType,
  UpdateRoomSettingsRequest,
} from '@fg/contracts';
import { X, UserX, Crown, Trash2, ArrowRightLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button.js';
import { Alert } from '../../components/ui/Alert.js';

interface RoomSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomDTO;
  members: RoomMemberDTO[];
  actorUserId: string;
  onUpdateSettings: (roomId: string, req: UpdateRoomSettingsRequest) => Promise<void>;
  onUpdateHelperPermissions: (roomId: string, userId: string, perms: HelperPermissionType[]) => Promise<void>;
  onRemoveMember: (roomId: string, userId: string) => Promise<void>;
  onRequestTransferOwner: (newOwnerId: string) => void;
  onRequestDissolveRoom: () => void;
}

const ALL_HELPER_PERMISSIONS: { key: HelperPermissionType; label: string }[] = [
  { key: 'MANAGE_CHAT', label: 'Quản lý Chat' },
  { key: 'MANAGE_CALLS', label: 'Quản lý Cuộc gọi' },
  { key: 'MANAGE_RECRUITMENT', label: 'Quản lý Tuyển thành viên' },
  { key: 'MANAGE_MEMBERS', label: 'Quản lý Thành viên' },
];

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  isOpen,
  onClose,
  room,
  members,
  actorUserId,
  onUpdateSettings,
  onUpdateHelperPermissions,
  onRemoveMember,
  onRequestTransferOwner,
  onRequestDissolveRoom,
}) => {
  const isOwner = room.ownerId === actorUserId;

  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description || '');
  const [visibility, setVisibility] = useState<RoomVisibility>(room.settings.visibility);
  const [invitePolicy, setInvitePolicy] = useState<InvitePolicy>(room.settings.invitePolicy);
  const [playerCapacity, setPlayerCapacity] = useState<number>(room.settings.playerCapacity);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedNewOwnerId, setSelectedNewOwnerId] = useState<string>('');

  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  const prevIsOpenRef = React.useRef(false);
  const prevRoomIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    const roomChanged = isOpen && room.id !== prevRoomIdRef.current;

    if (justOpened || roomChanged) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setName(room.name);
      setDescription(room.description || '');
      setVisibility(room.settings.visibility);
      setInvitePolicy(room.settings.invitePolicy);
      setPlayerCapacity(room.settings.playerCapacity);
      setError(null);
      setSuccessMsg(null);
      const otherMembers = members.filter(m => m.userId !== actorUserId);
      if (otherMembers.length > 0) {
        setSelectedNewOwnerId(otherMembers[0].userId);
      }
      setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 0);
    } else if (!isOpen && prevIsOpenRef.current && previousFocusRef.current) {
      previousFocusRef.current.focus();
    }

    prevIsOpenRef.current = isOpen;
    prevRoomIdRef.current = room.id;
  }, [isOpen, room.id, room.name, room.description, room.settings, members, actorUserId]);

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

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Tên phòng không được để trống.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await onUpdateSettings(room.id, {
        name: name.trim(),
        description: description.trim() || null,
        visibility,
        invitePolicy,
        playerCapacity,
      });
      setSuccessMsg('Đã cập nhật cài đặt phòng.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cập nhật thất bại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleHelperPermission = async (member: RoomMemberDTO, perm: HelperPermissionType) => {
    const currentPerms = (member.permissions || []) as HelperPermissionType[];
    const nextPerms = currentPerms.includes(perm)
      ? currentPerms.filter(p => p !== perm)
      : [...currentPerms, perm];

    setIsLoading(true);
    setError(null);
    try {
      await onUpdateHelperPermissions(room.id, member.userId, nextPerms);
      setSuccessMsg(`Đã cập nhật quyền trợ lý cho ${member.user?.displayName || member.userId}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cập nhật quyền thất bại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setError(null);
    setIsLoading(true);
    try { await onRemoveMember(room.id, userId); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không xóa được thành viên.'); }
    finally { setIsLoading(false); }
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
        className="fg-room-modal-container fg-room-modal-large"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-settings-title"
        onKeyDown={handleKeyDown}
      >
        <div className="fg-room-modal-header">
          <h3 id="room-settings-title">Cài đặt phòng & Thành viên</h3>
          <button
            type="button"
            ref={closeBtnRef}
            aria-label="Đóng cài đặt"
            onClick={onClose}
            disabled={isLoading}
            className="fg-room-modal-close"
          >
            <X size={20} />
          </button>
        </div>

        {error && <Alert type="error" message={error} />}
        {successMsg && <Alert type="success" message={successMsg} />}

        {/* Room Settings Section */}
        {isOwner ? (
          <form onSubmit={handleSaveSettings} className="fg-room-modal-form" style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-focus)', marginBottom: '12px' }}>
              Thông tin phòng
            </h4>

            <div className="fg-room-form-group">
              <label htmlFor="settings-name">Tên phòng</label>
              <input
                id="settings-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="fg-room-form-group">
              <label htmlFor="settings-desc">Mô tả</label>
              <textarea
                id="settings-desc"
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="fg-room-form-row">
              <div className="fg-room-form-group">
                <label htmlFor="settings-vis">Quyền riêng tư</label>
                <select
                  id="settings-vis"
                  value={visibility}
                  onChange={e => setVisibility(e.target.value as RoomVisibility)}
                  disabled={isLoading}
                >
                  <option value="PUBLIC">Công khai</option>
                  <option value="PRIVATE">Riêng tư</option>
                </select>
              </div>

              <div className="fg-room-form-group">
                <label htmlFor="settings-policy">Chính sách mời</label>
                <select
                  id="settings-policy"
                  value={invitePolicy}
                  onChange={e => setInvitePolicy(e.target.value as InvitePolicy)}
                  disabled={isLoading}
                >
                  <option value="OWNER_APPROVAL">Chủ phòng duyệt</option>
                  <option value="DIRECT_MEMBER">Thành viên mời trực tiếp</option>
                </select>
              </div>
            </div>

            <div className="fg-room-form-group">
              <label htmlFor="settings-cap">Sức chứa tối đa (1–10)</label>
              <select
                id="settings-cap"
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <Button type="submit" variant="primary" isLoading={isLoading}>
                Lưu cài đặt
              </Button>
            </div>
          </form>
        ) : (
          <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)' }}>{room.name}</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-sub)', marginTop: '4px' }}>
              {room.description || 'Không có mô tả'}
            </p>
          </div>
        )}

        {/* Member Permissions & Management Section */}
        <div style={{ marginTop: '20px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-focus)', marginBottom: '12px' }}>
            Thành viên phòng ({members.length})
          </h4>

          <div className="fg-room-members-settings-list">
            {members.map(member => {
              const isMemberOwner = member.role === 'OWNER';
              const isMemberSelf = member.userId === actorUserId;

              return (
                <div key={member.userId} className="fg-room-member-settings-item">
                  <div className="fg-room-member-info">
                    <span className="fg-room-member-name">
                      {member.user?.displayName || member.userId}
                      {isMemberOwner && <Crown size={14} color="var(--color-amber-status)" style={{ marginLeft: 6 }} />}
                    </span>
                    <span className="fg-room-member-role-badge">{member.role}</span>
                  </div>

                  {/* Owner management of Helper permissions */}
                  {isOwner && !isMemberOwner && (
                    <div className="fg-room-helper-permissions-toggles">
                      <span style={{ fontSize: '12px', color: 'var(--text-sub)' }}>Quyền trợ lý:</span>
                      {ALL_HELPER_PERMISSIONS.map(perm => {
                        const hasPerm = member.permissions?.includes(perm.key);
                        return (
                          <label key={perm.key} className="fg-room-checkbox-label">
                            <input
                              type="checkbox"
                              checked={hasPerm}
                              disabled={isLoading}
                              onChange={() => void handleToggleHelperPermission(member, perm.key)}
                            />
                            <span>{perm.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Remove member button for owner */}
                  {isOwner && !isMemberOwner && !isMemberSelf && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleRemove(member.userId)}
                      disabled={isLoading}
                      leftIcon={<UserX size={14} />}
                    >
                      Xóa
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Owner Destructive Actions */}
        {isOwner && (
          <div
            style={{
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-red-destructive)' }}>
              Thao tác chủ phòng
            </h4>

            {members.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <select
                  value={selectedNewOwnerId}
                  onChange={e => setSelectedNewOwnerId(e.target.value)}
                  disabled={isLoading}
                  style={{ flex: 1, minWidth: '180px' }}
                >
                  {members
                    .filter(m => m.userId !== actorUserId)
                    .map(m => (
                      <option key={m.userId} value={m.userId}>
                        {m.user?.displayName || m.userId}
                      </option>
                    ))}
                </select>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onRequestTransferOwner(selectedNewOwnerId)}
                  disabled={isLoading || !selectedNewOwnerId}
                  leftIcon={<ArrowRightLeft size={16} />}
                >
                  Chuyển quyền chủ phòng
                </Button>
              </div>
            )}

            <div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={onRequestDissolveRoom}
                disabled={isLoading}
                leftIcon={<Trash2 size={16} />}
              >
                Giải thể phòng này
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
