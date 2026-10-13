import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { RoomDTO, MeDTO, CreateRoomRequest, UpdateRoomSettingsRequest, HelperPermissionType } from '@fg/contracts';
import { Plus, Settings, LogOut, ArrowLeft } from 'lucide-react';
import { useAuth, LoginForm } from '../auth/index.js';
import { OnboardingPage } from '../onboarding/index.js';
import { PrivateChatPane } from '../crypto/PrivateChatPane';
import { Button } from '../../components/ui/Button.js';
import { Alert } from '../../components/ui/Alert.js';
import { Spinner } from '../../components/ui/Spinner.js';
import {
  fetchOwnRooms,
  fetchRoomDetail,
  fetchRoomMembers,
  createRoom,
  updateRoomSettings,
  updateHelperPermissions,
  removeRoomMember,
  transferRoomOwner,
  dissolveRoom,
  ApiError,
} from './api.js';
import { CreateRoomModal } from './CreateRoomModal.js';
import { RoomSettingsModal } from './RoomSettingsModal.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import { registerAuthCleanup } from '../auth/lifecycle.js';
import './rooms.css';
import {TeamRosterPanel} from '../team-roster/TeamRosterPanel.js';
import {CallPanel} from '../calls/CallPanel.js';

// Guarded outer component enforcing strict hook order
export const RoomsPage: React.FC = () => {
  const { user, isLoading, isError, isSigningOut } = useAuth();
  const { roomId: routeRoomId } = useParams<{ roomId?: string }>();

  if (isLoading || isSigningOut) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Spinner size={48} />
      </div>
    );
  }

  if (!user || isError) {
    return <LoginForm />;
  }

  if (user.onboardingComplete !== true || !Array.isArray(user.interestedGames) || user.interestedGames.length === 0) {
    return <OnboardingPage />;
  }

  // Key inner component by user.id so route transitions preserve accumulated room pages
  return <RoomsPageInner key={user.id} user={user} routeRoomId={routeRoomId} />;
};

interface RoomsPageInnerProps {
  user: MeDTO;
  routeRoomId?: string;
}

