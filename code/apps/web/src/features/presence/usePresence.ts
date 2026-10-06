import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import {
  GameDTO,
  ProfileDTO,
  MeDTO,
  CustomStatus,
  SocketEventNames,
  SocketPresenceAckSchema,
  SocketPresenceHeartbeatAckSchema,
  SocketScopedPresenceChangedPayloadSchema,
  UpdateCustomStatusResponse,
  PRESENCE_HEARTBEAT_INTERVAL_MS,
} from '@fg/contracts';
import { useAuth, registerAuthCleanup, AUTH_QUERY_KEY } from '../auth/index.js';
import {
  fetchGameOnlineUsers,
  updateCustomStatus,
  fetchUserProfile,
} from './api.js';

export { PRESENCE_HEARTBEAT_INTERVAL_MS };

export interface PresenceState {
  onlineUsers: ProfileDTO[];
  isLoading: boolean;
  isError: boolean;
  selectedStatus: CustomStatus;
  isSavingStatus: boolean;
  saveStatusError: string | null;
  connection: 'connecting' | 'connected' | 'offline';
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: string | null;
  saveStatus: (newStatus: CustomStatus) => Promise<void>;
  retry: () => Promise<void>;
  loadMore: () => Promise<void>;
}

function deduplicateProfiles(profiles: ProfileDTO[]): ProfileDTO[] {
  const map = new Map<string, ProfileDTO>();
  for (const profile of profiles) {
    if (!map.has(profile.id)) {
      map.set(profile.id, profile);
    } else {
      const existing = map.get(profile.id)!;
      map.set(profile.id, {
        ...existing,
        customStatus: profile.customStatus,
      });
    }
  }
  return Array.from(map.values());
}

