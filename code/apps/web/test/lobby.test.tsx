import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ALLOWED_GAMES, MessageDTO, encodeChatCursor } from '@fg/contracts';
import { AuthProvider } from '../src/features/auth/index.js';
import App from '../src/App.js';
const transport = vi.hoisted(() => ({ sockets: [] as Array<{
        namespace: string;
        fire: (event: string, data?: unknown) => void;
        closed: boolean;
        emit: (event?: string, data?: unknown) => unknown;
    }>, canonicalId: null as string | null, connected: true }));
vi.mock('socket.io-client', () => ({ io: (urlOrOpts?: unknown) => {
        const namespace = typeof urlOrOpts === 'string' ? urlOrOpts : '/';
        const handlers = new Map<string, Set<(data?: unknown) => void>>();
        const socket = { namespace, connected: transport.connected, connect() { return socket; }, closed: false, on(event: string, callback: (data?: unknown) => void) { const callbacks = handlers.get(event) ?? new Set(); callbacks.add(callback); handlers.set(event, callbacks); return socket; }, off(event: string, callback: (data?: unknown) => void) { handlers.get(event)?.delete(callback); return socket; }, disconnect() { socket.closed = true; socket.connected = false; return socket; }, timeout() { return socket; }, emit() { return socket; }, emitWithAck: vi.fn(async (_event: string, body: {
                conversationId: string;
            }) => ({ ok: true, conversationId: transport.canonicalId ?? body.conversationId })), fire(event: string, data?: unknown) {
                for (const callback of handlers.get(event) ?? [])
                    callback(data);
            } };
        transport.sockets.push(socket);
        return socket;
    } }));
