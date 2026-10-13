import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { reconcileMessages } from '../lobby/reconcile.js';
import {
  MessageDTO,
  CreateMessageRequest,
  SocketEventNames,
  SocketConversationRequest,
  SocketConversationAckSchema,
} from '@fg/contracts';
import { useAuth } from '../auth/index.js';
import { registerAuthCleanup } from '../auth/lifecycle.js';
import {
  fetchDirectConversations,
  fetchConversationMessages,
  sendDirectMessage,
  createDirectConversation,
  DirectConversationSummary,
} from './api.js';
import { unreadSync } from './sync.js';

export interface DMState {
  conversations: DirectConversationSummary[];
  activeConversationId: string | null;
  activePeer: DirectConversationSummary['peer'] | null;
  messages: MessageDTO[];
  unreadCounts: Record<string, number>;
  totalUnread: number;
  isLoadingConversations: boolean;
  conversationsError: Error | null;
  isLoadingMessages: boolean;
  messagesError: Error | null;
  isLoadingOlderMessages: boolean;
  olderMessagesError: Error | null;
  isSending: boolean;
  sendError: Error | null;
  setActiveConversationId: (conversationId: string | null) => void;
  startOrOpenDM: (recipientUserId: string) => Promise<string>;
  sendMessage: (request: CreateMessageRequest) => Promise<MessageDTO>;
  loadOlderMessages: () => Promise<void>;
  hasOlderMessages: boolean;
  clearSendError: () => void;
  refetchConversations: () => Promise<void>;
  refetchMessages: () => Promise<void>;
}

