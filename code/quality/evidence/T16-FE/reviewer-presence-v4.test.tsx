import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GameDTO, ProfileDTO, CustomStatus, SocketEventNames } from '@fg/contracts';
import { AuthProvider, useAuth, HeaderAuthWidget } from '../../../apps/web/src/features/auth/index.js';
import { OnlineUsers } from '../../../apps/web/src/features/lobby/OnlineUsers.js';

const transport = vi.hoisted(() => ({
  sockets: [] as Array<{
    namespace: string;
    fire: (event: string, data?: unknown) => void;
    closed: boolean;
    connected: boolean;
    emittedEvents: Array<{ event: string; body: unknown }>;
  }>,
  canonicalId: null as string | null,
  connected: true,
  heartbeatAck: { ok: true, conversationId: 'canonical-lol-room' } as { ok: boolean; conversationId?: string; error?: unknown },
  subscribeDelayMs: 0,
}));

vi.mock('socket.io-client', () => ({
  io: (namespace?: string) => {
    const handlers = new Map<string, Set<(data?: unknown) => void>>();
    const emittedEvents: Array<{ event: string; body: unknown }> = [];

    const socket = {
      namespace: namespace ?? '/',
      connected: transport.connected,
      closed: false,
      emittedEvents,
      connect() {
        socket.connected = true;
        return socket;
      },
      on(event: string, callback: (data?: unknown) => void) {
        const callbacks = handlers.get(event) ?? new Set();
        callbacks.add(callback);
        handlers.set(event, callbacks);
        return socket;
      },
      off(event: string, callback: (data?: unknown) => void) {
        handlers.get(event)?.delete(callback);
        return socket;
      },
      disconnect() {
        socket.closed = true;
        socket.connected = false;
        return socket;
      },
      timeout() {
        return socket;
      },
      emitWithAck: vi.fn(async (event: string, body: { conversationId: string }) => {
        emittedEvents.push({ event, body });
        if (transport.subscribeDelayMs > 0) {
          await new Promise((r) => setTimeout(r, transport.subscribeDelayMs));
        }
        if (event === SocketEventNames.PRESENCE_SUBSCRIBE) {
          return {
            ok: true,
            conversationId: transport.canonicalId ?? body.conversationId,
          };
        }
        if (event === SocketEventNames.PRESENCE_HEARTBEAT) {
          return transport.heartbeatAck;
        }
        return { ok: true, conversationId: body.conversationId };
      }),
      emit(event: string, body: unknown) {
        emittedEvents.push({ event, body });
      },
      fire(event: string, data?: unknown) {
        for (const callback of handlers.get(event) ?? []) callback(data);
      },
    };
    transport.sockets.push(socket);
    return socket;
  },
}));

const testGames: GameDTO[] = [
  { id: 'game-lol', title: 'Liên Minh Huyền Thoại', lobbyRoomId: 'lobby-lol-room' },
  { id: 'game-val', title: 'Valorant', lobbyRoomId: 'lobby-val-room' },
];

const makeProfile = (
  id: string,
  displayName = `User ${id}`,
  customStatus: CustomStatus = 'JUST_CHATTING'
): ProfileDTO => ({
  id,
  displayName,
  avatarUrl: null,
  bio: null,
  customStatus,
  gameProfiles: [],
  createdAt: '2026-10-01T00:00:00.000Z',
});

