import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { type MessageDTO, type CreateMessageRequest, SocketEventNames, SocketCryptoConversationAckSchema } from '@fg/contracts';
import { useAuth } from '../auth';
import { useOptionalCryptoDevice } from '../crypto/CryptoDeviceProvider';
import { registerAuthCleanup } from '../auth/lifecycle';
import { fetchDirectConversations, createDirectConversation, type DirectConversationSummary } from './api';
import { unreadSync } from './sync';

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
  const { user } = useAuth(), actorId = user?.id ?? null;
  const device = useOptionalCryptoDevice();
  const [selection, setSelection] = useState<{ actor: string | null; id: string | null }>({ actor: actorId, id: null });
  const [counts, setCounts] = useState<{ actor: string | null; values: Record<string, number> }>({ actor: actorId, values: {} });
  const current = useRef({ actor: actorId, id: null as string | null });
  const query = useQuery({ queryKey: ['directConversations', actorId], enabled: Boolean(actorId), queryFn: ({ signal }) => fetchDirectConversations(undefined, signal), retry: false });
  const conversations = query.data?.items ?? [];
  const activeConversationId = selection.actor === actorId ? selection.id : null;
  current.current = { actor: actorId, id: activeConversationId };
  const unreadCounts = counts.actor === actorId ? counts.values : {};
  useEffect(() => {
    unreadSync.setActor(actorId); setSelection({ actor: actorId, id: null }); setCounts({ actor: actorId, values: {} });
    const clear = () => { current.current = { actor: null, id: null }; setSelection({ actor: null, id: null }); setCounts({ actor: null, values: {} }); };
    const unregister = registerAuthCleanup(clear); return () => { unregister(); };
  }, [actorId]);
  useEffect(() => unreadSync.subscribe(event => {
    if (event.actorId !== current.current.actor) return;
    setCounts(previous => {
      const values = previous.actor === event.actorId ? { ...previous.values } : {};
      values[event.conversationId] = event.type === 'READ' || event.conversationId === current.current.id ? 0 : (values[event.conversationId] ?? 0) + 1;
      return { actor: event.actorId, values };
    });
  }), []);
  const conversationKey = JSON.stringify(conversations.map(item => item.conversationId));
  useEffect(() => {
    if (!actorId || device?.status !== 'READY' || !device.deviceId || !device.session) return;
    const socket = io('/', { transports: ['websocket', 'polling'], withCredentials: true });
    const actor = actorId, session = device.session;
    const subscribe = () => {
      const ids = [...new Set([...(activeConversationId ? [activeConversationId] : []), ...JSON.parse(conversationKey)])].slice(0, 32);
      for (const conversationId of ids) socket.emit(SocketEventNames.CRYPTO_SUBSCRIBE, { conversationId, deviceId: device.deviceId }, (raw: unknown) => {
        const ack = SocketCryptoConversationAckSchema.safeParse(raw);
        if (ack.success && !ack.data.ok && current.current.actor === actor) setCounts(previous => ({ actor, values: { ...previous.values, [conversationId]: 0 } }));
      });
    };
    socket.on('connect', subscribe);
    socket.on(SocketEventNames.CRYPTO_MESSAGE_CREATED, (raw: unknown) => {
      if (current.current.actor !== actor || session.signal.aborted) return;
      unreadSync.ingestEncryptedMessage(raw, current.current.id);
    });
    const close = () => socket.disconnect(); session.signal.addEventListener('abort', close, { once: true });
    return () => { session.signal.removeEventListener('abort', close); socket.disconnect(); };
  }, [actorId, device?.status, device?.deviceId, device?.session, conversationKey, activeConversationId]);
  const setActiveConversationId = useCallback((id: string | null) => {
    if (!actorId) return; current.current = { actor: actorId, id }; setSelection({ actor: actorId, id });
    if (id) { unreadSync.notifyRead(id); setCounts(previous => ({ actor: actorId, values: { ...(previous.actor === actorId ? previous.values : {}), [id]: 0 } })); }
  }, [actorId]);
  const startOrOpenDM = useCallback(async (recipientUserId: string) => {
    const actor = actorId; if (!actor) throw new Error('LOGIN_REQUIRED');
    const existing = conversations.find(item => item.peer.id === recipientUserId);
    const id = existing?.conversationId ?? (await createDirectConversation(recipientUserId)).conversationId;
    if (current.current.actor !== actor) throw new Error('SESSION_CHANGED');
    await query.refetch(); if (current.current.actor !== actor) throw new Error('SESSION_CHANGED'); setActiveConversationId(id); return id;
  }, [actorId, conversations, query, setActiveConversationId]);
  return {
    conversations, activeConversationId, activePeer: conversations.find(item => item.conversationId === activeConversationId)?.peer ?? null,
    messages: [], unreadCounts, totalUnread: Object.values(unreadCounts).reduce((total, value) => total + value, 0),
    isLoadingConversations: query.isLoading, conversationsError: query.error instanceof Error ? query.error : null,
    isLoadingMessages: false, messagesError: null, isLoadingOlderMessages: false, olderMessagesError: null, isSending: false, sendError: null,
    setActiveConversationId, startOrOpenDM,
    sendMessage: async () => { throw new Error('Use the encrypted private composer'); },
    loadOlderMessages: async () => { throw new Error('Use encrypted history'); }, hasOlderMessages: false, clearSendError: () => undefined,
    refetchConversations: async () => { await query.refetch(); }, refetchMessages: async () => undefined,
  };
}