const games = ALLOWED_GAMES.map((title, index) => ({ id: `game-${index}`, title, lobbyRoomId: `lobby-${index}` }));
const message = (id: string, conversationId = 'lobby-0', content = id): MessageDTO => ({ id, conversationId, senderId: 'sender', sender: { id: 'sender', displayName: 'Bạn chơi', avatarUrl: null, customStatus: 'JUST_CHATTING' }, content, createdAt: '2026-10-01T12:00:00.000Z', attachments: [], mentions: [], mentionedUserIds: [] });
const page = (items: MessageDTO[], nextCursor: string | null = null) => ({ items, hasMore: nextCursor !== null, nextCursor });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
describe('T13 approved Lobby behavior', () => {
    let client: QueryClient;
    let auth: boolean;
    let history: (game: string, url: URL) => Promise<Response>;
    let sends: Array<{
        url: string;
        body: Record<string, unknown>;
    }>;
    beforeEach(() => {
        client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
        auth = false;
        sends = [];
        transport.sockets = [];
        transport.canonicalId = null;
        transport.connected = true;
        history = async (game) => reply(page([message(`tin-${game}`, `lobby-${game.slice(-1)}`)]));
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = new URL(String(input), 'http://localhost');
            if (url.pathname === '/api/v1/me')
                return auth ? reply({ id: 'actor', displayName: 'Gamer', email: 'gamer@example.com', emailVerified: true, discordId: 'test-discord', customStatus: 'JUST_CHATTING', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', onboardingComplete: true, interestedGames: ['Valorant'] }) : reply({}, 401);
            if (url.pathname === '/api/v1/games')
                return reply(games);
            const onlineMatch = url.pathname.match(/^\/api\/v1\/games\/([^/]+)\/online$/);
            if (onlineMatch)
                return reply(page([]));
            const match = url.pathname.match(/^\/api\/v1\/games\/([^/]+)\/lobby\/messages$/);
            if (match)
                return history(match[1], url);
            if (init?.method === 'POST' && url.pathname.endsWith('/messages')) {
                const body = JSON.parse(String(init.body));
                sends.push({ url: url.pathname, body });
                return reply(message('sent', url.pathname.split('/')[4], String(body.content)), 201);
            }
            throw new Error(`Unexpected test request: ${url.pathname}`);
        }));
    });
    afterEach(() => { client.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
    const show = () => render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter><App /></MemoryRouter></AuthProvider></QueryClientProvider>);
    it('GAME-LOGO-FE uses local game images with full accessible game names and shared FG artwork', async () => {
        show();
        await screen.findByRole('combobox', { name: 'Chọn game' });
        const rail = screen.getByRole('complementary', { name: 'Game và điều hướng' });
        for (const game of games) {
            const control = screen.getByRole('button', { name: game.title });
            expect(control).toHaveAttribute('title', game.title);
            expect(control.querySelector('img')).toHaveAttribute('src', expect.stringMatching(/^\/game-logos\//));
        }
        expect(rail.querySelector('.fg-brand-mark')).toBeInTheDocument();
        expect(document.querySelector('.fg-app-header .fg-brand-mark')).toBeInTheDocument();
        expect(document.querySelector('.fg-header-game-icon img')).toHaveAttribute('src', '/game-logos/league-of-legends.png');
    });
    it('loads all seven games, guest sees history and cannot send', async () => {
        show();
        const selector = await screen.findByRole('combobox', { name: 'Chọn game' });
        expect(selector.querySelectorAll('option')).toHaveLength(7);
        expect(await screen.findByText('tin-game-0')).toBeVisible();
        expect(screen.getByRole('textbox', { name: 'Tin nhắn Lobby' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Gửi tin nhắn' })).toBeDisabled();
        expect(sends).toEqual([]);
    });
    it('changes game without mixing histories and ignores a response arriving after game switch', async () => {
        let resolveOld!: (response: Response) => void;
        history = async (game) => game === 'game-0' ? new Promise(resolve => { resolveOld = resolve; }) : reply(page([message('Valorant riêng', 'lobby-1')]));
        show();
        fireEvent.change(await screen.findByRole('combobox', { name: 'Chọn game' }), { target: { value: 'game-1' } });
        expect(await screen.findByText('Valorant riêng')).toBeVisible();
        await act(async () => { resolveOld(reply(page([message('Tin trễ từ Liên Minh')]))); });
        expect(screen.queryByText('Tin trễ từ Liên Minh')).not.toBeInTheDocument();
    });
    it('merges duplicate realtime/reconnect history by message ID and recovers a gap beyond50', async () => {
        let requests = 0;
        let fetchedOlder = false;
        const anchor = { ...message('old-anchor'), createdAt: '2026-10-01T11:00:00.000Z' };
        history = async (_game, url) => {
            if (requests++ === 0)
                return reply(page([anchor], encodeChatCursor({ id: anchor.id, createdAt: anchor.createdAt })));
            if (url.searchParams.has('cursor')) {
                fetchedOlder = true;
                return reply(page([...Array.from({ length: 21 }, (_, index) => message(`gap-${index + 50}`)), anchor]));
            }
            return reply(page([message('new-gap'), ...Array.from({ length: 49 }, (_, index) => message(`gap-${index + 1}`))], encodeChatCursor({ id: 'gap-49', createdAt: '2026-10-01T12:00:00.000Z' })));
        };
        show();
        await screen.findByText('old-anchor');
        const socket = transport.sockets.filter(s => s.namespace === '/').at(-1)!;
        await act(async () => { socket.fire('message.created', message('new-gap')); socket.fire('message.created', message('new-gap')); socket.fire('connect'); });
        await waitFor(() => expect(document.querySelectorAll('[data-message-id]')).toHaveLength(72));
        expect(fetchedOlder).toBe(true);
        expect(screen.queryByRole('button', { name: 'Xem tin trước' })).not.toBeInTheDocument();
        expect(screen.getAllByText('new-gap')).toHaveLength(1);
        expect(screen.getAllByText('old-anchor')).toHaveLength(1);
    });
    it('ignores old socket events after changing game and disposes its connection', async () => {
        show();
        await screen.findByText('tin-game-0');
        const old = transport.sockets.filter(s => s.namespace === '/').at(-1)!;
        fireEvent.change(screen.getByRole('combobox', { name: 'Chọn game' }), { target: { value: 'game-1' } });
        await screen.findByText('tin-game-1');
        await act(async () => { old.fire('message.created', message('stale event')); });
        expect(screen.queryByText('stale event')).not.toBeInTheDocument();
        expect(old.closed).toBe(true);
    });
    it('authenticated composer persists through API, merges server/event duplicates and renders HTML as text', async () => {
        auth = true;
        show();
        await screen.findByText('tin-game-0');
        const input = screen.getByRole('textbox', { name: 'Tin nhắn Lobby' });
        await waitFor(() => expect(input).toBeEnabled());
        fireEvent.change(input, { target: { value: '<img src=x onerror=alert(1)>' } });
        fireEvent.click(screen.getByRole('button', { name: 'Gửi tin nhắn' }));
        expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeVisible();
        expect(sends).toHaveLength(1);
        expect(sends[0].body.clientMessageId).toEqual(expect.any(String));
        expect(document.querySelector('img[src="x"]')).toBeNull();
        await act(async () => { transport.sockets.filter(s => s.namespace === '/').at(-1)!.fire('message.created', message('sent', 'lobby-0', '<img src=x onerror=alert(1)>')); });
        expect(screen.getAllByText('<img src=x onerror=alert(1)>')).toHaveLength(1);
    });
    it('uses the server canonical conversation ID when it differs from the opaque Lobby ID', async () => {
        auth = true;
        transport.canonicalId = 'resolved-conversation';
        history = async () => reply(page([message('Canonical history', 'resolved-conversation')]));
        show();
        await screen.findByText('Canonical history');
        fireEvent.change(screen.getByRole('textbox', { name: 'Tin nhắn Lobby' }), { target: { value: 'canonical send' } });
        fireEvent.click(screen.getByRole('button', { name: 'Gửi tin nhắn' }));
        await waitFor(() => expect(sends).toHaveLength(1));
        expect(sends[0].url).toBe('/api/v1/conversations/resolved-conversation/messages');
    });
    it('keeps authenticated send disabled until the server resolves the conversation', async () => {
        auth = true;
        transport.connected = false;
        history = async () => new Promise(() => { });
        show();
        await screen.findByRole('combobox', { name: 'Chọn game' });
        await screen.findByTestId('user-avatar-link');
        expect(screen.getByRole('textbox', { name: 'Tin nhắn Lobby' })).toBeDisabled();
        expect(sends).toHaveLength(0);
    });
    it('opens mobile game navigation, closes on game selection and Escape', async () => {
        show();
        await screen.findByRole('combobox', { name: 'Chọn game' });
        fireEvent.click(screen.getByRole('button', { name: 'Mở điều hướng game' }));
        const dialog = screen.getByRole('dialog', { name: 'Điều hướng game' });
        expect(dialog).toBeVisible();
        fireEvent.click(dialog.querySelector('button[title="Valorant"]')!);
        await screen.findByText('tin-game-1');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Mở điều hướng game' }));
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    it('has accessible Chat/Find-team tabs and honest loading/error states', async () => {
        history = async () => reply({ message: 'unavailable' }, 500);
        show();
        await screen.findByRole('combobox', { name: 'Chọn game' });
        expect(await screen.findByRole('alert')).toHaveTextContent(/lịch sử/i);
        expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Tìm đội' }));
        expect(screen.getByRole('tab', { name: 'Tìm đội' })).toHaveAttribute('aria-selected', 'true');
    });
});