const RoomsPageInner: React.FC<RoomsPageInnerProps> = ({ user, routeRoomId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const actorUserId = user.id;

  // Own rooms query using useInfiniteQuery to retain accumulated pages
  const ownRoomsQuery = useInfiniteQuery({
    queryKey: ['ownRooms', actorUserId],
    queryFn: ({ pageParam, signal }) => fetchOwnRooms(pageParam as string | undefined, 50, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    retry: false,
    staleTime: 1000 * 30,
  });

  const roomsList = useMemo(() => {
    if (!ownRoomsQuery.data?.pages) return [];
    const map = new Map<string, RoomDTO>();
    for (const page of ownRoomsQuery.data.pages) {
      for (const room of page.items) {
        map.set(room.id, room);
      }
    }
    return Array.from(map.values());
  }, [ownRoomsQuery.data?.pages]);

  const hasMoreOwnRooms = Boolean(ownRoomsQuery.hasNextPage);

  // Room selection state
  const [implicitRoomId, setSelectedRoomId] = useState<string | null>(null);
  const selectedRoomId = routeRoomId || implicitRoomId;

  useEffect(() => {
    if (routeRoomId) {
      setSelectedRoomId(routeRoomId);
    } else if (roomsList.length > 0 && !selectedRoomId) {
      setSelectedRoomId(roomsList[0].id);
    }
  }, [routeRoomId, roomsList, selectedRoomId]);

  const roomScope = actorUserId + ':' + selectedRoomId;
  const scopeRef = useRef(roomScope);
  scopeRef.current = roomScope;
  const mountedRef = useRef(true);
  const actionControllers = useRef(new Set<AbortController>());
  const isCurrentRoom = () => mountedRef.current && scopeRef.current === roomScope;
  useEffect(() => {
    mountedRef.current = true;
    const abort = () => { mountedRef.current = false; for (const c of actionControllers.current) c.abort(); actionControllers.current.clear(); };
    const unregister = registerAuthCleanup(abort);
    return () => { unregister(); abort(); };
  }, [roomScope]);
  const executeAction = async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (!isCurrentRoom()) throw new Error('Đã đổi phòng hoặc phiên làm việc.');
    const controller = new AbortController(); actionControllers.current.add(controller);
    try { const result = await operation(controller.signal); if (!isCurrentRoom() || controller.signal.aborted) throw new Error('Đã đổi phòng hoặc phiên làm việc.'); return result; }
    finally { actionControllers.current.delete(controller); }
  };

  const handleSelectRoom = (id: string) => {
    setSelectedRoomId(id);
    navigate(`/rooms/${encodeURIComponent(id)}`);
  };

  // Active room detail query (actor & room scoped)
  const roomDetailQuery = useQuery({
    queryKey: ['roomDetail', actorUserId, selectedRoomId],
    queryFn: ({ signal }) => fetchRoomDetail(selectedRoomId!, signal),
    enabled: Boolean(selectedRoomId),
    retry: false,
    staleTime: 0,
  });

  // Active room members query
  const roomMembersQuery = useQuery({
    queryKey: ['roomMembers', actorUserId, selectedRoomId],
    queryFn: ({ signal }) => fetchRoomMembers(selectedRoomId!, signal),
    enabled: Boolean(selectedRoomId && !roomDetailQuery.isError),
    retry: false,
    staleTime: 0,
  });

  // Fail-closed rule: If detail or chat query errors with 401/403/404, mark revoked/forbidden!
  const conversationId = roomDetailQuery.isError || !roomDetailQuery.isFetchedAfterMount ? null : roomDetailQuery.data?.conversationId ?? null;
  const [cryptoDenied,setCryptoDenied]=useState<{actor:string;room:string|null}|null>(null);
  const privateAccessDenied=cryptoDenied?.actor===actorUserId&&cryptoDenied?.room===selectedRoomId;
  const isRoomRevokedOrNotFound = roomDetailQuery.isError || roomMembersQuery.isError || privateAccessDenied;
  const roomError = roomDetailQuery.error || roomMembersQuery.error;
  const accessDenied = privateAccessDenied || (roomError instanceof ApiError && [401, 403, 404].includes(roomError.status));
  const activeRoom = !isRoomRevokedOrNotFound
    ? (roomDetailQuery.isFetchedAfterMount ? roomDetailQuery.data ?? null : null)
    : null;
  const membersList = !isRoomRevokedOrNotFound ? (roomMembersQuery.data ?? []) : [];

  // Permissions & Roles
  const actorMemberRecord = useMemo(
    () => membersList.find(m => m.userId === actorUserId),
    [membersList, actorUserId]
  );
  const isOwner = activeRoom?.ownerId === actorUserId;
  const isHelper = actorMemberRecord?.role === 'HELPER';
  const helperPermissions = actorMemberRecord?.permissions || [];
  const hasManageMembersPermission = isOwner || (isHelper && helperPermissions.includes('MANAGE_MEMBERS'));

  // UI Tabs & Modals
  const [mobileTab, setMobileTab] = useState<'chat' | 'members' | 'settings' | 'calls'>('chat');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Confirmations State with error retention
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    isDestructive?: boolean;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: async () => {},
  });
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
    setIsSettingsModalOpen(false);
    setIsActionLoading(false);
    setModalError(null);
    setActionError(null);
    setMobileTab('chat');
  }, [roomScope]);

  // Action Handlers
  const handleCreateRoom = async (payload: CreateRoomRequest) => {
    const newRoom = await executeAction(signal => createRoom(payload, signal));
    await queryClient.invalidateQueries({ queryKey: ['ownRooms', actorUserId] });
    if (!isCurrentRoom()) return;
    handleSelectRoom(newRoom.id);
  };

  const handleUpdateSettings = async (roomId: string, req: UpdateRoomSettingsRequest) => {
    await executeAction(signal => updateRoomSettings(roomId, req, signal));
    await queryClient.invalidateQueries({ queryKey: ['roomDetail', actorUserId, roomId] });
    if (!isCurrentRoom()) return;
    await queryClient.invalidateQueries({ queryKey: ['ownRooms', actorUserId] });
    if (!isCurrentRoom()) return;
  };

  const handleUpdateHelperPermissions = async (roomId: string, targetUserId: string, perms: HelperPermissionType[]) => {
    await executeAction(signal => updateHelperPermissions(roomId, targetUserId, perms, signal));
    await queryClient.invalidateQueries({ queryKey: ['roomMembers', actorUserId, roomId] });
    if (!isCurrentRoom()) return;
  };

  const handleRemoveMember = async (roomId: string, targetUserId: string) => {
    await executeAction(signal => removeRoomMember(roomId, targetUserId, signal));
    await queryClient.invalidateQueries({ queryKey: ['roomMembers', actorUserId, roomId] });
    if (!isCurrentRoom()) return;
    await queryClient.invalidateQueries({ queryKey: ['roomDetail', actorUserId, roomId] });
    if (!isCurrentRoom()) return;
    await queryClient.invalidateQueries({ queryKey: ['ownRooms', actorUserId] });
    if (!isCurrentRoom()) return;
  };

  const handleRequestTransferOwner = (newOwnerId: string) => {
    const targetUser = membersList.find(m => m.userId === newOwnerId)?.user?.displayName || newOwnerId;
    setModalError(null);
    setConfirmConfig({
      isOpen: true,
      title: 'Xác nhận chuyển quyền chủ phòng',
      message: `Bạn có chắc chắn muốn chuyển quyền chủ phòng cho ${targetUser}? Thao tác này không thể hoàn tác.`,
      confirmText: 'Chuyển quyền',
      isDestructive: false,
      onConfirm: async () => {
        setIsActionLoading(true);
        setModalError(null);
        try {
          await executeAction(signal => transferRoomOwner(selectedRoomId!, newOwnerId, signal));
          await queryClient.invalidateQueries({ queryKey: ['roomDetail', actorUserId, selectedRoomId] });
    if (!isCurrentRoom()) return;
          await queryClient.invalidateQueries({ queryKey: ['roomMembers', actorUserId, selectedRoomId] });
    if (!isCurrentRoom()) return;
          await queryClient.invalidateQueries({ queryKey: ['ownRooms', actorUserId] });
          if (!isCurrentRoom()) return;
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          if (isCurrentRoom()) setModalError(err instanceof Error ? err.message : 'Chuyển quyền thất bại.');
        } finally {
          if (isCurrentRoom()) setIsActionLoading(false);
        }
      },
    });
  };

  const handleRequestDissolveRoom = () => {
    setModalError(null);
    setConfirmConfig({
      isOpen: true,
      title: 'Xác nhận giải thể phòng',
      message: 'Bạn có chắc chắn muốn giải thể phòng này? Tất cả thành viên và thông tin phòng sẽ bị xóa hoàn toàn.',
      confirmText: 'Giải thể phòng',
      isDestructive: true,
      onConfirm: async () => {
        setIsActionLoading(true);
        setModalError(null);
        try {
          await executeAction(signal => dissolveRoom(selectedRoomId!, signal));
          await queryClient.invalidateQueries({ queryKey: ['ownRooms', actorUserId] });
    if (!isCurrentRoom()) return;
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          setIsSettingsModalOpen(false);
          setSelectedRoomId(null);
          navigate('/rooms');
        } catch (err) {
          if (isCurrentRoom()) setModalError(err instanceof Error ? err.message : 'Giải thể phòng thất bại.');
        } finally {
          if (isCurrentRoom()) setIsActionLoading(false);
        }
      },
    });
  };

  const handleRequestLeaveRoom = () => {
    setModalError(null);
    if (isOwner && membersList.length > 1) {
      setConfirmConfig({
        isOpen: true,
        title: 'Cần chuyển quyền chủ phòng',
        message: 'Bạn là chủ phòng. Vui lòng chuyển quyền chủ phòng cho người khác trong Cài đặt trước khi rời phòng, hoặc chọn Giải thể phòng.',
        confirmText: 'Mở Cài đặt',
        isDestructive: false,
        onConfirm: async () => {
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          setIsSettingsModalOpen(true);
        },
      });
      return;
    }

    if (isOwner && membersList.length <= 1) {
      setConfirmConfig({
        isOpen: true,
        title: 'Xác nhận rời phòng (Giải thể phòng)',
        message: 'Bạn là thành viên cuối cùng của phòng. Rời phòng sẽ giải thể phòng này hoàn toàn. Bạn có muốn tiếp tục?',
        confirmText: 'Giải thể & Rời phòng',
        isDestructive: true,
        onConfirm: async () => {
          setIsActionLoading(true);
          setModalError(null);
          try {
            await executeAction(signal => dissolveRoom(selectedRoomId!, signal));
            await queryClient.invalidateQueries({ queryKey: ['ownRooms', actorUserId] });
    if (!isCurrentRoom()) return;
            setConfirmConfig(prev => ({ ...prev, isOpen: false }));
            setSelectedRoomId(null);
            navigate('/rooms');
          } catch (err) {
            if (isCurrentRoom()) setModalError(err instanceof Error ? err.message : 'Giải thể phòng thất bại.');
          } finally {
            if (isCurrentRoom()) setIsActionLoading(false);
          }
        },
      });
      return;
    }

    setConfirmConfig({
      isOpen: true,
      title: 'Xác nhận rời phòng',
      message: 'Bạn có chắc chắn muốn rời khỏi phòng này?',
      confirmText: 'Rời phòng',
      isDestructive: true,
      onConfirm: async () => {
        setIsActionLoading(true);
        setModalError(null);
        try {
          await executeAction(signal => removeRoomMember(selectedRoomId!, actorUserId, signal));
          await queryClient.invalidateQueries({ queryKey: ['ownRooms', actorUserId] });
    if (!isCurrentRoom()) return;
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          setSelectedRoomId(null);
          navigate('/rooms');
        } catch (err) {
          if (isCurrentRoom()) setModalError(err instanceof Error ? err.message : 'Rời phòng thất bại.');
        } finally {
          if (isCurrentRoom()) setIsActionLoading(false);
        }
      },
    });
  };

  return (
    <div className="fg-rooms-container">
      {/* 1. Sidebar - Own rooms list */}
      <aside className="fg-rooms-sidebar">
        <div className="fg-rooms-sidebar-header">
          <h3>Phòng của tôi</h3>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            leftIcon={<Plus size={16} />}
          >
            Tạo
          </Button>
        </div>

        <div className="fg-rooms-list">
          {ownRoomsQuery.isLoading && (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <Spinner size={24} />
            </div>
          )}

          {ownRoomsQuery.isError && (
            <div style={{ padding: '12px' }}>
              <Alert type="error" message="Không tải được danh sách phòng." action={<Button type="button" variant="outline" onClick={() => void ownRoomsQuery.refetch()}>Thử lại</Button>} />
            </div>
          )}

          {!ownRoomsQuery.isLoading && !ownRoomsQuery.isError && roomsList.length === 0 && (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-sub)', fontSize: '13px' }}>
              Bạn chưa tham gia phòng nào. Bấm &quot;Tạo&quot; để tạo phòng đầu tiên!
            </div>
          )}

          {roomsList.filter(r => !isRoomRevokedOrNotFound || r.id !== selectedRoomId).map(roomItem => {
            const isActive = roomItem.id === selectedRoomId && !isRoomRevokedOrNotFound;
            return (
              <button
                key={roomItem.id}
                type="button"
                className={`fg-room-item ${isActive ? 'active' : ''}`}
                onClick={() => handleSelectRoom(roomItem.id)}
              >
                <span className="fg-room-item-name">{roomItem.name}</span>
                <div className="fg-room-item-meta">
                  <span>{roomItem.gameTitle}</span>
                  <span>{roomItem.memberCount}/50 thành viên</span>
                </div>
              </button>
            );
          })}

          {hasMoreOwnRooms && (
            <div style={{ padding: '8px' }}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                isLoading={ownRoomsQuery.isFetchingNextPage}
                onClick={() => void ownRoomsQuery.fetchNextPage()}
              >
                Tải thêm phòng
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Navigation Tabs (< 1024px) */}
      <nav className="fg-mobile-tabs" aria-label="Điều hướng tab phòng">
        <button
          type="button"
          data-testid="mobile-tab-chat"
          className={`fg-mobile-tab-button ${mobileTab === 'chat' ? 'active' : ''}`}
          onClick={() => setMobileTab('chat')}
        >
          Trò chuyện
        </button>
        <button
          type="button"
          data-testid="mobile-tab-members"
          className={`fg-mobile-tab-button ${mobileTab === 'members' ? 'active' : ''}`}
          onClick={() => setMobileTab('members')}
        >
          Thành viên ({membersList.length})
        </button>
        <button type="button" data-testid="mobile-tab-calls" className={`fg-mobile-tab-button ${mobileTab === 'calls' ? 'active' : ''}`} onClick={() => setMobileTab('calls')}>Cuộc gọi</button>
        {isOwner && (
          <button
            type="button"
            data-testid="mobile-tab-settings"
            className={`fg-mobile-tab-button ${mobileTab === 'settings' ? 'active' : ''}`}
            onClick={() => { setMobileTab('settings'); setIsSettingsModalOpen(true); }}
          >
            Cài đặt
          </button>
        )}
      </nav>

      {/* 2. Main Content Area */}
      {isRoomRevokedOrNotFound ? (
        <main className="fg-rooms-main" style={{ alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div role="alert" className="fg-room-error-alert" style={{ maxWidth: '480px', width: '100%', textAlign: 'center' }}>
            <Alert
              type="error"
              title={accessDenied ? 'Không có quyền truy cập' : 'Không tải được phòng'}
              message={roomError?.message || 'Bạn không có quyền truy cập phòng riêng tư này.'}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!accessDenied) { void roomDetailQuery.refetch(); void roomMembersQuery.refetch(); return; }
                    setSelectedRoomId(null);
                    navigate('/rooms');
                  }}
                  leftIcon={<ArrowLeft size={16} />}
                >
                  {accessDenied ? 'Về Phòng của tôi' : 'Thử lại'}
                </Button>
              }
            />
          </div>
        </main>
      ) : activeRoom ? (
        <main className="fg-rooms-main">
          {actionError && <Alert type="error" message={actionError} />}
          {/* Header */}
          <header className="fg-rooms-header">
            <div className="fg-rooms-header-title">
              <h2>{activeRoom.name}</h2>
              <span className="fg-room-item-role-badge" style={{ fontSize: '12px', color: 'var(--text-sub)' }}>
                {activeRoom.gameTitle} · {activeRoom.settings.visibility} · Đội {activeRoom.settings.playerCapacity} người · {membersList.length}/50 thành viên
              </span>
            </div>

            <div className="fg-rooms-header-actions">
              {isOwner && (
                <Button
                  type="button"
                  data-testid="room-header-settings-btn"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSettingsModalOpen(true)}
                  leftIcon={<Settings size={16} />}
                >
                  Cài đặt
                </Button>
              )}

              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleRequestLeaveRoom}
                leftIcon={<LogOut size={16} />}
              >
                Rời phòng
              </Button>
            </div>
          </header>

          {/* Body: Stage + Chat Panel */}
          <div className="fg-rooms-body">
            {/* Stage / Mobile Tab content */}
            <div data-mobile-tab={mobileTab} className={`fg-rooms-stage ${mobileTab !== 'chat' ? 'fg-mobile-visible' : ''}`}>
              <CallPanel key={`call:${actorUserId}:${activeRoom.id}`} roomId={activeRoom.id} actorId={actorUserId}/>
              <TeamRosterPanel key={`team:${actorUserId}:${activeRoom.id}`} room={activeRoom} actorId={actorUserId} members={membersList} onOpenSettings={isOwner?()=>setIsSettingsModalOpen(true):undefined}/>

              {/* Members Panel (for Mobile Tab & Desktop info) */}
              {(mobileTab === 'members' || mobileTab === 'chat') && (
                <div data-testid="mobile-members-panel" className="fg-stage-members-section" style={{ marginTop: '20px' }}>
                  <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>Danh sách thành viên ({membersList.length})</h4>
                  <div className="fg-room-members-settings-list">
                    {membersList.map(m => (
                      <div key={m.userId} className="fg-room-member-settings-item">
                        <span className="fg-room-member-name">{m.user?.displayName || m.userId}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="fg-room-member-role-badge">{m.role}</span>
                          {hasManageMembersPermission && m.userId !== actorUserId && m.role !== 'OWNER' && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => { setActionError(null); void handleRemoveMember(activeRoom.id, m.userId).catch(err => { if (isCurrentRoom()) setActionError(err instanceof Error ? err.message : 'Không xóa được thành viên.'); }); }}
                            >
                              Xóa
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <section className={`fg-rooms-chat-panel ${mobileTab === 'chat' ? 'fg-mobile-visible' : ''}`}>
              <div className="fg-rooms-chat-header"><span>Trò chuyện nhóm</span></div>
              {conversationId && <PrivateChatPane key={actorUserId + ':' + conversationId} conversationId={conversationId} actorId={actorUserId}
                participants={membersList.map(member=>({id:member.userId,displayName:member.user?.displayName??'Thành viên'}))}
                onAccessDenied={()=>setCryptoDenied({actor:actorUserId,room:selectedRoomId})}/>}
            </section>
          </div>
        </main>
      ) : selectedRoomId && !roomDetailQuery.isFetchedAfterMount ? (
        <main className="fg-rooms-main" aria-label="Đang tải phòng"><Spinner size={32} /></main>
      ) : (
        <main className="fg-rooms-main" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', padding: '32px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
              Chọn hoặc tạo một phòng
            </h3>
            <p style={{ color: 'var(--text-sub)', fontSize: '14px', marginBottom: '16px' }}>
              Chọn phòng từ danh sách bên trái hoặc tạo phòng mới để bắt đầu trò chuyện nhóm.
            </p>
            <Button
              type="button"
              variant="primary"
              onClick={() => setIsCreateModalOpen(true)}
              leftIcon={<Plus size={16} />}
            >
              Tạo phòng mới
            </Button>
          </div>
        </main>
      )}

      {/* Modals */}
      <CreateRoomModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateRoom}
      />

      {activeRoom && isOwner && (
        <RoomSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          room={activeRoom}
          members={membersList}
          actorUserId={actorUserId}
          onUpdateSettings={handleUpdateSettings}
          onUpdateHelperPermissions={handleUpdateHelperPermissions}
          onRemoveMember={handleRemoveMember}
          onRequestTransferOwner={handleRequestTransferOwner}
          onRequestDissolveRoom={handleRequestDissolveRoom}
        />
      )}

      <ConfirmationModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        isDestructive={confirmConfig.isDestructive}
        isLoading={isActionLoading}
        error={modalError}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => {
          setModalError(null);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        }}
      />
    </div>
  );
};

export default RoomsPage;