export function usePresence(game: GameDTO, actorKey?: string): PresenceState {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const [onlineUsers, setOnlineUsers] = useState<ProfileDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [selectedStatus, setSelectedStatus] = useState<CustomStatus>(
    auth.user?.customStatus ?? 'JUST_CHATTING'
  );
  const [isSavingStatus, setIsSavingStatus] = useState<boolean>(false);
  const [saveStatusError, setSaveStatusError] = useState<string | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const onlineUsersRef = useRef<ProfileDTO[]>([]);
  onlineUsersRef.current = onlineUsers;

  const canonicalIdRef = useRef<string | null>(null);
  const socketConnectedRef = useRef<boolean>(false);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const controllersRef = useRef<Set<AbortController>>(new Set());
  const generationRef = useRef<number>(0);
  const connectionEpochRef = useRef<number>(0);
  const lastConfirmedStatusRef = useRef<CustomStatus | null>(null);

  // Request & Monotonic Event Ordering
  const fetchCounterRef = useRef<number>(0);
  const completedFetchIdRef = useRef<number>(0);
  const eventVersionRef = useRef<number>(0);
  const userStatesRef = useRef<Map<string, { isOnline: boolean; customStatus: CustomStatus; version: number }>>(
    new Map()
  );

  const isLoadingMoreRef = useRef<boolean>(false);
  const isSavingStatusRef = useRef<boolean>(false);

  // Sync selected status with auth.user when confirmed or when auth completes
  useEffect(() => {
    if (lastConfirmedStatusRef.current !== null) {
      setSelectedStatus(lastConfirmedStatusRef.current);
    } else if (auth.user?.customStatus) {
      setSelectedStatus(auth.user.customStatus);
    }
  }, [auth.user?.customStatus]);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  // Fetch authoritative initial online list
  const loadInitialOnline = useCallback(
    async (generation: number) => {
      setIsLoading(true);
      setIsError(false);
      const fetchCtrl = new AbortController();
      controllersRef.current.add(fetchCtrl);
      const thisFetchId = ++fetchCounterRef.current;
      const requestEventVersion = eventVersionRef.current;

      try {
        const pageData = await fetchGameOnlineUsers(game.id, undefined, 50, fetchCtrl.signal);
        if (generationRef.current !== generation || fetchCtrl.signal.aborted) return;

        // Discard out-of-order response if a newer fetch already completed
        if (thisFetchId <= completedFetchIdRef.current) return;
        completedFetchIdRef.current = thisFetchId;

        // Filter and merge items against events received AFTER requestEventVersion
        const filteredItems = pageData.items.filter((item) => {
          const state = userStatesRef.current.get(item.id);
          if (state && state.version > requestEventVersion && state.isOnline === false) {
            return false;
          }
          return true;
        });

        const updatedItems = filteredItems.map((item) => {
          const state = userStatesRef.current.get(item.id);
          if (state && state.version > requestEventVersion) {
            return { ...item, customStatus: state.customStatus };
          }
          return item;
        });

        // Preserve users who connected AFTER requestEventVersion and are NOT in pageData.items
        setOnlineUsers((prevUsers) => {
          const newUsers = [...updatedItems];
          for (const prevUser of prevUsers) {
            const state = userStatesRef.current.get(prevUser.id);
            if (state && state.version > requestEventVersion && state.isOnline === true) {
              newUsers.push({ ...prevUser, customStatus: state.customStatus });
            }
          }
          return deduplicateProfiles(newUsers);
        });

        setHasMore(pageData.hasMore);
        setNextCursor(pageData.nextCursor ?? null);
        setIsLoading(false);
      } catch {
        if (generationRef.current === generation && !fetchCtrl.signal.aborted) {
          // Ignore error if a newer fetch has already completed or been issued
          if (thisFetchId > completedFetchIdRef.current && thisFetchId === fetchCounterRef.current) {
            setIsError(true);
            setIsLoading(false);
          }
        }
      } finally {
        controllersRef.current.delete(fetchCtrl);
      }
    },
    [game.id]
  );

  // Socket connection & lifecycle
  useEffect(() => {
    // Scope switch reset
    setOnlineUsers([]);
    setHasMore(false);
    setLoadingMore(false);
    setNextCursor(null);
    setIsError(false);
    setIsSavingStatus(false);
    setLoadMoreError(null);
    setSaveStatusError(null);
    setIsLoading(true);
    canonicalIdRef.current = null;
    lastConfirmedStatusRef.current = null;
    completedFetchIdRef.current = 0;
    fetchCounterRef.current = 0;
    isLoadingMoreRef.current = false;
    isSavingStatusRef.current = false;

    if (auth.isLoading) {
      setConnection('connecting');
      setIsLoading(true);
      return;
    }

    if (auth.isError || auth.isSigningOut) {
      setConnection('offline');
      setIsLoading(false);
      return;
    }

    const currentGeneration = ++generationRef.current;
    const isCurrent = () => generationRef.current === currentGeneration;

    clearHeartbeat();
    canonicalIdRef.current = null;
    socketConnectedRef.current = false;
    userStatesRef.current.clear();
    setConnection('connecting');

    void loadInitialOnline(currentGeneration);

    const socket: Socket = io('/presence', {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    const handleConnect = async () => {
      socketConnectedRef.current = true;
      const currentEpoch = ++connectionEpochRef.current;
      try {
        const rawAck = await socket.timeout(5000).emitWithAck(SocketEventNames.PRESENCE_SUBSCRIBE, {
          conversationId: game.lobbyRoomId,
        });

        if (!isCurrent() || !socketConnectedRef.current || connectionEpochRef.current !== currentEpoch) return;

        const ack = SocketPresenceAckSchema.parse(rawAck);
        if (!ack.ok) {
          setConnection('offline');
          setIsError(true);
          return;
        }

        canonicalIdRef.current = ack.conversationId;
        setConnection('connected');

        // Refetch authoritative online list after subscription ack
        void loadInitialOnline(currentGeneration);

        // Heartbeat timer (15s): ONLY for authenticated members with ACK validation
        clearHeartbeat();
        if (auth.user && !auth.isSigningOut) {
          heartbeatTimerRef.current = setInterval(async () => {
            if (!isCurrent() || !canonicalIdRef.current || !socketConnectedRef.current || !socket.connected || connectionEpochRef.current !== currentEpoch) {
              return;
            }
            try {
              const hbAckRaw = await socket.timeout(5000).emitWithAck(SocketEventNames.PRESENCE_HEARTBEAT, {
                conversationId: canonicalIdRef.current,
              });
              if (!isCurrent() || !socketConnectedRef.current || connectionEpochRef.current !== currentEpoch) return;
              const hbAck = SocketPresenceHeartbeatAckSchema.safeParse(hbAckRaw);
              if (!hbAck.success || !hbAck.data.ok || hbAck.data.conversationId !== canonicalIdRef.current) {
                clearHeartbeat();
                setConnection('offline');
                setIsError(true);
              }
            } catch {
              if (isCurrent() && connectionEpochRef.current === currentEpoch) {
                clearHeartbeat();
                setConnection('offline');
                setIsError(true);
              }
            }
          }, PRESENCE_HEARTBEAT_INTERVAL_MS);
        }
      } catch {
        if (isCurrent() && connectionEpochRef.current === currentEpoch) {
          setConnection('offline');
        }
      }
    };

    const handlePresenceChanged = async (rawPayload: unknown) => {
      if (!isCurrent() || canonicalIdRef.current === null || !socketConnectedRef.current) return;

      const scopedParsed = SocketScopedPresenceChangedPayloadSchema.safeParse(rawPayload);
      if (!scopedParsed.success) return;

      const payload = scopedParsed.data;
      if (payload.conversationId !== canonicalIdRef.current) return;

      const currentVersion = ++eventVersionRef.current;
      userStatesRef.current.set(payload.userId, {
        isOnline: payload.isOnline,
        customStatus: payload.customStatus,
        version: currentVersion,
      });

      if (payload.isOnline === false) {
        setOnlineUsers((prev) => prev.filter((user) => user.id !== payload.userId));
        return;
      }

      // User is online: check if already in loaded online users without side-effect
      const isAlreadyLoaded = onlineUsersRef.current.some((u) => u.id === payload.userId);
      if (isAlreadyLoaded) {
        setOnlineUsers((prev) =>
          prev.map((u) =>
            u.id === payload.userId ? { ...u, customStatus: payload.customStatus } : u
          )
        );
      } else {
        const fetchCtrl = new AbortController();
        controllersRef.current.add(fetchCtrl);
        try {
          const profile = await fetchUserProfile(payload.userId, fetchCtrl.signal);
          if (!isCurrent() || fetchCtrl.signal.aborted || !socketConnectedRef.current) return;

          const currentState = userStatesRef.current.get(payload.userId);
          // If offline event arrived since profile fetch started, do not add
          if (currentState && !currentState.isOnline && currentState.version >= currentVersion) {
            return;
          }

          const finalStatus = currentState ? currentState.customStatus : payload.customStatus;
          setOnlineUsers((prev) =>
            deduplicateProfiles([...prev, { ...profile, customStatus: finalStatus }])
          );
        } catch {
          // Ignore profile lookup error
        } finally {
          controllersRef.current.delete(fetchCtrl);
        }
      }
    };

    const handleDisconnect = () => {
      socketConnectedRef.current = false;
      canonicalIdRef.current = null;
      if (isCurrent()) {
        setConnection('offline');
        clearHeartbeat();
      }
    };

    socket.on('connect', handleConnect);
    socket.on(SocketEventNames.PRESENCE_CHANGED, handlePresenceChanged);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleDisconnect);

    const dispose = () => {
      generationRef.current++;
      connectionEpochRef.current++;
      socketConnectedRef.current = false;
      const currentCanonicalId = canonicalIdRef.current;
      canonicalIdRef.current = null;
      clearHeartbeat();

      for (const ctrl of controllersRef.current) {
        ctrl.abort();
      }
      controllersRef.current.clear();

      if (socket.connected && currentCanonicalId) {
        socket.emit(SocketEventNames.PRESENCE_UNSUBSCRIBE, {
          conversationId: currentCanonicalId,
        });
      }

      socket.off('connect', handleConnect);
      socket.off(SocketEventNames.PRESENCE_CHANGED, handlePresenceChanged);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleDisconnect);
      socket.disconnect();
    };

    const unregister = registerAuthCleanup(dispose);

    if (socket.connected) {
      void handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      unregister();
      dispose();
    };
  }, [
    game.id,
    game.lobbyRoomId,
    actorKey,
    auth.isLoading,
    auth.isError,
    auth.isSigningOut,
    auth.user,
    loadInitialOnline,
    clearHeartbeat,
  ]);

  // Load more (pagination with cursor)
  const loadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMore || !nextCursor) return;
    isLoadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    const fetchCtrl = new AbortController();
    controllersRef.current.add(fetchCtrl);
    const thisFetchId = ++fetchCounterRef.current;
    const requestEventVersion = eventVersionRef.current;
    const capturedGeneration = generationRef.current;
    const currentCursor = nextCursor;

    try {
      const pageData = await fetchGameOnlineUsers(game.id, currentCursor, 50, fetchCtrl.signal);
      if (generationRef.current !== capturedGeneration || fetchCtrl.signal.aborted) return;

      if (thisFetchId <= completedFetchIdRef.current) return;
      completedFetchIdRef.current = thisFetchId;

      const filteredItems = pageData.items.filter((item) => {
        const state = userStatesRef.current.get(item.id);
        if (state && state.version > requestEventVersion && state.isOnline === false) {
          return false;
        }
        return true;
      });

      const updatedItems = filteredItems.map((item) => {
        const state = userStatesRef.current.get(item.id);
        if (state && state.version > requestEventVersion) {
          return { ...item, customStatus: state.customStatus };
        }
        return item;
      });

      setOnlineUsers((prev) => deduplicateProfiles([...prev, ...updatedItems]));

      // Guard against repeated or missing cursor when hasMore is true
      if (!pageData.nextCursor || pageData.nextCursor === currentCursor) {
        setHasMore(false);
        setNextCursor(null);
      } else {
        setHasMore(pageData.hasMore);
        setNextCursor(pageData.nextCursor);
      }
    } catch {
      if (generationRef.current === capturedGeneration && !fetchCtrl.signal.aborted) {
        setLoadMoreError('Không tải được thêm danh sách online.');
      }
    } finally {
      if (generationRef.current === capturedGeneration) {
        setLoadingMore(false);
        isLoadingMoreRef.current = false;
      }
      controllersRef.current.delete(fetchCtrl);
    }
  }, [game.id, hasMore, nextCursor]);

  // Save custom status
  const saveStatus = useCallback(
    async (newStatus: CustomStatus) => {
      if (isSavingStatusRef.current) return;
      isSavingStatusRef.current = true;
      setIsSavingStatus(true);
      setSaveStatusError(null);
      const fetchCtrl = new AbortController();
      controllersRef.current.add(fetchCtrl);
      const capturedGeneration = generationRef.current;
      const currentActorId = auth.user?.id;

      try {
        const response: UpdateCustomStatusResponse = await updateCustomStatus(newStatus, fetchCtrl.signal);
        if (generationRef.current !== capturedGeneration || fetchCtrl.signal.aborted) return;

        const confirmedStatus = response.customStatus;
        lastConfirmedStatusRef.current = confirmedStatus;
        setSelectedStatus(confirmedStatus);

        if (currentActorId) {
          setOnlineUsers((prev) =>
            prev.map((user) =>
              user.id === currentActorId ? { ...user, customStatus: confirmedStatus } : user
            )
          );

          // Update React Query auth cache safely ONLY for same actor if cache exists
          queryClient.setQueryData<MeDTO | null>(AUTH_QUERY_KEY, (old) => {
            if (!old || old.id !== currentActorId) return old;
            return { ...old, customStatus: confirmedStatus };
          });
        }
      } catch {
        if (generationRef.current === capturedGeneration && !fetchCtrl.signal.aborted) {
          setSaveStatusError('Không lưu được trạng thái. Vui lòng thử lại.');
          if (lastConfirmedStatusRef.current !== null) {
            setSelectedStatus(lastConfirmedStatusRef.current);
          } else if (auth.user?.customStatus) {
            setSelectedStatus(auth.user.customStatus);
          }
        }
      } finally {
        setIsSavingStatus(false);
        isSavingStatusRef.current = false;
        controllersRef.current.delete(fetchCtrl);
      }
    },
    [auth.user?.id, queryClient]
  );

  const retry = useCallback(async () => {
    await loadInitialOnline(generationRef.current);
  }, [loadInitialOnline]);

  return {
    onlineUsers,
    isLoading,
    isError,
    selectedStatus,
    isSavingStatus,
    saveStatusError,
    connection,
    hasMore,
    loadingMore,
    loadMoreError,
    saveStatus,
    retry,
    loadMore,
  };
}