export function useDirectMessages(): DMState {
  const { user } = useAuth();
  const actorId = user?.id || null;

  const [stateActorId, setStateActorId] = useState<string | null>(actorId);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [messagesConvId, setMessagesConvId] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<Error | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<Error | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [olderMessagesError, setOlderMessagesError] = useState<Error | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const subscribedConvsRef = useRef<Set<string>>(new Set());
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const cacheRef = useRef<Map<string, { messages: MessageDTO[]; nextCursor: string | null | undefined; hasMore: boolean }>>(new Map());
  const epochRef = useRef<number>(0);
  const activeConvIdRef = useRef<string | null>(null);

  // Synchronous render guard for actor transition
  const isActorMismatch = actorId !== stateActorId;
  if (isActorMismatch) {
    setStateActorId(actorId);
    activeConvIdRef.current = null;
    setActiveConversationIdState(null);
    setMessages([]);
    setMessagesConvId(null);
    setMessagesError(null);
    setUnreadCounts({});
    setSendError(null);
    setIsSending(false);
    setIsLoadingMessages(false);
    setIsLoadingOlderMessages(false);
    setOlderMessagesError(null);
    setNextCursor(null);
    setHasMore(false);
    cacheRef.current.clear();
    unreadSync.setActor(actorId);
  }

  const effectiveActiveConversationId = isActorMismatch ? null : activeConversationId;
  const effectiveMessages = isActorMismatch || effectiveActiveConversationId !== messagesConvId ? [] : messages;
  const effectiveUnreadCounts = isActorMismatch ? {} : unreadCounts;
  const effectiveIsSending = isActorMismatch ? false : isSending;
  const effectiveSendError = isActorMismatch ? null : sendError;
  const effectiveIsLoadingMessages = isActorMismatch ? false : isLoadingMessages;
  const effectiveMessagesError = isActorMismatch ? null : messagesError;
  const effectiveHasMore = isActorMismatch ? false : hasMore;

  useEffect(() => {
    activeConvIdRef.current = effectiveActiveConversationId;
  }, [effectiveActiveConversationId]);

  // Sync actorId to unreadSync manager and increment epoch on actor change
  useEffect(() => {
    epochRef.current += 1;
    unreadSync.setActor(actorId);
  }, [actorId]);

  // Listen to cross-tab unread sync events
  useEffect(() => {
    return unreadSync.subscribe((ev) => {
      if (ev.type === 'READ') {
        setUnreadCounts((prev) => ({
          ...prev,
          [ev.conversationId]: 0,
        }));
      } else if (ev.type === 'UNREAD_INCREMENT') {
        if (ev.conversationId !== activeConvIdRef.current) {
          setUnreadCounts((prev) => ({
            ...prev,
            [ev.conversationId]: (prev[ev.conversationId] || 0) + 1,
          }));
        }
      }
    });
  }, []);

  // Fetch list of conversations across all cursor pages
  const conversationsQuery = useQuery({
    queryKey: ['direct-conversations', actorId],
    queryFn: async ({ signal }) => {
      const allItems: DirectConversationSummary[] = [];
      let cursor: string | undefined = undefined;
      const visitedCursors = new Set<string>();

      while (true) {
        if (signal?.aborted) break;
        const page = await fetchDirectConversations(cursor ? { cursor } : undefined, signal);
        for (const item of page.items) {
          if (!allItems.some((c) => c.conversationId === item.conversationId)) {
            allItems.push(item);
          }
        }

        if (!page.hasMore) {
          break;
        }
        if (!page.nextCursor) {
          throw new Error('Dữ liệu phân trang cuộc trò chuyện không hợp lệ: thiếu con trỏ tiếp theo.');
        }
        if (visitedCursors.has(page.nextCursor)) {
          throw new Error('Dữ liệu phân trang cuộc trò chuyện bị lặp con trỏ.');
        }

        visitedCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      return { items: allItems };
    },
    enabled: Boolean(actorId),
    staleTime: 1000 * 30,
  });

  const conversations = useMemo(
    () => conversationsQuery.data?.items || [],
    [conversationsQuery.data?.items]
  );
  const activeConvSummary = conversations.find((c) => c.conversationId === effectiveActiveConversationId) || null;
  const activePeer = activeConvSummary?.peer || null;

  // Set active conversation with per-conversation caching
  const setActiveConversationId = useCallback((id: string | null) => {
    if (id === activeConvIdRef.current) return;
    activeConvIdRef.current = id;
    setActiveConversationIdState(id);
    setSendError(null);
    setMessagesError(null);
    setOlderMessagesError(null);
    setIsLoadingOlderMessages(false);
    setIsSending(false);

    if (id && actorId) {
      const cacheKey = `${actorId}:${id}`;
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        setMessages(cached.messages);
        setMessagesConvId(id);
        setNextCursor(cached.nextCursor);
        setHasMore(cached.hasMore);
        setIsLoadingMessages(false);
      } else {
        setMessages([]);
        setMessagesConvId(id);
        setNextCursor(null);
        setHasMore(false);
        setIsLoadingMessages(false);
      }
      setUnreadCounts((prev) => ({
        ...prev,
        [id]: 0,
      }));
      unreadSync.notifyRead(id);
    } else {
      setMessages([]);
      setMessagesConvId(null);
      setNextCursor(null);
      setHasMore(false);
      setIsLoadingMessages(false);
    }
  }, [actorId]);

  // Fetch messages helper
  const fetchMessagesForConv = useCallback(async (targetConvId: string, signal?: AbortSignal) => {
    const currentEpoch = epochRef.current;
    setIsLoadingMessages(true);
    setMessagesError(null);

    try {
      const res = await fetchConversationMessages(targetConvId, undefined, signal);
      if (signal?.aborted || epochRef.current !== currentEpoch || activeConvIdRef.current !== targetConvId) return;

      res.items.forEach((m) => seenMessageIdsRef.current.add(m.id));
      setMessages((prev) => {
        const updated = reconcileMessages(targetConvId, prev, res.items);
        if (actorId) {
          cacheRef.current.set(`${actorId}:${targetConvId}`, {
            messages: updated,
            nextCursor: res.nextCursor,
            hasMore: res.hasMore,
          });
        }
        return updated;
      });
      setMessagesConvId(targetConvId);
      setNextCursor(res.nextCursor);
      setHasMore(res.hasMore);
      setIsLoadingMessages(false);
    } catch (err: unknown) {
      if (signal?.aborted || epochRef.current !== currentEpoch || activeConvIdRef.current !== targetConvId) return;
      setMessagesError(err instanceof Error ? err : new Error(String(err)));
      setIsLoadingMessages(false);
    }
  }, [actorId]);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!effectiveActiveConversationId || !actorId) {
      return;
    }

    const abortController = new AbortController();
    fetchMessagesForConv(effectiveActiveConversationId, abortController.signal);

    return () => {
      abortController.abort();
    };
  }, [effectiveActiveConversationId, actorId, fetchMessagesForConv]);

  // Socket connection & subscription lifecycle for all actor conversations
  useEffect(() => {
    if (!actorId) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io('/', {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;

    const subscribeAllConversations = () => {
      for (const conv of conversations) {
        const convId = conv.conversationId;
        const subReq: SocketConversationRequest = { conversationId: convId };

        const ackPromise = socket.emitWithAck(SocketEventNames.CONVERSATION_SUBSCRIBE, subReq);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('ACK timeout')), 5000));

        Promise.race([ackPromise, timeoutPromise])
          .then((res: unknown) => {
            const parsedAck = SocketConversationAckSchema.safeParse(res);
            if (parsedAck.success && parsedAck.data.ok) {
              subscribedConvsRef.current.add(convId);
            }
          })
          .catch(() => {
            // Failed ACK subscription or timeout
          });
      }
    };

    socket.on('connect', () => {
      subscribeAllConversations();
      if (activeConvIdRef.current) {
        fetchMessagesForConv(activeConvIdRef.current);
      }
    });

    socket.on(SocketEventNames.MESSAGE_CREATED, (rawPayload: unknown) => {
      const res = unreadSync.ingestMessage(rawPayload, activeConvIdRef.current);
      if (!res.message) return;

      const currentActiveId = activeConvIdRef.current;
      const msg = res.message;
      if (currentActiveId && msg.conversationId === currentActiveId) {
        setMessages((prev) => {
          const updated = reconcileMessages(currentActiveId, prev, [msg]);
          if (actorId) {
            const cached = cacheRef.current.get(`${actorId}:${currentActiveId}`);
            cacheRef.current.set(`${actorId}:${currentActiveId}`, {
              messages: updated,
              nextCursor: cached?.nextCursor,
              hasMore: Boolean(cached?.hasMore),
            });
          }
          return updated;
        });
        setMessagesConvId(currentActiveId);
        unreadSync.notifyRead(currentActiveId);
      }
    });

    subscribeAllConversations();

    const unregisterCleanup = registerAuthCleanup(() => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setMessages([]);
      setMessagesConvId(null);
      setMessagesError(null);
      setActiveConversationIdState(null);
      setUnreadCounts({});
      cacheRef.current.clear();
      seenMessageIdsRef.current.clear();
      subscribedConvsRef.current.clear();
    });

    return () => {
      unregisterCleanup();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [actorId, conversations, fetchMessagesForConv]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeConvIdRef.current || !nextCursor || isLoadingOlderMessages) return;
    const currentEpoch = epochRef.current;
    const targetConvId = activeConvIdRef.current;

    setIsLoadingOlderMessages(true);
    setOlderMessagesError(null);

    try {
      const res = await fetchConversationMessages(targetConvId, { cursor: nextCursor });
      if (epochRef.current !== currentEpoch || activeConvIdRef.current !== targetConvId) return;
      res.items.forEach((m) => seenMessageIdsRef.current.add(m.id));
      setMessages((prev) => {
        const updated = reconcileMessages(targetConvId, prev, res.items);
        if (actorId) {
          cacheRef.current.set(`${actorId}:${targetConvId}`, {
            messages: updated,
            nextCursor: res.nextCursor,
            hasMore: res.hasMore,
          });
        }
        return updated;
      });
      setMessagesConvId(targetConvId);
      setNextCursor(res.nextCursor);
      setHasMore(res.hasMore);
      setIsLoadingOlderMessages(false);
    } catch (err: unknown) {
      if (epochRef.current !== currentEpoch || activeConvIdRef.current !== targetConvId) return;
      const error = err instanceof Error ? err : new Error(String(err));
      setOlderMessagesError(error);
      setIsLoadingOlderMessages(false);
    }
  }, [actorId, nextCursor, isLoadingOlderMessages]);

  const sendMessage = useCallback(
    async (request: CreateMessageRequest): Promise<MessageDTO> => {
      if (!activeConvIdRef.current) {
        throw new Error('No active conversation');
      }
      const currentEpoch = epochRef.current;
      const targetConvId = activeConvIdRef.current;
      setIsSending(true);
      setSendError(null);

      try {
        const sent = await sendDirectMessage(targetConvId, request);
        if (epochRef.current !== currentEpoch || activeConvIdRef.current !== targetConvId) {
          // Stale actor/conversation: DO NOT mutate hook state!
          return sent;
        }
        seenMessageIdsRef.current.add(sent.id);
        setMessages((prev) => {
          const updated = reconcileMessages(targetConvId, prev, [sent]);
          if (actorId) {
            const cached = cacheRef.current.get(`${actorId}:${targetConvId}`);
            cacheRef.current.set(`${actorId}:${targetConvId}`, {
              messages: updated,
              nextCursor: cached?.nextCursor,
              hasMore: Boolean(cached?.hasMore),
            });
          }
          return updated;
        });
        setMessagesConvId(targetConvId);
        setIsSending(false);
        return sent;
      } catch (err) {
        if (epochRef.current === currentEpoch && activeConvIdRef.current === targetConvId) {
          const error = err instanceof Error ? err : new Error(String(err));
          setSendError(error);
          setIsSending(false);
          throw error;
        } else {
          // Stale actor/conversation: DO NOT mutate hook state!
          throw err;
        }
      }
    },
    [actorId]
  );

  const startOrOpenDM = useCallback(
    async (recipientUserId: string): Promise<string> => {
      const currentEpoch = epochRef.current;
      const existing = conversations.find((c) => c.peer.id === recipientUserId);
      if (existing) {
        setActiveConversationId(existing.conversationId);
        return existing.conversationId;
      }

      const res = await createDirectConversation(recipientUserId);
      if (epochRef.current !== currentEpoch) {
        return res.conversationId;
      }
      await conversationsQuery.refetch();
      if (epochRef.current !== currentEpoch) {
        return res.conversationId;
      }
      setActiveConversationId(res.conversationId);
      return res.conversationId;
    },
    [conversations, conversationsQuery, setActiveConversationId]
  );

  const clearSendError = useCallback(() => {
    setSendError(null);
  }, []);

  const refetchMessages = useCallback(async () => {
    if (activeConvIdRef.current) {
      await fetchMessagesForConv(activeConvIdRef.current);
    }
  }, [fetchMessagesForConv]);

  return {
    conversations,
    activeConversationId: effectiveActiveConversationId,
    activePeer,
    messages: effectiveMessages,
    unreadCounts: effectiveUnreadCounts,
    totalUnread: Object.values(effectiveUnreadCounts).reduce((acc, count) => acc + count, 0),
    isLoadingConversations: conversationsQuery.isLoading,
    conversationsError: isActorMismatch ? null : (conversationsQuery.error as Error | null),
    isLoadingMessages: effectiveIsLoadingMessages,
    messagesError: effectiveMessagesError,
    isLoadingOlderMessages: isActorMismatch ? false : isLoadingOlderMessages,
    olderMessagesError: isActorMismatch ? null : olderMessagesError,
    isSending: effectiveIsSending,
    sendError: effectiveSendError,
    setActiveConversationId,
    startOrOpenDM,
    sendMessage,
    loadOlderMessages,
    hasOlderMessages: effectiveHasMore,
    clearSendError,
    refetchConversations: async () => {
      await conversationsQuery.refetch();
    },
    refetchMessages,
  };
}

