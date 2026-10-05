import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { GameDTO, MessageDTO, MessageSchema, SocketConversationAckSchema, SocketEventNames } from '@fg/contracts';
import { fetchHistory, sendMessage } from './api.js';
import { reconcileMessages } from './reconcile.js';
import { registerAuthCleanup } from '../auth/lifecycle.js';
export function useLobbyChat(game: GameDTO, actorKey: string) {
    const [conversationResolved, setConversationResolved] = useState(false);
    const [extra, setExtra] = useState<MessageDTO[]>([]), [connection, setConnection] = useState<'connecting' | 'connected' | 'offline'>('connecting');
    const [conversationId, setConversationId] = useState(game.lobbyRoomId), canonical = useRef(game.lobbyRoomId), generation = useRef(0), queuedRecovery = useRef(false);
    const [syncError, setSyncError] = useState(false), [olderCursor, setOlderCursor] = useState<string | null>(null), [loadingOlder, setLoadingOlder] = useState(false), [sending, setSending] = useState(false);
    const active = useRef(true), controllers = useRef(new Set<AbortController>()), recovering = useRef(false), pendingSend = useRef(false);
    const known = useRef(new Set<string>()), nextCursor = useRef<string | null>(null);
    const query = useQuery({ queryKey: ['lobby', game.id, actorKey], queryFn: ({ signal }) => fetchHistory(game.id, undefined, signal), retry: false, refetchOnWindowFocus: false });
    const messages = useMemo(() => reconcileMessages(conversationId, query.data?.items ?? [], extra), [conversationId, query.data, extra]);
    // New live messages can sit above an unseen reconnect gap. Recover through the oldest loaded anchor.
    useEffect(() => { known.current = new Set(messages.length ? [messages[0].id] : []); }, [messages]);
    useEffect(() => {
        if (query.data) {
            const resolved = query.data.items[0]?.conversationId;
            if (resolved) {
                if (query.data.items.some(item => item.conversationId !== resolved)) {
                    setSyncError(true);
                    return;
                }
                canonical.current = resolved;
                setConversationId(resolved);
                setConversationResolved(true);
            }
            nextCursor.current = query.data.hasMore ? query.data.nextCursor ?? null : null;
            setOlderCursor(nextCursor.current);
        }
    }, [query.data]);
    const merge = useCallback((items: MessageDTO[]) => {
        if (active.current)
            setExtra(previous => reconcileMessages(canonical.current, previous, items));
    }, []);
    const recover = useCallback(async (): Promise<void> => {
        if (!active.current)
            return;
        if (recovering.current) {
            queuedRecovery.current = true;
            return;
        }
        recovering.current = true;
        const controller = new AbortController();
        controllers.current.add(controller);
        const anchor = new Set(known.current);
        const seenCursors = new Set<string>();
        let cursor: string | undefined;
        let first = true;
        try {
            do {
                const page = await fetchHistory(game.id, cursor, controller.signal);
                if (!active.current || controller.signal.aborted)
                    return;
                merge(page.items);
                nextCursor.current = page.hasMore ? page.nextCursor ?? null : null;
                setOlderCursor(nextCursor.current);
                if (first && anchor.size === 0) {
                    nextCursor.current = page.hasMore ? page.nextCursor ?? null : null;
                    setOlderCursor(nextCursor.current);
                    break;
                }
                first = false;
                if (page.items.some(item => anchor.has(item.id)) || !page.hasMore)
                    break;
                if (!page.nextCursor || seenCursors.has(page.nextCursor))
                    throw new Error('Invalid history cursor progression');
                seenCursors.add(page.nextCursor);
                cursor = page.nextCursor;
            } while (cursor);
            if (active.current)
                setSyncError(false);
        }
        catch (error) {
            if (active.current && !controller.signal.aborted)
                setSyncError(true);
            if (error instanceof DOMException && error.name === 'AbortError')
                return;
        }
        finally {
            controllers.current.delete(controller);
            recovering.current = false;
            if (active.current && queuedRecovery.current) {
                queuedRecovery.current = false;
                queueMicrotask(() => void recover());
            }
        }
    }, [game.id, merge]);
    useEffect(() => {
        active.current = true;
        const currentGeneration = ++generation.current;
        const socket = io({ withCredentials: true, transports: ['websocket'], autoConnect: false, reconnection: true });
        const current = () => active.current && generation.current === currentGeneration;
        const connected = async () => {
            try {
                const ack = SocketConversationAckSchema.parse(await socket.timeout(5000).emitWithAck(SocketEventNames.CONVERSATION_SUBSCRIBE, { conversationId: game.lobbyRoomId }));
                if (!current())
                    return;
                if (!ack.ok)
                    throw new Error('Subscription denied');
                canonical.current = ack.conversationId;
                setConversationId(ack.conversationId);
                setConversationResolved(true);
                setConnection('connected');
                await recover();
            }
            catch {
                if (current()) {
                    setConnection('offline');
                    setSyncError(true);
                }
            }
        };
        const created = (value: unknown) => {
            if (!current())
                return;
            const parsed = MessageSchema.safeParse(value);
            if (parsed.success)
                merge([parsed.data]);
            else
                setSyncError(true);
        };
        const disconnected = () => {
            if (current())
                setConnection('offline');
        };
        socket.on('connect', connected);
        socket.on(SocketEventNames.MESSAGE_CREATED, created);
        socket.on('disconnect', disconnected);
        socket.on('connect_error', disconnected);
        const dispose = () => {
            active.current = false;
            generation.current++;
            queuedRecovery.current = false;
            for (const controller of controllers.current)
                controller.abort();
            controllers.current.clear();
            socket.off('connect', connected);
            socket.off(SocketEventNames.MESSAGE_CREATED, created);
            socket.off('disconnect', disconnected);
            socket.off('connect_error', disconnected);
            socket.disconnect();
        };
        const unregister = registerAuthCleanup(dispose);
        if (socket.connected)
            void connected();
        else
            socket.connect();
        return () => { unregister(); dispose(); };
    }, [game.lobbyRoomId, merge, recover, actorKey]);
    const loadOlder = async () => {
        if (loadingOlder || !nextCursor.current || !active.current)
            return;
        setLoadingOlder(true);
        const controller = new AbortController();
        controllers.current.add(controller);
        try {
            const page = await fetchHistory(game.id, nextCursor.current, controller.signal);
            if (active.current) {
                merge(page.items);
                nextCursor.current = page.hasMore ? page.nextCursor ?? null : null;
                setOlderCursor(nextCursor.current);
                setSyncError(false);
            }
        }
        catch {
            if (active.current && !controller.signal.aborted)
                setSyncError(true);
        }
        finally {
            controllers.current.delete(controller);
            if (active.current)
                setLoadingOlder(false);
        }
    };
    const send = async (content: string, clientMessageId: string) => {
        if (!active.current || pendingSend.current)
            throw new Error('Send unavailable');
        pendingSend.current = true;
        setSending(true);
        const controller = new AbortController();
        controllers.current.add(controller);
        const target = canonical.current;
        try {
            const message = await sendMessage(target, content, clientMessageId, controller.signal);
            if (!active.current || controller.signal.aborted)
                throw new Error('Session changed');
            if (message.conversationId !== target)
                throw new Error('Wrong conversation response');
            merge([message]);
            return message;
        }
        finally {
            pendingSend.current = false;
            controllers.current.delete(controller);
            if (active.current)
                setSending(false);
        }
    };
    return { messages, connection, conversationResolved, syncError, isLoading: query.isPending, isError: query.isError, hasOlder: Boolean(olderCursor), loadingOlder, loadOlder, retry: async () => { await query.refetch(); await recover(); }, send, sending };
}
