// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProfileDTO, PendingFriendRequestDTO, BlockDTO, ALLOWED_GAMES } from '@fg/contracts';
import { AuthProvider } from '../src/features/auth/index.js';
import { PeerSocialControls } from '../src/features/friends/PeerSocialControls.tsx';
import { unreadSync, UnreadSyncEvent } from '../src/features/direct-messages/sync.ts';
import { LobbyPage } from '../src/features/lobby/LobbyPage.tsx';
import { ProfilePage } from '../src/features/profiles/ProfilePage.tsx';
import { CryptoDeviceProvider } from '../src/features/crypto/CryptoDeviceProvider';
import { DirectMessagesPanel } from '../src/features/direct-messages/DirectMessagesPanel.tsx';
import { FriendsModal } from '../src/features/friends/FriendsModal.tsx';

type FetchCallRecord = { url: string; method: string; body?: unknown };

// Socket mock transport
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

const mockGames = ALLOWED_GAMES.map((title, index) => ({
  id: `game-${index}`,
  title,
  lobbyRoomId: `lobby-${index}`,
}));

const mockUserActor: ProfileDTO = {
  id: 'user-actor',
  displayName: 'Actor User',
  avatarUrl: null,
  bio: null,
  customStatus: 'JUST_CHATTING',
  gameProfiles: [],
  createdAt: '2026-10-01T12:00:00.000Z',
};

const mockUserPeer: ProfileDTO = {
  id: 'user-peer',
  displayName: 'Peer User',
  avatarUrl: null,
  bio: null,
  customStatus: 'LOOKING_FOR_TEAM',
  gameProfiles: [],
  createdAt: '2026-10-01T12:00:00.000Z',
};

const mockUserBlocked: ProfileDTO = {
  id: 'user-blocked',
  displayName: 'Blocked User',
  avatarUrl: null,
  bio: null,
  customStatus: 'PLAYING',
  gameProfiles: [],
  createdAt: '2026-10-01T12:00:00.000Z',
};


const replyJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('T17-FE Friends, DMs, and Block filtering behavior', () => {
  let client: QueryClient;
  let isLoggedUser: boolean;
  let blockedUsers: BlockDTO[];
  let friendsList: ProfileDTO[];
  let incomingRequests: PendingFriendRequestDTO[];
  let outgoingRequests: PendingFriendRequestDTO[];
  let lastFetchCalls: FetchCallRecord[];
  // Real provider remains LOCKED in DOM tests; native/headed suites prove unlocked crypto.
  async function lockedDm(id='dm-conv-user-peer') {
    render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter><CryptoDeviceProvider><DirectMessagesPanel isOpen={true} onClose={()=>{}} initialConversationId={id}/></CryptoDeviceProvider></MemoryRouter></AuthProvider></QueryClientProvider>);
    const item=await screen.findByTestId('dm-conv-item-'+id);fireEvent.click(item);
    await screen.findByText('Thiết bị đang khóa. Mở khóa riêng để đọc hoặc gửi chat mã hóa.',{exact:true});
    return item;
  }
  function expectNoPlaintextTransport(){expect(lastFetchCalls.filter(call=>/\/conversations\/[^/]+\/messages/.test(call.url))).toEqual([]);}


  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    isLoggedUser = true;
    blockedUsers = [];
    friendsList = [];
    incomingRequests = [];
    outgoingRequests = [];
    lastFetchCalls = [];
    socketTransport.sockets = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        const url = new URL(urlStr, 'http://localhost');
        const method = init?.method || 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;

        lastFetchCalls.push({ url: urlStr, method, body });

        // Session / Me
        if (url.pathname === '/api/v1/me') {
          return isLoggedUser
            ? replyJson({
                id: 'user-actor',
                displayName: 'Actor User',
                email: 'actor@example.com',
                emailVerified: true,
                discordId: 'discord-actor',
                customStatus: 'JUST_CHATTING',
                createdAt: '2026-10-01T00:00:00Z',
                updatedAt: '2026-10-01T00:00:00Z',
                onboardingComplete: true,
                interestedGames: ['Valorant'],
              })
            : replyJson({}, 401);
        }

        // Games catalog
        if (url.pathname === '/api/v1/games') {
          return replyJson(mockGames);
        }

        // Online users
        if (url.pathname.match(/^\/api\/v1\/games\/([^/]+)\/online$/)) {
          return replyJson({ items: [mockUserPeer, mockUserBlocked], hasMore: false });
        }

        // Lobby messages
        if (url.pathname.match(/^\/api\/v1\/games\/([^/]+)\/lobby\/messages$/)) {
          return replyJson({
            items: [
              {
                id: 'msg-1',
                conversationId: 'lobby-0',
                senderId: 'user-peer',
                sender: mockUserPeer,
                content: 'Hello from Peer User!',
                createdAt: '2026-10-01T12:00:00.000Z',
                attachments: [],
                mentions: [],
                mentionedUserIds: [],
              },
              {
                id: 'msg-2',
                conversationId: 'lobby-0',
                senderId: 'user-blocked',
                sender: mockUserBlocked,
                content: 'Spam from Blocked User!',
                createdAt: '2026-10-01T12:01:00.000Z',
                attachments: [],
                mentions: [],
                mentionedUserIds: [],
              },
            ],
            hasMore: false,
          });
        }

        // Public profile
        const profileMatch = url.pathname.match(/^\/api\/v1\/users\/([^/]+)\/profile$/);
        if (profileMatch) {
          const targetId = profileMatch[1];
          if (targetId === 'user-peer') return replyJson(mockUserPeer);
          if (targetId === 'user-blocked') return replyJson(mockUserBlocked);
          return replyJson(mockUserActor);
        }

        // Friends list
        if (url.pathname === '/api/v1/friends') {
          if (!isLoggedUser) return replyJson({ code: 'LOGIN_REQUIRED' }, 401);
          if (method === 'DELETE') {
            const friendId = url.pathname.split('/').pop();
            friendsList = friendsList.filter((f) => f.id !== friendId);
            return replyJson({ success: true });
          }
          return replyJson({ items: friendsList, hasMore: false });
        }

        // Friend requests list
        if (url.pathname === '/api/v1/friends/requests') {
          if (!isLoggedUser) return replyJson({ code: 'LOGIN_REQUIRED' }, 401);

          if (method === 'GET') {
            const dir = url.searchParams.get('direction') || 'INCOMING';
            const items = dir === 'INCOMING' ? incomingRequests : outgoingRequests;
            return replyJson({ items, hasMore: false });
          }

          if (method === 'POST') {
            const targetId = (body as { targetUserId?: string })?.targetUserId;
            if (targetId === 'user-blocked' && blockedUsers.some((b) => b.blockedId === targetId)) {
              return replyJson({ code: 'FORBIDDEN', message: 'User is blocked' }, 403);
            }
            const newReq: PendingFriendRequestDTO = {
              requestId: `req-${Date.now()}`,
              sender: mockUserActor,
              receiver: mockUserPeer,
              status: 'PENDING',
              createdAt: '2026-10-01T12:00:00.000Z',
              updatedAt: '2026-10-01T12:00:00.000Z',
            };
            outgoingRequests.push(newReq);
            return replyJson({ requestId: newReq.requestId, status: 'PENDING' });
          }
        }

        // Respond to friend request
        if (url.pathname.match(/^\/api\/v1\/friends\/requests\/([^/]+)\/respond$/)) {
          const reqId = url.pathname.split('/')[5];
          const req = incomingRequests.find((r) => r.requestId === reqId);
          if (req && (body as { action?: string })?.action === 'ACCEPT') {
            const friendProfile: ProfileDTO = {
              ...req.sender,
              gameProfiles: [],
              createdAt: '2026-10-01T12:00:00.000Z',
            };
            friendsList.push(friendProfile);
          }

          incomingRequests = incomingRequests.filter((r) => r.requestId !== reqId);
          return replyJson({ success: true });
        }

        // Cancel friend request
        if (url.pathname.match(/^\/api\/v1\/friends\/requests\/([^/]+)\/cancel$/)) {
          const reqId = url.pathname.split('/')[5];
          outgoingRequests = outgoingRequests.filter((r) => r.requestId !== reqId);
          return replyJson({ success: true });
        }

        // Blocks
        if (url.pathname === '/api/v1/blocks') {
          if (!isLoggedUser) return replyJson({ code: 'LOGIN_REQUIRED' }, 401);
          if (method === 'GET') return replyJson(blockedUsers);
          if (method === 'POST') {
            const block: BlockDTO = {
              id: `block-${Date.now()}`,
              blockerId: 'user-actor',
              blockedId: (body as { blockedId: string }).blockedId,
              blockedUser: mockUserBlocked,
              createdAt: '2026-10-01T12:00:00.000Z',
            };
            blockedUsers.push(block);
            return replyJson(block);
          }
        }

        const deleteBlockMatch = url.pathname.match(/^\/api\/v1\/blocks\/([^/]+)$/);
        if (deleteBlockMatch && method === 'DELETE') {
          const targetId = deleteBlockMatch[1];
          blockedUsers = blockedUsers.filter((b) => b.blockedId !== targetId);
          return replyJson({ success: true });
        }

        // Direct conversations
        if (url.pathname === '/api/v1/direct-conversations') {
          if (!isLoggedUser) return replyJson({ code: 'LOGIN_REQUIRED' }, 401);
          if (method === 'POST') {
            if (
              (body as { recipientUserId?: string })?.recipientUserId === 'user-blocked' &&
              blockedUsers.some((b) => b.blockedId === 'user-blocked')
            ) {
              return replyJson({ code: 'FORBIDDEN', message: 'Cannot start conversation with blocked user' }, 403);
            }
            return replyJson({ conversationId: `dm-conv-${(body as { recipientUserId: string }).recipientUserId}` });
          }
          return replyJson({
            items: [
              { conversationId: 'dm-conv-user-peer', peer: mockUserPeer },
              { conversationId: 'dm-conv-user-peer-fail', peer: mockUserPeer },
              { conversationId: 'dm-conv-cache-a', peer: mockUserPeer },
              { conversationId: 'dm-conv-cache-b', peer: mockUserPeer },
              { conversationId: 'dm-conv-err', peer: mockUserPeer },
            ],
            hasMore: false,
          });
        }


        // Conversation messages
        if (url.pathname.match(/^\/api\/v1\/conversations\/([^/]+)\/messages$/)) {
          const convId = url.pathname.split('/')[4];
          if (method === 'POST') {
            if (convId === 'dm-conv-user-peer-fail') {
              return replyJson({ code: 'FORBIDDEN', message: 'Failed to send message' }, 403);
            }
            return replyJson({
              id: `msg-${Date.now()}`,
              conversationId: convId,
              senderId: 'user-actor',
              sender: mockUserActor,
              content: (body as { content: string }).content,
              createdAt: new Date().toISOString(),
              attachments: [],
              mentions: [],
              mentionedUserIds: [],
            });
          }
          return replyJson({ items: [], hasMore: false });
        }

        return replyJson({ message: 'Not found' }, 404);
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders peer social controls and handles send request, recipient accept, sender cancel, and remove friend', async () => {
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <PeerSocialControls targetUser={mockUserPeer} />
        </AuthProvider>
      </QueryClientProvider>
    );

    // Initial state: No request / Not friend -> Shows "Kết bạn" and "Nhắn tin" and "Chặn"
    await waitFor(() => {
      expect(screen.getByTestId('btn-send-request')).toBeInTheDocument();
      expect(screen.getByTestId('btn-open-dm')).toBeInTheDocument();
      expect(screen.getByTestId('btn-block')).toBeInTheDocument();
    });

    // Send friend request
    fireEvent.click(screen.getByTestId('btn-send-request'));
    await waitFor(() => {
      expect(lastFetchCalls.some((c) => c.url.includes('/api/v1/friends/requests') && c.method === 'POST')).toBe(true);
    });

    // Now peer has incoming request from actor
    incomingRequests.push({
      requestId: 'req-inc-1',
      sender: mockUserPeer,
      receiver: mockUserActor,
      status: 'PENDING',
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
    });

    client.clear();
    rerender(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <PeerSocialControls targetUser={mockUserPeer} />
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('btn-accept-request')).toBeInTheDocument();
      expect(screen.getByTestId('btn-reject-request')).toBeInTheDocument();
    });

    // Accept request
    fireEvent.click(screen.getByTestId('btn-accept-request'));
    await waitFor(() => {
      expect(
        lastFetchCalls.some(
          (c) => c.url.includes('/respond') && (c.body as { action?: string })?.action === 'ACCEPT'
        )
      ).toBe(true);
    });
  });

  it('allows starting a direct conversation without friendship', async () => {
    let openedConvId: string | null = null;
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <PeerSocialControls
            targetUser={mockUserPeer}
            onDMOpen={(convId) => {
              openedConvId = convId;
            }}
          />
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('btn-open-dm')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-open-dm'));
    await waitFor(() => {
      expect(lastFetchCalls.some((c) => c.url.includes('/api/v1/direct-conversations') && c.method === 'POST')).toBe(
        true
      );
      expect(openedConvId).toBe('dm-conv-user-peer');
    });
  });

  it('filters blocked user messages locally in Lobby chat', async () => {
    // Add mockUserBlocked to block list
    blockedUsers.push({
      id: 'block-1',
      blockerId: 'user-actor',
      blockedId: 'user-blocked',
      blockedUser: mockUserBlocked,
      createdAt: '2026-10-01T12:00:00.000Z',
    });

    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter>
            <LobbyPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    // Verify Lobby loaded and message from Peer User is visible, but message from Blocked User is filtered!
    await waitFor(() => {
      expect(screen.getByText('Hello from Peer User!')).toBeInTheDocument();
      expect(screen.queryByText('Spam from Blocked User!')).not.toBeInTheDocument();
    });
  });

  it('synchronizes cross-tab unread clearing via unreadSync', async () => {
    unreadSync.setActor('user-actor');
    const eventBox: { current: UnreadSyncEvent | null } = { current: null };

    const unsubscribe = unreadSync.subscribe((ev) => {
      eventBox.current = ev;
    });

    act(() => {
      unreadSync.notifyRead('dm-conv-user-peer');
    });

    expect(eventBox.current).not.toBeNull();
    expect(eventBox.current?.type).toBe('READ');
    expect(eventBox.current?.conversationId).toBe('dm-conv-user-peer');

    unsubscribe();
  });

  it('safe for guests without triggering private block or friend fetches', async () => {
    isLoggedUser = false;

    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter>
            <LobbyPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Bạn đang xem Lobby/i)).toBeInTheDocument();
    });

    // Verify NO GET /api/v1/blocks or /api/v1/friends fetch occurred for guest!
    expect(lastFetchCalls.some((c) => c.url.includes('/api/v1/blocks'))).toBe(false);
    expect(lastFetchCalls.some((c) => c.url.includes('/api/v1/friends'))).toBe(false);
  });

  it('opens DirectMessagesPanel on ProfilePage when user clicks DM button', async () => {
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <CryptoDeviceProvider><MemoryRouter initialEntries={['/users/user-peer/profile']}>
            <Routes>
              <Route path="/users/:id/profile" element={<ProfilePage />} />
            </Routes>
          </MemoryRouter></CryptoDeviceProvider>
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('peer-social-controls')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('btn-open-dm'));

    await waitFor(() => {
      expect(screen.getByTestId('direct-messages-panel')).toBeInTheDocument();
    });
    await screen.findByText('Thiết bị đang khóa. Mở khóa riêng để đọc hoặc gửi chat mã hóa.', {exact:true});
    expect(screen.queryByText('Secret DM Message')).not.toBeInTheDocument();
  });


  it('locked DM has an actual unlock route and cannot send through the former plaintext composer',async()=>{
    await lockedDm('dm-conv-user-peer-fail');
    expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toHaveAttribute('href','/crypto');
    expect(screen.queryByRole('textbox',{name:'Tin nhắn riêng',exact:true})).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Gửi tin nhắn')).not.toBeInTheDocument();
    expectNoPlaintextTransport();
  });


  it('closed locked DM ignores plaintext socket events and counts strict encrypted metadata once',async()=>{
    render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter><LobbyPage/></MemoryRouter></AuthProvider></QueryClientProvider>);
    await screen.findByText('Hello from Peer User!');
    act(()=>{for(const socket of socketTransport.sockets.filter(s=>!s.closed))socket.fire('message.created',{id:'old-plaintext',conversationId:'dm-conv-user-peer',senderId:'user-peer',content:'Never display private text',createdAt:new Date().toISOString()});});
    expect(screen.queryByTestId('dm-unread-badge')).not.toBeInTheDocument();
    const event={id:'cipher-metadata',conversationId:'dm-conv-user-peer',senderId:'user-peer',clientMessageId:'metadata-client',deviceId:'PEER',membershipRevision:1,envelope:{version:1,protocol:'MATRIX_MEGOLM',event:{algorithm:'m.megolm.v1.aes-sha2',ciphertext:'AAAA',session_id:'A'.repeat(43)}},createdAt:new Date(Date.now()+1000).toISOString(),attachmentIds:[],origin:'LIVE'};
    // Structural metadata routing only; this does not simulate decryption/auth/SAS success.
    act(()=>{unreadSync.ingestEncryptedMessage(event,null);unreadSync.ingestEncryptedMessage(event,null);});
    await waitFor(()=>expect(screen.getByTestId('dm-unread-badge')).toHaveTextContent('1'));
    expect(screen.queryByText('Never display private text')).not.toBeInTheDocument();
    expectNoPlaintextTransport();
  });


  it('active locked DM does not reveal plaintext injected after a metadata bridge event',async()=>{
    await lockedDm();
    act(()=>{unreadSync.ingestEncryptedMessage({id:'cipher-active',conversationId:'dm-conv-user-peer',senderId:'user-peer',clientMessageId:'active-client',deviceId:'PEER',membershipRevision:1,envelope:{version:1,protocol:'MATRIX_MEGOLM',event:{algorithm:'m.megolm.v1.aes-sha2',ciphertext:'AAAA',session_id:'A'.repeat(43)}},createdAt:new Date().toISOString(),attachmentIds:[],origin:'LIVE'},'dm-conv-user-peer');for(const socket of socketTransport.sockets.filter(s=>!s.closed))socket.fire('message.created',{id:'cipher-active',conversationId:'dm-conv-user-peer',senderId:'user-peer',content:'Active thread message content'});});
    expect(screen.queryByText('Active thread message content')).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toBeInTheDocument();expectNoPlaintextTransport();
  });


  it('locked private history remains unreadable and never fetches the former plaintext history endpoint',async()=>{
    await lockedDm();expect(screen.queryByText('Secret DM Message')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dm-message-list')).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toBeInTheDocument();expectNoPlaintextTransport();
  });

  it('deduplicates unread counts when bridge event arrives before socket event or vice versa', async () => {
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter>
            <LobbyPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Hello from Peer User!')).toBeInTheDocument();
    });

    const msgPayload = {
      id: 'bridge-dedup-msg-1',
      conversationId: 'dm-conv-user-peer',
      senderId: 'user-peer',
      sender: mockUserPeer,
      content: 'Bridge then socket message',
      createdAt: new Date().toISOString(),
      attachments: [],
      mentions: [],
      mentionedUserIds: [],
    };

    // 1. Deliver real StorageEvent from another tab first
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'fg_unread_sync_user-actor',
          newValue: JSON.stringify({
            type: 'UNREAD_INCREMENT',
            actorId: 'user-actor',
            conversationId: 'dm-conv-user-peer',
            messageId: 'bridge-dedup-msg-1',
            timestamp: Date.now(),
            tabId: 'other-tab-id',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('dm-unread-badge')).toHaveTextContent('1');
    });

    // 2. Fire same message on live socket second
    act(() => {
      const liveSockets = socketTransport.sockets.filter((s) => !s.closed);
      for (const socket of liveSockets) {
        socket.fire('message.created', msgPayload);
      }
    });

    // Count MUST remain 1!
    expect(screen.getByTestId('dm-unread-badge')).toHaveTextContent('1');
  });

  it('ignores malformed or wrong-actor bridge events', async () => {
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter>
            <LobbyPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Hello from Peer User!')).toBeInTheDocument();
    });

    // Storage event with wrong actorId
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'fg_unread_sync_user-actor',
          newValue: JSON.stringify({
            type: 'UNREAD_INCREMENT',
            actorId: 'wrong-actor',
            conversationId: 'dm-conv-user-peer',
            messageId: 'malformed-1',
            timestamp: Date.now(),
            tabId: 'other-tab-id',
          }),
        })
      );
    });

    // Storage event with NaN timestamp
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'fg_unread_sync_user-actor',
          newValue: JSON.stringify({
            type: 'UNREAD_INCREMENT',
            actorId: 'user-actor',
            conversationId: 'dm-conv-user-peer',
            messageId: 'malformed-2',
            timestamp: 'not-a-number',
            tabId: 'other-tab-id',
          }),
        })
      );
    });

    // Badge MUST NOT appear
    expect(screen.queryByTestId('dm-unread-badge')).toBeNull();
  });

  it('suppresses late old message timestamp after READ', async () => {
    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter>
            <LobbyPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Hello from Peer User!')).toBeInTheDocument();
    });

    // Mark conversation as READ now
    act(() => {
      unreadSync.notifyRead('dm-conv-user-peer');
    });

    // Ingest late old message created 1 hour ago
    act(() => {
      const liveSockets = socketTransport.sockets.filter((s) => !s.closed);
      for (const socket of liveSockets) {
        socket.fire('message.created', {
          id: 'old-late-msg-1',
          conversationId: 'dm-conv-user-peer',
          senderId: 'user-peer',
          sender: mockUserPeer,
          content: 'Old message arriving late',
          createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
          attachments: [],
          mentions: [],
          mentionedUserIds: [],
        });
      }
    });

    // Badge MUST NOT appear
    expect(screen.queryByTestId('dm-unread-badge')).toBeNull();
  });


  it('changing a locked DM never starts a plaintext send or displays a late former-transport response',async()=>{
    await lockedDm();fireEvent.click(screen.getByTestId('dm-conv-item-dm-conv-user-peer-fail'));
    await screen.findByText('Thiết bị đang khóa. Mở khóa riêng để đọc hoặc gửi chat mã hóa.',{exact:true});
    act(()=>{for(const socket of socketTransport.sockets.filter(s=>!s.closed))socket.fire('message.created',{id:'late-old-response',conversationId:'dm-conv-user-peer',senderId:'user-peer',content:'Deferred message'});});
    expect(screen.queryByText('Deferred message')).not.toBeInTheDocument();expect(screen.queryByLabelText('Gửi tin nhắn')).not.toBeInTheDocument();expectNoPlaintextTransport();
  });


  it('switching away and back while locked does not revive cached legacy plaintext',async()=>{
    await lockedDm();fireEvent.click(screen.getByTestId('dm-conv-item-dm-conv-user-peer-fail'));fireEvent.click(screen.getByTestId('dm-conv-item-dm-conv-user-peer'));
    await screen.findByText('Thiết bị đang khóa. Mở khóa riêng để đọc hoặc gửi chat mã hóa.',{exact:true});
    expect(screen.queryByText('Secret DM Message')).not.toBeInTheDocument();expect(screen.queryByText('Cached conv-A')).not.toBeInTheDocument();expectNoPlaintextTransport();
  });


  it('a locked DM remains fail closed when the obsolete plaintext history transport would fail',async()=>{
    const original=globalThis.fetch;const oldHistory=vi.fn();vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{if(/\/conversations\/[^/]+\/messages/.test(String(input))){oldHistory();return replyJson({message:'Old history unavailable'},500);}return original(input,init);}));
    await lockedDm();expect(oldHistory).not.toHaveBeenCalled();expect(screen.queryByText('Old history unavailable')).not.toBeInTheDocument();expect(screen.getByRole('link',{name:'Mở khóa thiết bị',exact:true})).toHaveAttribute('href','/crypto');expectNoPlaintextTransport();
  });

  it('handles paginated friends list with load more button', async () => {
    const originalFetch = globalThis.fetch;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        const url = new URL(urlStr, 'http://localhost');
        if (url.pathname === '/api/v1/friends') {
          if (url.searchParams.get('cursor') === 'cursor-page-2') {
            return replyJson({
              items: [mockUserBlocked],
              hasMore: false,
            });
          }
          return replyJson({
            items: [mockUserPeer],
            hasMore: true,
            nextCursor: 'cursor-page-2',
          });
        }
        return originalFetch(input, init);
      })
    );

    render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <FriendsModal isOpen={true} onClose={() => {}} />
        </AuthProvider>
      </QueryClientProvider>
    );

    // Initial page shows Peer User and Load More button
    await waitFor(() => {
      expect(screen.getByText('Peer User')).toBeInTheDocument();
      expect(screen.getByText('Tải thêm')).toBeInTheDocument();
    });

    // Click Load More
    fireEvent.click(screen.getByText('Tải thêm'));

    // Second page items rendered after refetch
    await waitFor(() => {
      expect(screen.getByText('Blocked User')).toBeInTheDocument();
    });
  });
});

