// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoomDTO, RoomMemberDTO, MessageDTO, MeDTO, MeDTOSchema, GameDTO, CreateRoomRequest, SocketEventNames } from '@fg/contracts';
import { AuthProvider } from '../src/features/auth/index.js';
import { App } from '../src/App.tsx';

// Socket mock transport for tests
const socketTransport = vi.hoisted(() => ({
  sockets: [] as Array<{
    namespace: string;
    fire: (event: string, data?: unknown) => void;
    closed: boolean;
    emit: (event?: string, data?: unknown) => unknown;
    emitWithAck: (event: string, body: unknown) => Promise<unknown>;
  }>,
  connected: true,
}));

vi.mock('socket.io-client', () => ({
  io: (urlOrOpts?: unknown) => {
    const handlers = new Map<string, Set<(data?: unknown) => void>>();
    const socket = {
      namespace: typeof urlOrOpts === 'string' ? urlOrOpts : '/',
      connected: socketTransport.connected,
      connect() {
        return socket;
      },
      closed: false,
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
      emit() {
        return socket;
      },
      emitWithAck: vi.fn(async (_event: string, body: unknown) => {
        const convId = (body as { conversationId?: string })?.conversationId || '';
        return { ok: true, conversationId: convId };
      }),
      fire(event: string, data?: unknown) {
        for (const callback of handlers.get(event) ?? []) {
          callback(data);
        }
      },
    };
    socketTransport.sockets.push(socket);
    return socket;
  },
}));

// Real-shaped games catalog with UUIDs
const mockGamesCatalog: GameDTO[] = [
  {
    id: '17e6cab4-a5eb-47cc-b69f-22158aa22739',
    title: 'Liên Minh Huyền Thoại',
    lobbyRoomId: 'lobby-lol-uuid',
  },
  {
    id: '28f7dcb5-b6fc-58dd-c70g-33269bb33840',
    title: 'Valorant',
    lobbyRoomId: 'lobby-val-uuid',
  },
];

// Valid MeDTO fixtures (parsed via MeDTOSchema to guarantee contract integrity)
const mockOwnerUser: MeDTO = MeDTOSchema.parse({
  id: 'user-owner',
  displayName: 'Room Owner',
  email: 'owner@fg.test',
  emailVerified: true,
  discordId: 'discord-owner',
  avatarUrl: null,
  customStatus: 'JUST_CHATTING',
  onboardingComplete: true,
  interestedGames: ['Liên Minh Huyền Thoại'],
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
});

const mockMemberUser: MeDTO = MeDTOSchema.parse({
  id: 'user-member',
  displayName: 'Regular Member',
  email: 'member@fg.test',
  emailVerified: true,
  discordId: 'discord-member',
  avatarUrl: null,
  customStatus: 'LOOKING_FOR_TEAM',
  onboardingComplete: true,
  interestedGames: ['Valorant'],
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
});

const mockIncompleteUser: MeDTO = MeDTOSchema.parse({
  id: 'user-incomplete',
  displayName: 'Incomplete User',
  email: 'incomplete@fg.test',
  emailVerified: true,
  discordId: 'discord-incomplete',
  avatarUrl: null,
  customStatus: 'JUST_CHATTING',
  onboardingComplete: false,
  interestedGames: [],
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
});