describe('T16-FE Presence & Online Users Panel', () => {
  let client: QueryClient;
  let authUser: { id: string; displayName: string; customStatus: CustomStatus } | null;
  let onlineResponses: Map<string, (url: URL) => Promise<Response>>;
  let statusPatchHandler: ((body: { customStatus: CustomStatus }) => Promise<Response>) | null;
  let profileFetchHandler: ((userId: string) => Promise<Response>) | null;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    authUser = null;
    onlineResponses = new Map();
    statusPatchHandler = null;
    profileFetchHandler = null;
    transport.sockets = [];
    transport.canonicalId = null;
    transport.connected = true;
    transport.heartbeatAck = { ok: true, conversationId: 'canonical-lol-room' };
    transport.subscribeDelayMs = 0;

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/api/v1/me') {
        if (!authUser) return new Response(JSON.stringify({}), { status: 401 });
        return new Response(
          JSON.stringify({
            id: authUser.id,
            displayName: authUser.displayName,
            email: 'user@example.com',
            emailVerified: true,
            discordId: 'discord-123',
            customStatus: authUser.customStatus,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
            onboardingComplete: true,
            interestedGames: ['Valorant'],
          }),
          { status: 200 }
        );
      }

      if (url.pathname === '/api/v1/me/status' && init?.method === 'PATCH') {
        if (statusPatchHandler) return statusPatchHandler(JSON.parse(String(init.body)));
        const body = JSON.parse(String(init.body));
        if (authUser) authUser.customStatus = body.customStatus;
        return new Response(JSON.stringify({ customStatus: body.customStatus, isOnline: true }), { status: 200 });
      }

      const onlineMatch = url.pathname.match(/^\/api\/v1\/games\/([^/]+)\/online$/);
      if (onlineMatch) {
        const gameId = onlineMatch[1];
        const handler = onlineResponses.get(gameId);
        if (handler) return handler(url);
        return new Response(JSON.stringify({ items: [], hasMore: false }), { status: 200 });
      }

      const profileMatch = url.pathname.match(/^\/api\/v1\/users\/([^/]+)\/profile$/);
      if (profileMatch) {
        const userId = decodeURIComponent(profileMatch[1]);
        if (profileFetchHandler) return profileFetchHandler(userId);
        return new Response(JSON.stringify(makeProfile(userId, `Profile ${userId}`)), { status: 200 });
      }

      throw new Error(`Unexpected test request: ${url.pathname}`);
    }));
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    });
    client.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const renderComponent = (game = testGames[0], customClient = client) =>
    render(
      <QueryClientProvider client={customClient}>
        <AuthProvider>
          <MemoryRouter>
            <OnlineUsers game={game} />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

  it('1. deduplicates duplicate users across pages, events, and multiple tabs, retaining first profile displayName', async () => {
    const p1 = makeProfile('user-1', 'Minh');
    const p2 = makeProfile('user-2', 'Hoàng');
    const p1Duplicate = makeProfile('user-1', 'Minh Duplicate');

    onlineResponses.set('game-lol', async () =>
      new Response(JSON.stringify({ items: [p1, p2, p1Duplicate], hasMore: false }), { status: 200 })
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText(/Cộng đồng \s*\(2\)|Đang online \s*\(2\)/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Minh')).toBeInTheDocument();
    expect(screen.queryByText('Minh Duplicate')).not.toBeInTheDocument();
    expect(screen.getByText('Hoàng')).toBeInTheDocument();
  });

  it('2. lost socket connection leaves chosen custom status intact', async () => {
    authUser = { id: 'user-me', displayName: 'Nam', customStatus: 'LOOKING_FOR_TEAM' };
    onlineResponses.set('game-lol', async () =>
      new Response(JSON.stringify({ items: [makeProfile('user-me', 'Nam', 'LOOKING_FOR_TEAM')], hasMore: false }), { status: 200 })
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /Trạng thái/i })).toHaveValue('LOOKING_FOR_TEAM');
    });

    const socket = transport.sockets.find((s) => s.namespace === '/presence');
    expect(socket).toBeDefined();

    await act(async () => {
      socket!.fire('disconnect');
    });

    expect(screen.getByText(/Mất kết nối/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Trạng thái/i })).toHaveValue('LOOKING_FOR_TEAM');
  });

  it('3. game switch releases old canonical subscription and resets scope', async () => {
    onlineResponses.set('game-lol', async () =>
      new Response(JSON.stringify({ items: [makeProfile('u1', 'LOL Player')], hasMore: false }), { status: 200 })
    );
    onlineResponses.set('game-val', async () =>
      new Response(JSON.stringify({ items: [makeProfile('u2', 'Val Player')], hasMore: false }), { status: 200 })
    );

    const { rerender } = render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter>
            <OnlineUsers game={testGames[0]} />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText('LOL Player')).toBeInTheDocument());

    const oldSocket = transport.sockets.find((s) => s.namespace === '/presence')!;
    expect(oldSocket.emittedEvents).toContainEqual({
      event: 'presence.subscribe',
      body: { conversationId: 'lobby-lol-room' },
    });

    rerender(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter>
            <OnlineUsers game={testGames[1]} />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText('Val Player')).toBeInTheDocument());
    expect(screen.queryByText('LOL Player')).not.toBeInTheDocument();

    expect(oldSocket.emittedEvents).toContainEqual({
      event: 'presence.unsubscribe',
      body: { conversationId: 'lobby-lol-room' },
    });
  });

  it('4. profile links encode opaque user IDs properly', async () => {
    const specialId = 'user/special#123';
    onlineResponses.set('game-lol', async () =>
      new Response(JSON.stringify({ items: [makeProfile(specialId, 'Special User')], hasMore: false }), { status: 200 })
    );

    renderComponent();

    await waitFor(() => expect(screen.getByText('Special User')).toBeInTheDocument());

    const link = screen.getByRole('link', { name: /Special User/i });
    expect(link).toHaveAttribute('href', `/users/${encodeURIComponent(specialId)}/profile`);
  });

  it('5. failed save of custom status keeps previous confirmed status with visible error and retry', async () => {
    authUser = { id: 'me-1', displayName: 'Nam', customStatus: 'JUST_CHATTING' };
    onlineResponses.set('game-lol', async () =>
      new Response(JSON.stringify({ items: [], hasMore: false }), { status: 200 })
    );

    let attempts = 0;
    statusPatchHandler = async (body) => {
      attempts++;
      if (attempts === 1) {
        return new Response(JSON.stringify({ code: 'INVALID_INPUT', message: 'Save failed' }), { status: 500 });
      }
      authUser!.customStatus = body.customStatus;
      return new Response(JSON.stringify({ customStatus: body.customStatus, isOnline: true }), { status: 200 });
    };

    renderComponent();

    const select = await screen.findByRole('combobox', { name: /Trạng thái/i });
    expect(select).toHaveValue('JUST_CHATTING');

    await act(async () => {
      fireEvent.change(select, { target: { value: 'PLAYING' } });
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Không lưu được trạng thái/i));
    expect(select).toHaveValue('JUST_CHATTING');

    const retryButton = screen.getByRole('button', { name: /Thử lại/i });
    await act(async () => {
      fireEvent.click(retryButton);
    });

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(select).toHaveValue('PLAYING');
  });

  it('6. canonical ack derives ID; member sends 15s heartbeat; guest sends no heartbeat', async () => {
    transport.canonicalId = 'canonical-lol-conv-99';
    onlineResponses.set('game-lol', async () =>
      new Response(JSON.stringify({ items: [], hasMore: false }), { status: 200 })
    );

    // Guest render
    const guestClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount: unmountGuest } = renderComponent(testGames[0], guestClient);
    await waitFor(() => {
      expect(transport.sockets.length).toBeGreaterThan(0);
    });

    const guestSocket = transport.sockets.find((s) => s.namespace === '/presence')!;

    await act(async () => {
      vi.advanceTimersByTime(16000);
    });

    expect(guestSocket.emittedEvents.filter((e) => e.event === 'presence.heartbeat')).toHaveLength(0);
    unmountGuest();

    // Authenticated member render with fresh QueryClient
    authUser = { id: 'auth-member', displayName: 'Auth Member', customStatus: 'LOOKING_FOR_TEAM' };
    const memberClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderComponent(testGames[0], memberClient);

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /Trạng thái/i })).toBeInTheDocument();
    });

    const memberSocket = transport.sockets.filter((s) => s.namespace === '/presence').at(-1)!;

    await act(async () => {
      vi.advanceTimersByTime(16000);
    });

    expect(memberSocket.emittedEvents).toContainEqual({
      event: 'presence.heartbeat',
      body: { conversationId: 'canonical-lol-conv-99' },
    });
  });

  it('7. stale HTTP responses, acks, events, or status saves after game switch or logout are ignored', async () => {
    let resolveSlowOnline!: (r: Response) => void;
    onlineResponses.set('game-lol', async () => new Promise((resolve) => { resolveSlowOnline = resolve; }));
    onlineResponses.set('game-val', async () =>
      new Response(JSON.stringify({ items: [makeProfile('v1', 'Val User')], hasMore: false }), { status: 200 })
    );

    const { rerender } = render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter>
            <OnlineUsers game={testGames[0]} />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    // Give time for game-lol request to start
    await new Promise((r) => setTimeout(r, 10));

    rerender(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter>
            <OnlineUsers game={testGames[1]} />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText('Val User')).toBeInTheDocument());

    await act(async () => {
      if (resolveSlowOnline) {
        resolveSlowOnline(new Response(JSON.stringify({ items: [makeProfile('stale-1', 'Stale User')], hasMore: false }), { status: 200 }));
      }
    });

    expect(screen.queryByText('Stale User')).not.toBeInTheDocument();
  });

  it('8. ignores malformed or wrong-scope presence events', async () => {
    transport.canonicalId = 'canonical-lol-conv';
    onlineResponses.set('game-lol', async () =>
      new Response(JSON.stringify({ items: [makeProfile('u1', 'User 1')], hasMore: false }), { status: 200 })
    );

    renderComponent();
    await waitFor(() => expect(screen.getByText('User 1')).toBeInTheDocument());

    const socket = transport.sockets.find((s) => s.namespace === '/presence')!;

    // Wrong scope event
    await act(async () => {
      socket.fire('presence.changed', {
        conversationId: 'wrong-scope-conv',
        userId: 'u2',
        customStatus: 'PLAYING',
        isOnline: true,
      });
    });

    // Malformed payload (missing conversationId)
    await act(async () => {
      socket.fire('presence.changed', { invalidKey: 'bad' });
    });

    expect(screen.queryByText('u2')).not.toBeInTheDocument();
  });

  it('9. handles empty, error, and retry states correctly', async () => {
    let returnError = true;
    onlineResponses.set('game-lol', async () => {
      if (returnError) return new Response(JSON.stringify({ message: 'Error loading' }), { status: 500 });
      return new Response(JSON.stringify({ items: [], hasMore: false }), { status: 200 });
    });

    renderComponent();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Không tải được danh sách online/i));

    returnError = false;
    const retryButton = screen.getByRole('button', { name: /Thử lại/i });

    await act(async () => {
      fireEvent.click(retryButton);
    });

    await waitFor(() => expect(screen.getByText(/Chưa có người chơi online/i)).toBeInTheDocument());
  });

  it('10. supports pagination with cursor and appends new unique users', async () => {
    onlineResponses.set('game-lol', async (url) => {
      const cursor = url.searchParams.get('cursor');
      if (!cursor) {
        return new Response(
          JSON.stringify({
            items: [makeProfile('p1', 'Page 1 User')],
            hasMore: true,
            nextCursor: 'cursor-page-2',
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          items: [makeProfile('p2', 'Page 2 User')],
          hasMore: false,
          nextCursor: null,
        }),
        { status: 200 }
      );
    });

    renderComponent();

    await waitFor(() => expect(screen.getByText('Page 1 User')).toBeInTheDocument());

    const loadMoreButton = screen.getByRole('button', { name: /Xem thêm/i });
    expect(loadMoreButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(loadMoreButton);
    });

    await waitFor(() => expect(screen.getByText('Page 2 User')).toBeInTheDocument());
    expect(screen.getByText('Page 1 User')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xem thêm/i })).not.toBeInTheDocument();
  });

  it('11. regression: strict SocketScopedPresenceChangedPayloadSchema required, ignores legacy/unscoped events and events before canonical ACK', async () => {
    onlineResponses.set('game-lol', async () =>
      new Response(JSON.stringify({ items: [makeProfile('u1', 'User 1')], hasMore: false }), { status: 200 })
    );

    renderComponent();
    await waitFor(() => expect(transport.sockets.length).toBeGreaterThan(0));
    const socket = transport.sockets.find((s) => s.namespace === '/presence')!;

    // Legacy event missing required conversationId
    await act(async () => {
      socket.fire('presence.changed', {
        userId: 'u3',
        customStatus: 'PLAYING',
        isOnline: true,
      });
    });

    expect(screen.queryByText('u3')).not.toBeInTheDocument();
  });

  it('12. regression: online->offline while profile fetch is pending does not re-add user', async () => {
    transport.canonicalId = 'canonical-lol-room';
    onlineResponses.set('game-lol', async () =>
      new Response(JSON.stringify({ items: [], hasMore: false }), { status: 200 })
    );

    let resolveProfile!: (r: Response) => void;
    profileFetchHandler = async () => new Promise((resolve) => { resolveProfile = resolve; });

    renderComponent();
    await waitFor(() => expect(screen.getByText(/Chưa có người chơi online/i)).toBeInTheDocument());

    const socket = transport.sockets.find((s) => s.namespace === '/presence')!;

    // Online event triggers profile fetch
    await act(async () => {
      socket.fire('presence.changed', {
        conversationId: 'canonical-lol-room',
        userId: 'user-racing',
        customStatus: 'PLAYING',
        isOnline: true,
      });
    });

    // User goes offline while profile fetch is in-flight
    await act(async () => {
      socket.fire('presence.changed', {
        conversationId: 'canonical-lol-room',
        userId: 'user-racing',
        customStatus: 'PLAYING',
        isOnline: false,
      });
    });

    // Profile fetch resolves late
    await act(async () => {
      if (resolveProfile) {
        resolveProfile(new Response(JSON.stringify(makeProfile('user-racing', 'Late Profile User')), { status: 200 }));
      }
    });

    expect(screen.queryByText('Late Profile User')).not.toBeInTheDocument();
  });

  it('13. regression: heartbeat uses emitWithAck and stops timer on error/timeout/rejection', async () => {
    authUser = { id: 'hb-user', displayName: 'HB User', customStatus: 'LOOKING_FOR_TEAM' };
    transport.canonicalId = 'canonical-lol-room';
    onlineResponses.set('game-lol', async () =>
      new Response(JSON.stringify({ items: [], hasMore: false }), { status: 200 })
    );

    renderComponent();

    await waitFor(() => expect(screen.getByRole('combobox', { name: /Trạng thái/i })).toBeInTheDocument());

    // First heartbeat succeeds
    await act(async () => {
      vi.advanceTimersByTime(16000);
    });

    // Second heartbeat rejected by server (e.g. session revoked)
    transport.heartbeatAck = { ok: false, error: { code: 'LOGIN_REQUIRED', message: 'Session expired', requestId: 'req-1' } };

    await act(async () => {
      vi.advanceTimersByTime(16000);
    });

    await waitFor(() => expect(screen.getByText(/Mất kết nối/i)).toBeInTheDocument());
  });

  it('14. regression: loadMore failure exposes error/retry and preserves loaded users', async () => {
    let returnLoadMoreError = true;
    onlineResponses.set('game-lol', async (url) => {
      const cursor = url.searchParams.get('cursor');
      if (!cursor) {
        return new Response(
          JSON.stringify({
            items: [makeProfile('p1', 'Page 1 User')],
            hasMore: true,
            nextCursor: 'cursor-2',
          }),
          { status: 200 }
        );
      }
      if (returnLoadMoreError) {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      }
      return new Response(
        JSON.stringify({
          items: [makeProfile('p2', 'Page 2 User')],
          hasMore: false,
          nextCursor: null,
        }),
        { status: 200 }
      );
    });

    renderComponent();
    await waitFor(() => expect(screen.getByText('Page 1 User')).toBeInTheDocument());

    const loadMoreButton = screen.getByRole('button', { name: /Xem thêm/i });
    await act(async () => {
      fireEvent.click(loadMoreButton);
    });

    // Page 1 user is preserved and error for loadMore is shown
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Không tải được thêm/i));
    expect(screen.getByText('Page 1 User')).toBeInTheDocument();

    // Retry loadMore
    returnLoadMoreError = false;
    const retryButton = screen.getByRole('button', { name: /Thử lại/i });
    await act(async () => {
      fireEvent.click(retryButton);
    });

    await waitFor(() => expect(screen.getByText('Page 2 User')).toBeInTheDocument());
    expect(screen.getByText('Page 1 User')).toBeInTheDocument();
  });

  it('15. regression: socket does not open while auth is loading/error/signing-out; status save uses confirmed server response', async () => {
    authUser = { id: 'auth-user', displayName: 'Auth User', customStatus: 'LOOKING_FOR_TEAM' };
    statusPatchHandler = async (body) => {
      // Server responds with confirmed status PLAYING
      return new Response(JSON.stringify({ customStatus: 'PLAYING', isOnline: true }), { status: 200 });
    };

    renderComponent();

    const select = await screen.findByRole('combobox', { name: /Trạng thái/i });
    await act(async () => {
      fireEvent.change(select, { target: { value: 'JUST_CHATTING' } });
    });

    // Confirmed server response is PLAYING
    await waitFor(() => expect(select).toHaveValue('PLAYING'));
  });

  it('Codex review: an older initial response cannot overwrite the newer subscription refresh', async () => {
    let resolveOld;
    let requests = 0;
    onlineResponses.set('game-lol', async () => {
      requests++;
      if (requests === 1) return new Promise(resolve => { resolveOld = resolve; });
      return new Response(JSON.stringify({items:[makeProfile('fresh-user','Fresh authoritative user')],hasMore:false}),{status:200});
    });
    renderComponent();
    await waitFor(() => expect(screen.getByText('Fresh authoritative user')).toBeInTheDocument());
    await act(async () => resolveOld(new Response(JSON.stringify({items:[makeProfile('old-user','Old stale user')],hasMore:false}),{status:200})));
    expect(screen.getByText('Fresh authoritative user')).toBeInTheDocument();
    expect(screen.queryByText('Old stale user')).not.toBeInTheDocument();
  });

  it('Codex review: successful status save remains usable when auth refetch confirms a changed value', async () => {
    authUser={id:'status-real-user',displayName:'Status user',customStatus:'JUST_CHATTING'};
    statusPatchHandler=async body => {
      authUser.customStatus=body.customStatus;
      return new Response(JSON.stringify({customStatus:body.customStatus,isOnline:true}),{status:200});
    };
    renderComponent();
    const select=await screen.findByRole('combobox',{name:/Trạng thái/i});
    await act(async () => fireEvent.change(select,{target:{value:'PLAYING'}}));
    await waitFor(() => expect(select).toHaveValue('PLAYING'));
    await waitFor(() => expect(select).toBeEnabled());
    expect(screen.queryByText('Đang lưu…')).not.toBeInTheDocument();
  });

  it('Codex review: authoritative reconnect list restores a user after an offline event was followed by missed online event', async () => {
    onlineResponses.set('game-lol',async()=>new Response(JSON.stringify({items:[makeProfile('recovered-user','Recovered user')],hasMore:false}),{status:200}));
    renderComponent();
    await waitFor(() => expect(screen.getByText('Recovered user')).toBeInTheDocument());
    const socket=transport.sockets.find(s=>s.namespace==='/presence');
    await act(async () => socket.fire('presence.changed',{conversationId:'lobby-lol-room',userId:'recovered-user',customStatus:'JUST_CHATTING',isOnline:false}));
    expect(screen.queryByText('Recovered user')).not.toBeInTheDocument();
    await act(async () => {socket.fire('disconnect');socket.fire('connect');});
    await waitFor(() => expect(screen.getByText('Recovered user')).toBeInTheDocument());
  });

  it('Codex review v2: reconnect snapshot is current even when offline event and request share one millisecond', async () => {
    vi.spyOn(Date,'now').mockReturnValue(1791220000000);
    onlineResponses.set('game-lol',async()=>new Response(JSON.stringify({items:[makeProfile('same-ms','Same millisecond user')],hasMore:false}),{status:200}));
    renderComponent();
    await waitFor(()=>expect(screen.getByText('Same millisecond user')).toBeInTheDocument());
    const socket=transport.sockets.find(s=>s.namespace==='/presence');
    await act(async()=>socket.fire('presence.changed',{conversationId:'lobby-lol-room',userId:'same-ms',customStatus:'JUST_CHATTING',isOnline:false}));
    expect(screen.queryByText('Same millisecond user')).not.toBeInTheDocument();
    await act(async()=>{socket.fire('disconnect');socket.fire('connect');});
    await waitFor(()=>expect(screen.getByText('Same millisecond user')).toBeInTheDocument());
  });

  it('Codex review v2: delayed profile hydration cannot revert a newer online status', async () => {
    const resolvers=[];
    profileFetchHandler=async()=>new Promise(resolve=>resolvers.push(resolve));
    renderComponent();
    await waitFor(()=>expect(screen.getByText(/Chưa có người chơi online/i)).toBeInTheDocument());
    const socket=transport.sockets.find(s=>s.namespace==='/presence');
    await act(async()=>socket.fire('presence.changed',{conversationId:'lobby-lol-room',userId:'status-race',customStatus:'PLAYING',isOnline:true}));
    await waitFor(()=>expect(resolvers).toHaveLength(1));
    await act(async()=>socket.fire('presence.changed',{conversationId:'lobby-lol-room',userId:'status-race',customStatus:'LOOKING_FOR_TEAM',isOnline:true}));
    await waitFor(()=>expect(resolvers).toHaveLength(2));
    await act(async()=>resolvers[1](new Response(JSON.stringify(makeProfile('status-race','Ordered status user')),{status:200})));
    await waitFor(()=>expect(screen.getByText('Ordered status user')).toBeInTheDocument());
    await act(async()=>resolvers[0](new Response(JSON.stringify(makeProfile('status-race','Ordered status user')),{status:200})));
    expect(screen.getByText('Đang tìm đội')).toBeInTheDocument();
    expect(screen.queryByText('Đang chơi')).not.toBeInTheDocument();
  });

  it('Codex review v3: failed older request must not turn a successful newer list into an error', async()=>{
    let rejectOld,requests=0;
    onlineResponses.set('game-lol',async()=>{
      if(++requests===1)return new Promise((_resolve,reject)=>{rejectOld=reject;});
      return new Response(JSON.stringify({items:[makeProfile('good-list','Confirmed list user')],hasMore:false}),{status:200});
    });
    renderComponent();
    await waitFor(()=>expect(screen.getByText('Confirmed list user')).toBeInTheDocument());
    await act(async()=>rejectOld(new Error('Old request failed after newer success')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Confirmed list user')).toBeInTheDocument();
  });

  it('Codex review v3: a snapshot cannot erase an online event received after the request started', async()=>{
    let resolveRefresh,requests=0;
    onlineResponses.set('game-lol',async()=>{
      if(++requests===3)return new Promise(resolve=>{resolveRefresh=resolve;});
      return new Response(JSON.stringify({items:[],hasMore:false}),{status:200});
    });
    renderComponent();
    await waitFor(()=>expect(screen.getByText(/Chưa có người chơi online/i)).toBeInTheDocument());
    const socket=transport.sockets.find(s=>s.namespace==='/presence');
    await act(async()=>socket.fire('connect'));
    await waitFor(()=>expect(requests).toBe(3));
    await act(async()=>socket.fire('presence.changed',{conversationId:'lobby-lol-room',userId:'new-event-user',customStatus:'PLAYING',isOnline:true}));
    await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('/users/new-event-user/profile'))).toBe(true));
    await act(async()=>{await Promise.resolve();await Promise.resolve();});
    await act(async()=>resolveRefresh(new Response(JSON.stringify({items:[],hasMore:false}),{status:200})));
    await waitFor(()=>expect(screen.getByText('Profile new-event-user')).toBeInTheDocument());
  });

  it('Codex review v4: failed authentication lookup is not treated as an anonymous guest socket', async()=>{
    let resolveMe;
    const originalFetch=globalThis.fetch;
    vi.stubGlobal('fetch',vi.fn(async(input,init)=>{
      const url=new URL(String(input),'http://localhost');
      if(url.pathname==='/api/v1/me')return new Promise(resolve=>{resolveMe=resolve;});
      return originalFetch(input,init);
    }));
    const Probe=()=>{const auth=useAuth();return <output>{auth.isLoading?'auth:loading':auth.isError?'auth:error':'auth:settled'}</output>;};
    render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter><Probe/><OnlineUsers game={testGames[0]}/></MemoryRouter></AuthProvider></QueryClientProvider>);
    await waitFor(()=>expect(resolveMe).toBeTypeOf('function'));
    expect(screen.getByText('auth:loading')).toBeInTheDocument();
    expect(transport.sockets).toHaveLength(0);
    await act(async()=>resolveMe(new Response(JSON.stringify({message:'Auth lookup unavailable'}),{status:500})));
    await waitFor(()=>expect(screen.getByText('auth:error')).toBeInTheDocument());
    expect(transport.sockets).toHaveLength(0);
  });

  it('Codex review v4: real AuthProvider logout ignores a deferred status save and does not recreate previous actor', async()=>{
    authUser={id:'logout-user',displayName:'Logout User',customStatus:'JUST_CHATTING'};
    let resolveStatus,resolveLogout;
    statusPatchHandler=async()=>new Promise(resolve=>{resolveStatus=resolve;});
    const originalFetch=globalThis.fetch;
    vi.stubGlobal('fetch',vi.fn(async(input,init)=>{
      const url=new URL(String(input),'http://localhost');
      if(url.pathname==='/api/auth/sign-out')return new Promise(resolve=>{resolveLogout=resolve;});
      return originalFetch(input,init);
    }));
    render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter><HeaderAuthWidget/><OnlineUsers game={testGames[0]}/></MemoryRouter></AuthProvider></QueryClientProvider>);
    const select=await screen.findByRole('combobox',{name:/Trạng thái/i});
    await act(async()=>fireEvent.change(select,{target:{value:'PLAYING'}}));
    await waitFor(()=>expect(resolveStatus).toBeTypeOf('function'));
    const oldSockets=[...transport.sockets];
    await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Đăng xuất'})));
    await waitFor(()=>expect(resolveLogout).toBeTypeOf('function'));
    await waitFor(()=>expect(oldSockets.every(socket=>socket.closed)).toBe(true));
    expect(screen.queryByRole('combobox',{name:/Trạng thái/i})).not.toBeInTheDocument();
    authUser=null;
    await act(async()=>resolveLogout(new Response(JSON.stringify({success:true}),{status:200})));
    await waitFor(()=>expect(client.getQueryData(['auth','me'])).toBeNull());
    await act(async()=>resolveStatus(new Response(JSON.stringify({customStatus:'PLAYING',isOnline:true}),{status:200})));
    expect(client.getQueryData(['auth','me'])).toBeNull();
    expect(screen.queryByRole('combobox',{name:/Trạng thái/i})).not.toBeInTheDocument();
    expect(screen.queryByText('Logout User')).not.toBeInTheDocument();
  });
});