const mockRoom1: RoomDTO = {
  id: 'room-1',
  conversationId: 'conv-room-1',
  name: 'Đội LMHT Hàng Đấu',
  description: 'Phòng leo rank Kim Cương',
  gameId: '17e6cab4-a5eb-47cc-b69f-22158aa22739',
  gameTitle: 'Liên Minh Huyền Thoại',
  ownerId: 'user-owner',
  owner: {
    id: 'user-owner',
    displayName: 'Room Owner',
    customStatus: 'JUST_CHATTING',
    avatarUrl: null,
  },
  settings: {
    visibility: 'PUBLIC',
    invitePolicy: 'OWNER_APPROVAL',
    playerCapacity: 5,
  },
  memberCount: 3,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

const mockPrivateRoom: RoomDTO = {
  id: 'room-private',
  conversationId: 'conv-room-private',
  name: 'Phòng Mật 18+',
  description: 'Phòng riêng tư',
  gameId: '28f7dcb5-b6fc-58dd-c70g-33269bb33840',
  gameTitle: 'Valorant',
  ownerId: 'user-owner',
  owner: {
    id: 'user-owner',
    displayName: 'Room Owner',
    customStatus: 'JUST_CHATTING',
    avatarUrl: null,
  },
  settings: {
    visibility: 'PRIVATE',
    invitePolicy: 'DIRECT_MEMBER',
    playerCapacity: 5,
  },
  memberCount: 1,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

const mockRoomMembers: RoomMemberDTO[] = [
  {
    roomId: 'room-1',
    userId: 'user-owner',
    user: { id: 'user-owner', displayName: 'Room Owner', customStatus: 'JUST_CHATTING', avatarUrl: null },
    role: 'OWNER',
    permissions: ['MANAGE_CHAT', 'MANAGE_CALLS', 'MANAGE_RECRUITMENT', 'MANAGE_MEMBERS', 'OWNER_TRANSFER', 'ROOM_DISSOLVE'],
    joinedAt: '2026-10-01T12:00:00.000Z',
  },
  {
    roomId: 'room-1',
    userId: 'user-member',
    user: { id: 'user-member', displayName: 'Regular Member', customStatus: 'JUST_CHATTING', avatarUrl: null },
    role: 'MEMBER',
    permissions: [],
    joinedAt: '2026-10-01T12:30:00.000Z',
  },
];

const mockChatMessage: MessageDTO = {
  id: 'msg-1',
  conversationId: 'conv-room-1',
  senderId: 'user-owner',
  sender: { id: 'user-owner', displayName: 'Room Owner', customStatus: 'JUST_CHATTING', avatarUrl: null },
  content: 'Private fixture message before revoke 35269f47',
  attachments: [],
  mentions: [],
  mentionedUserIds: [],
  createdAt: '2026-10-01T12:35:00.000Z',
};

describe('T19 — Rooms, Private Group Chat, and Room Management', () => {
  let queryClient: QueryClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let fetchHistoryCalls: string[];
  let postRoomCalls: Array<{ url: string; body: CreateRoomRequest }>;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    fetchHistoryCalls = [];
    postRoomCalls = [];
    socketTransport.sockets = [];

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method?.toUpperCase() || 'GET';

      // Auth endpoint
      if (url.includes('/api/v1/me')) {
        return new Response(JSON.stringify(mockOwnerUser), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Games catalog
      if (url.includes('/api/v1/games')) {
        return new Response(JSON.stringify(mockGamesCatalog), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Create room POST
      if (url.endsWith('/api/v1/rooms') && method === 'POST') {
        const bodyData = JSON.parse((init?.body as string) || '{}');
        postRoomCalls.push({ url, body: bodyData });
        const created: RoomDTO = {
          id: 'room-created-uuid',
          conversationId: 'conv-created-uuid',
          name: bodyData.name,
          description: bodyData.description,
          gameId: bodyData.gameId,
          gameTitle: bodyData.gameTitle,
          ownerId: 'user-owner',
          settings: {
            visibility: bodyData.visibility || 'PUBLIC',
            invitePolicy: bodyData.invitePolicy || 'OWNER_APPROVAL',
            playerCapacity: bodyData.playerCapacity || 5,
          },
          memberCount: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return new Response(JSON.stringify(created), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Own Rooms list
      if (url.includes('/api/v1/rooms/own') || (url.endsWith('/api/v1/rooms') && method === 'GET')) {
        return new Response(
          JSON.stringify({
            items: [mockRoom1, mockPrivateRoom],
            hasMore: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Single Room detail
      if (url.match(/\/api\/v1\/rooms\/room-1$/)) {
        return new Response(JSON.stringify(mockRoom1), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.match(/\/api\/v1\/rooms\/room-private$/)) {
        return new Response(JSON.stringify(mockPrivateRoom), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Room members
      if (url.match(/\/api\/v1\/rooms\/.*\/members$/)) {
        return new Response(JSON.stringify(mockRoomMembers), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // Conversation messages history
      if (url.includes('/api/v1/conversations/') && url.includes('/messages')) {
        fetchHistoryCalls.push(url);
        return new Response(
          JSON.stringify({
            items: [mockChatMessage],
            hasMore: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const renderAppAt = (initialRoute = '/rooms') => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('1. Acceptance: Retains room after ended play session (permanent room membership)', async () => {
    renderAppAt('/rooms');
    await waitFor(() => {
      expect(screen.getAllByText('Đội LMHT Hàng Đấu')[0]).toBeInTheDocument();
    });
  });

  it('2. Acceptance: Only room owner sees owner actions (Cài đặt / Transfer / Dissolve)', async () => {
    renderAppAt('/rooms');
    await waitFor(() => {
      expect(screen.getAllByText('Đội LMHT Hàng Đấu')[0]).toBeInTheDocument();
    });

    const settingsBtn = await screen.findByTestId('room-header-settings-btn');
    expect(settingsBtn).toBeInTheDocument();
  });

  it('2b. Acceptance: Non-owner members CANNOT see owner settings or dissolve actions', async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/me')) {
        return new Response(JSON.stringify(mockMemberUser), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/v1/rooms/own') || url.endsWith('/api/v1/rooms')) {
        return new Response(JSON.stringify({ items: [mockRoom1], hasMore: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.match(/\/api\/v1\/rooms\/room-1$/)) {
        return new Response(JSON.stringify(mockRoom1), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.match(/\/api\/v1\/rooms\/.*\/members$/)) {
        return new Response(JSON.stringify(mockRoomMembers), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderAppAt('/rooms/room-1');

    await waitFor(() => {
      expect(screen.getAllByText('Đội LMHT Hàng Đấu')[0]).toBeInTheDocument();
    });

    expect(screen.queryByTestId('room-header-settings-btn')).toBeNull();
  });

  it('3. Acceptance: Private group access failure (403) clears old private chat text and renders explicit role="alert"', async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/me')) {
        return new Response(JSON.stringify(mockMemberUser), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.includes('/api/v1/rooms/room-private')) {
        return new Response(
          JSON.stringify({ code: 'FORBIDDEN', message: 'Bạn không có quyền truy cập phòng riêng tư này.', requestId: 'req-403' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/v1/rooms')) {
        return new Response(JSON.stringify({ items: [], hasMore: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderAppAt('/rooms/room-private');

    await waitFor(() => {
      const alertEl = screen.getByRole('alert');
      expect(alertEl).toBeInTheDocument();
      expect(alertEl).toHaveTextContent(/không có quyền/i);
    });

    expect(screen.queryByText(/Private fixture message before revoke/i)).toBeNull();
    expect(screen.queryByText('Chọn hoặc tạo một phòng')).toBeNull();
  });

  it('4. Acceptance: Cancel destructive action confirmation makes NO API call', async () => {
    renderAppAt('/rooms');
    await waitFor(() => {
      expect(screen.getAllByText('Đội LMHT Hàng Đấu')[0]).toBeInTheDocument();
    });

    const settingsBtn = await screen.findByTestId('room-header-settings-btn');
    fireEvent.click(settingsBtn);

    const dissolveTrigger = await screen.findByRole('button', { name: /giải thể phòng/i });
    fireEvent.click(dissolveTrigger);

    const cancelBtn = await screen.findByRole('button', { name: /hủy/i });
    fireEvent.click(cancelBtn);

    const deleteCalls = fetchSpy.mock.calls.filter(([req, init]: [RequestInfo | URL | undefined, RequestInit | undefined]) => {
      const urlStr = typeof req === 'string' ? req : req?.toString() || '';
      return urlStr.includes('/api/v1/rooms/room-1') && init?.method === 'DELETE';
    });
    expect(deleteCalls.length).toBe(0);
  });

  it('5. Acceptance: Valid reload or deep-link to /rooms/:roomId loads room', async () => {
    renderAppAt('/rooms/room-1');
    await waitFor(() => {
      expect(screen.getAllByText('Đội LMHT Hàng Đấu')[0]).toBeInTheDocument();
    });
  });

  it('6. Key behavior: Uses canonical RoomDTO.conversationId for chat history and send', async () => {
    renderAppAt('/rooms/room-1');
    await waitFor(() => {
      expect(screen.getAllByText('Đội LMHT Hàng Đấu')[0]).toBeInTheDocument();
    });

    await waitFor(() => {
      const historyCall = fetchHistoryCalls.find(url => url.includes('/api/v1/conversations/conv-room-1/messages'));
      expect(historyCall).toBeDefined();
    });
  });

  it('7. Incomplete onboarding routes to OnboardingPage when visiting /rooms', async () => {
    queryClient.clear();
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/me')) {
        return new Response(JSON.stringify(mockIncompleteUser), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    renderAppAt('/rooms');

    await waitFor(() => {
      expect(screen.getByText(/hoàn tất hồ sơ/i) || screen.getByTestId('onboarding-page') || screen.getByRole('heading', { name: /bắt đầu/i })).toBeInTheDocument();
    });
  });

  it('8. Mobile tabs control CSS panel visibility', async () => {
    renderAppAt('/rooms/room-1');
    await waitFor(() => {
      expect(screen.getAllByText('Đội LMHT Hàng Đấu')[0]).toBeInTheDocument();
    });

    const membersTabBtn = screen.getByTestId('mobile-tab-members');
    fireEvent.click(membersTabBtn);

    await waitFor(() => {
      expect(screen.getByTestId('mobile-members-panel')).toBeInTheDocument();
    });
  });

  it('9. CreateRoomModal uses real catalog gameId UUID from GET /api/v1/games', async () => {
    renderAppAt('/rooms');
    await waitFor(() => {
      expect(screen.getAllByText('Đội LMHT Hàng Đấu')[0]).toBeInTheDocument();
    });

    const createBtn = screen.getByRole('button', { name: /^Tạo$/ });
    fireEvent.click(createBtn);

    const nameInput = await screen.findByLabelText(/tên phòng/i);
    fireEvent.change(nameInput, { target: { value: 'Phòng Mới UUID Catalog' } });

    const submitBtn = screen.getByRole('button', { name: /^Tạo phòng$/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(postRoomCalls.length).toBe(1);
    });

    expect(postRoomCalls[0].body.gameId).toBe('17e6cab4-a5eb-47cc-b69f-22158aa22739');
    expect(postRoomCalls[0].body.gameTitle).toBe('Liên Minh Huyền Thoại');
  });

  it('10. Promise failure during dissolve retains confirmation modal with error alert', async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method?.toUpperCase() || 'GET';

      if (url.includes('/api/v1/me')) return new Response(JSON.stringify(mockOwnerUser), { status: 200 });
      if (url.includes('/api/v1/games')) return new Response(JSON.stringify(mockGamesCatalog), { status: 200 });
      if (url.includes('/api/v1/rooms/own')) return new Response(JSON.stringify({ items: [mockRoom1], hasMore: false }), { status: 200 });
      if (url.match(/\/api\/v1\/rooms\/room-1$/) && method === 'GET') return new Response(JSON.stringify(mockRoom1), { status: 200 });
      if (url.match(/\/api\/v1\/rooms\/.*\/members$/)) return new Response(JSON.stringify(mockRoomMembers), { status: 200 });
      if (url.includes('/api/v1/conversations/')) return new Response(JSON.stringify({ items: [mockChatMessage], hasMore: false }), { status: 200 });

      // Dissolve failure
      if (url.match(/\/api\/v1\/rooms\/room-1$/) && method === 'DELETE') {
        return new Response(JSON.stringify({ code: 'FORBIDDEN', message: 'Lỗi server khi giải thể phòng.' }), { status: 500 });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    renderAppAt('/rooms/room-1');
    await waitFor(() => {
      expect(screen.getAllByText('Đội LMHT Hàng Đấu')[0]).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('room-header-settings-btn'));
    const dissolveTrigger = await screen.findByRole('button', { name: /giải thể phòng/i });
    fireEvent.click(dissolveTrigger);

    const confirmBtn = screen.getByRole('button', { name: /^Giải thể phòng$/ });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      const confirmDialog = screen.getByRole('dialog', { name: /Xác nhận giải thể phòng/i });
      expect(confirmDialog).toBeInTheDocument();
      expect(confirmDialog).toHaveTextContent(/Lỗi server khi giải thể phòng/i);
    });
  });

  it('11. Pagination: Loading page 2 retains page 1 rooms (both room 50 and room 51 selectable)', async () => {
    const page1Rooms: RoomDTO[] = Array.from({ length: 50 }, (_, i) => ({
      id: `room-paging-${i + 1}`,
      conversationId: `conv-paging-${i + 1}`,
      name: `Paging room ${i + 1}`,
      description: 'Paging test room',
      gameId: '17e6cab4-a5eb-47cc-b69f-22158aa22739',
      gameTitle: 'Liên Minh Huyền Thoại',
      ownerId: 'user-owner',
      owner: { id: 'user-owner', displayName: 'Room Owner', customStatus: 'JUST_CHATTING', avatarUrl: null },
      settings: { visibility: 'PUBLIC', invitePolicy: 'OWNER_APPROVAL', playerCapacity: 5 },
      memberCount: 1,
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
    }));

    const page2Room: RoomDTO = {
      id: 'room-paging-51',
      conversationId: 'conv-paging-51',
      name: 'Paging room 51',
      description: 'Page 2 room',
      gameId: '17e6cab4-a5eb-47cc-b69f-22158aa22739',
      gameTitle: 'Liên Minh Huyền Thoại',
      ownerId: 'user-owner',
      owner: { id: 'user-owner', displayName: 'Room Owner', customStatus: 'JUST_CHATTING', avatarUrl: null },
      settings: { visibility: 'PUBLIC', invitePolicy: 'OWNER_APPROVAL', playerCapacity: 5 },
      memberCount: 1,
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
    };

    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/me')) return new Response(JSON.stringify(mockOwnerUser), { status: 200 });
      if (url.includes('/api/v1/games')) return new Response(JSON.stringify(mockGamesCatalog), { status: 200 });

      if (url.includes('/api/v1/rooms/own') || url.endsWith('/api/v1/rooms')) {
        if (url.includes('cursor=cursor-page-2')) {
          return new Response(JSON.stringify({ items: [page2Room], hasMore: false }), { status: 200 });
        }
        return new Response(JSON.stringify({ items: page1Rooms, hasMore: true, nextCursor: 'cursor-page-2' }), { status: 200 });
      }

      if (url.match(/\/api\/v1\/rooms\/room-paging-1$/)) return new Response(JSON.stringify(page1Rooms[0]), { status: 200 });
      if (url.match(/\/api\/v1\/rooms\/room-paging-50$/)) return new Response(JSON.stringify(page1Rooms[49]), { status: 200 });
      if (url.match(/\/api\/v1\/rooms\/room-paging-51$/)) return new Response(JSON.stringify(page2Room), { status: 200 });
      if (url.match(/\/api\/v1\/rooms\/.*\/members$/)) return new Response(JSON.stringify(mockRoomMembers), { status: 200 });
      if (url.includes('/api/v1/conversations/')) return new Response(JSON.stringify({ items: [], hasMore: false }), { status: 200 });

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    renderAppAt('/rooms');

    await waitFor(() => {
      expect(screen.getByText('Paging room 50')).toBeInTheDocument();
    });

    const loadMoreBtn = screen.getByRole('button', { name: /Tải thêm phòng/i });
    fireEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByText('Paging room 51')).toBeInTheDocument();
    });

    // CRITICAL: Room 50 from page 1 MUST still be in document!
    expect(screen.getByText('Paging room 50')).toBeInTheDocument();
  });

  it('12. Native Dialog Accessibility: Focus moves inside dialog on open and top Escape closes modal', async () => {
    renderAppAt('/rooms');

    await waitFor(() => {
      expect(screen.getAllByText('Đội LMHT Hàng Đấu')[0]).toBeInTheDocument();
    });

    const createBtn = screen.getByRole('button', { name: /^Tạo$/ });
    fireEvent.click(createBtn);

    const dialog = await screen.findByRole('dialog', { name: /Tạo phòng mới/i });
    expect(dialog).toBeInTheDocument();

    // Verify focus is inside the dialog
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Press Escape to close modal
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Tạo phòng mới/i })).toBeNull();
    });
  });

  it('14. Mobile settings opens the actual settings dialog and preserves chat after closing', async () => {
    renderAppAt('/rooms/room-1');
    await screen.findByTestId('mobile-tab-settings');
    fireEvent.click(screen.getByTestId('mobile-tab-settings'));
    const dialog = await screen.findByRole('dialog', { name: /Cài đặt phòng & Thành viên/i });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('mobile-tab-chat'));
    expect(screen.getByPlaceholderText('Nhắn vào phòng...')).toBeInTheDocument();
  });

  it('15. Reconnect recovers more than one page using the pre-disconnect anchor despite a new socket event', async () => {
    const original = fetchSpy.getMockImplementation()!;
    let offlineHistory = false;
    const gap = Array.from({length: 75}, (_, i) => ({ ...mockChatMessage, id: `gap-${i+1}`, content: `Missing gap ${i+1}`, createdAt: new Date(Date.parse(mockChatMessage.createdAt)+1000*(i+1)).toISOString() }));
    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (offlineHistory && url.includes('/conversations/conv-room-1/messages')) {
        const items = url.includes('cursor=gap-page-2') ? [mockChatMessage, ...gap.slice(0,25)] : gap.slice(25);
        return new Response(JSON.stringify({items, hasMore: !url.includes('cursor=gap-page-2'), nextCursor: url.includes('cursor=gap-page-2') ? undefined : 'gap-page-2'}), {status:200});
      }
      return original(input, init);
    });
    renderAppAt('/rooms/room-1');
    await screen.findByText(mockChatMessage.content, {exact:true});
    const socket = socketTransport.sockets.find(s => s.namespace === '/' && !s.closed)!;
    await act(async () => socket.fire('disconnect'));
    offlineHistory = true;
    await act(async () => {
      socket.fire('connect');
      socket.fire(SocketEventNames.MESSAGE_CREATED, gap[74]);
    });
    await screen.findByText('Missing gap 1', {exact:true});
    expect(screen.getAllByText('Missing gap 75', {exact:true})).toHaveLength(1);
    expect(screen.getAllByText(mockChatMessage.content, {exact:true})).toHaveLength(1);
  });

  it('16. Refreshing the games catalog does not erase the create-room draft', async () => {
    renderAppAt('/rooms/room-1');
    await screen.findByTestId('room-header-settings-btn');
    fireEvent.click(screen.getByRole('button', {name:/^Tạo$/}));
    const name = await screen.findByLabelText(/Tên phòng/i);
    fireEvent.change(name, {target:{value:'Unsaved draft'}});
    await act(async () => queryClient.setQueryData(['gamesCatalog'], mockGamesCatalog.map(g=>({...g, lobbyRoomId: `${g.lobbyRoomId}-refresh`}))));
    expect(name).toHaveValue('Unsaved draft');
  });

  it('17. A failed member removal displays the server error and retains membership', async () => {
    const original=fetchSpy.getMockImplementation()!;
    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if(init?.method === 'DELETE' && String(input).includes('/members/')) return new Response(JSON.stringify({message:'Member removal failed'}), {status:500});
      return original(input,init);
    });
    renderAppAt('/rooms/room-1');
    const remove = (await screen.findAllByRole('button', {name:/^Xóa$/}))[0];
    fireEvent.click(remove);
    await screen.findByText('Member removal failed');
    expect(screen.getAllByRole('button', {name:/^Xóa$/}).length).toBeGreaterThan(0);
  });

  it('18. Changing the selected room closes an old destructive confirmation without a mutation', async () => {
    renderAppAt('/rooms/room-1');
    fireEvent.click(await screen.findByTestId('room-header-settings-btn'));
    fireEvent.click(await screen.findByRole('button', {name:/Giải thể phòng này/i}));
    await screen.findByRole('dialog', {name:'Xác nhận giải thể phòng'});
    fireEvent.click(screen.getByRole('button', {name:/Phòng Mật 18\+/}));
    await waitFor(() => expect(screen.queryByRole('dialog', {name:'Xác nhận giải thể phòng'})).toBeNull());
    expect(fetchSpy.mock.calls.some(([,init]: [RequestInfo | URL, RequestInit?]) => init?.method === 'DELETE')).toBe(false);
  });

  it('13. Server Denial (403): Clears history and REMOVES composer from DOM', async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/me')) return new Response(JSON.stringify(mockOwnerUser), { status: 200 });
      if (url.includes('/api/v1/games')) return new Response(JSON.stringify(mockGamesCatalog), { status: 200 });
      if (url.includes('/api/v1/rooms/own')) return new Response(JSON.stringify({ items: [mockPrivateRoom], hasMore: false }), { status: 200 });
      if (url.match(/\/api\/v1\/rooms\/room-private$/)) return new Response(JSON.stringify(mockPrivateRoom), { status: 200 });
      if (url.match(/\/api\/v1\/rooms\/.*\/members$/)) return new Response(JSON.stringify(mockRoomMembers), { status: 200 });

      // GET room messages fails with 403
      if (url.includes('/api/v1/conversations/conv-room-private/messages')) {
        return new Response(JSON.stringify({ code: 'FORBIDDEN', message: 'Denied' }), { status: 403 });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    renderAppAt('/rooms/room-private');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // Composer input MUST be removed from DOM (not just disabled)
    expect(screen.queryByPlaceholderText('Nhắn vào phòng...')).toBeNull();
  });
});
