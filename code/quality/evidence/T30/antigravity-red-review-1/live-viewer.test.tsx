// @vitest-environment jsdom
import React from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor, cleanup, act} from '@testing-library/react';
import {CallParticipantSchema, CallJoinSchema, UserSummarySchema, type CallParticipantDTO, type CallJoinDTO} from '@fg/contracts';
import {createMediaSession, type MediaSession} from '../src/features/calls/media.js';
import {LiveViewer} from '../src/features/live/LiveViewer.js';

// Polyfill HTMLMediaElement methods in jsdom
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();
}

vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = {
      connected: true,
      on: () => socket,
      off: () => socket,
      emit: () => socket,
      emitWithAck: async (_event: string, body: {conversationId?: string}) => ({ok: true, conversationId: body.conversationId ?? ''}),
      connect: () => socket,
      disconnect: () => socket,
      timeout: () => socket,
    };
    return socket;
  },
}));

// Mock LiveKit SDK transport boundary only. Production media.ts and LiveViewer are exercised directly.
const mockTransport = vi.hoisted(() => {
  const events = {
    ConnectionStateChanged: 'connectionStateChanged',
    TrackPublished: 'trackPublished',
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    ParticipantDisconnected: 'participantDisconnected',
    Disconnected: 'disconnected',
    LocalTrackPublished: 'localTrackPublished',
    LocalTrackUnpublished: 'localTrackUnpublished',
    TrackMuted: 'trackMuted',
    TrackUnmuted: 'trackUnmuted',
    AudioPlaybackStatusChanged: 'audioPlaybackChanged',
  };

  class MockRoom {
    state = 'disconnected';
    options: Record<string, unknown>;
    handlers = new Map<string, Set<(...args: unknown[]) => void>>();
    remoteParticipants = new Map<string, any>();
    localParticipant = {
      publishTrack: vi.fn(async (_track: any, _options?: any) => ({
        track: _track,
        source: _options?.source ?? 'screen_share',
      })),
      unpublishTrack: vi.fn(async (_track: any) => {}),
      setMicrophoneEnabled: vi.fn(async (_enabled: boolean) => {}),
      isMicrophoneEnabled: false,
    };

    constructor(opts: Record<string, unknown> = {}) {
      this.options = opts;
      mockTransport.rooms.push(this);
    }

    get canPlaybackAudio() {
      return true;
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      const set = this.handlers.get(event) ?? new Set();
      set.add(handler);
      this.handlers.set(event, set);
      return this;
    }

    off(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.get(event)?.delete(handler);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args);
      }
    }

    removeAllListeners() {
      this.handlers.clear();
      return this;
    }

    async connect(_url: string, _token: string, _opts?: any) {
      this.state = 'connected';
      this.emit(events.ConnectionStateChanged, 'connected');
      // Auto-subscribe existing audio tracks as per MediaSession baseline
      for (const participant of this.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          this.emit(events.TrackPublished, publication, participant);
        }
      }
    }

    disconnect = vi.fn(async () => {
      this.state = 'disconnected';
      this.emit(events.ConnectionStateChanged, 'disconnected');
      this.removeAllListeners();
    });
  }

  return {
    events,
    rooms: [] as MockRoom[],
    get latestRoom(): MockRoom | undefined {
      return this.rooms[this.rooms.length - 1];
    },
    MockRoom,
  };
});

vi.mock('livekit-client', () => ({
  Room: mockTransport.MockRoom,
  RoomEvent: mockTransport.events,
  Track: {
    Kind: {Audio: 'audio', Video: 'video'},
    Source: {Microphone: 'microphone', ScreenShare: 'screen_share', Camera: 'camera'},
  },
  ScreenSharePresets: {
    h720fps30: {
      resolution: {width: 1280, height: 720, frameRate: 30},
    },
  },
  ConnectionState: {
    Connected: 'connected',
    Connecting: 'connecting',
    Reconnecting: 'reconnecting',
    Disconnected: 'disconnected',
  },
  createLocalAudioTrack: async () => ({
    kind: 'audio',
    mute: vi.fn(),
    unmute: vi.fn(),
    stop: vi.fn(),
    isMuted: true,
  }),
}));

describe('T30 approved LiveViewer and screen share behavior (RED proposal)', () => {
  const actorId = 'user-viewer';
  const callId = 'call-a';

  // Valid shared schema fixtures using parse
  const viewerParticipant: CallParticipantDTO = CallParticipantSchema.parse({
    callId,
    userId: actorId,
    user: UserSummarySchema.parse({
      id: actorId,
      displayName: 'Nam (Viewer)',
      avatarUrl: null,
      customStatus: 'JUST_CHATTING',
    }),
    mediaIdentity: 'admission_11111111-1111-4111-8111-111111111111',
    micRestricted: false,
    isPublishing: false,
    isMuted: true,
    joinedAt: '2026-10-10T12:00:00Z',
  });

  const linhParticipant: CallParticipantDTO = CallParticipantSchema.parse({
    callId,
    userId: 'user-linh',
    user: UserSummarySchema.parse({
      id: 'user-linh',
      displayName: 'Linh',
      avatarUrl: null,
      customStatus: 'PLAYING',
    }),
    mediaIdentity: 'admission_22222222-2222-4222-8222-222222222222',
    micRestricted: false,
    isPublishing: true,
    isMuted: false,
    joinedAt: '2026-10-10T12:00:00Z',
  });

  const huyParticipant: CallParticipantDTO = CallParticipantSchema.parse({
    callId,
    userId: 'user-huy',
    user: UserSummarySchema.parse({
      id: 'user-huy',
      displayName: 'Huy',
      avatarUrl: null,
      customStatus: 'LOOKING_FOR_TEAM',
    }),
    mediaIdentity: 'admission_33333333-3333-4333-8333-333333333333',
    micRestricted: false,
    isPublishing: true,
    isMuted: false,
    joinedAt: '2026-10-10T12:00:00Z',
  });

  const validJoinGrant: CallJoinDTO = CallJoinSchema.parse({
    callId,
    token: 'mock-call-join-jwt',
    sfuUrl: 'https://sfu.fixture.invalid',
    roomName: `fg-call_${callId}`,
  });

  let participants: CallParticipantDTO[];
  let requests: Array<{url: string; method: string; body: unknown}>;
  let claimStatus: number;
  let claimResponse: unknown;
  let releaseStatus: number;
  let getDisplayMediaMock: ReturnType<typeof vi.fn>;
  let mockTrack: {
    kind: string;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  let mockStream: {
    getTracks: () => typeof mockTrack[];
    getVideoTracks: () => typeof mockTrack[];
    getAudioTracks: () => any[];
  };

  let audioRoot: HTMLDivElement;
  let session: MediaSession;

  // Track publication helpers matching native synchronous SDK methods
  function createRemoteScreenPublication(identity: string, sid: string) {
    const videoElement = document.createElement('video');
    videoElement.dataset.identity = identity;
    const track = {
      kind: 'video',
      source: 'screen_share',
      sid,
      attach: vi.fn((el?: HTMLMediaElement) => {
        const target = el ?? videoElement;
        target.dataset.trackSid = sid;
        return target;
      }),
      detach: vi.fn(() => [videoElement]),
      stop: vi.fn(),
    };

    const pub = {
      trackSid: sid,
      kind: 'video',
      source: 'screen_share',
      track,
      isSubscribed: false,
      // SDK setSubscribed is synchronous
      setSubscribed: vi.fn(function (this: any, subscribed: boolean) {
        this.isSubscribed = subscribed;
        return this;
      }),
    };
    return pub;
  }

  beforeEach(async () => {
    requests = [];
    claimStatus = 201;
    claimResponse = validJoinGrant;
    releaseStatus = 200;
    participants = [viewerParticipant, linhParticipant, huyParticipant];
    mockTransport.rooms = [];

    // Media capture mock
    mockTrack = {
      kind: 'video',
      stop: vi.fn(),
      onended: null,
      addEventListener: vi.fn((event, fn) => {
        if (event === 'ended') mockTrack.onended = fn;
      }),
      removeEventListener: vi.fn(),
    };
    mockStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
      getAudioTracks: () => [],
    };
    getDisplayMediaMock = vi.fn(async () => mockStream);

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      configurable: true,
      value: {
        getDisplayMedia: getDisplayMediaMock,
      },
    });

    // Default desktop user agent
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
    });

    // Mock fetch for T29 endpoints
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method?.toUpperCase() ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({url, method, body});

      if (url.includes('/screen-share/claim')) {
        return new Response(JSON.stringify(claimResponse), {
          status: claimStatus,
          headers: {'Content-Type': 'application/json'},
        });
      }
      if (url.includes('/screen-share/release')) {
        return new Response(JSON.stringify({success: true}), {
          status: releaseStatus,
          headers: {'Content-Type': 'application/json'},
        });
      }
      if (url.endsWith('/leave')) {
        return new Response(JSON.stringify({success: true}), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      });
    });

    audioRoot = document.createElement('div');
    document.body.appendChild(audioRoot);

    // Instantiate real production createMediaSession from calls/media.js
    session = createMediaSession(
      audioRoot,
      () => {},
      () => {}
    );
    await session.connect(validJoinGrant);
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {});
    audioRoot.remove();
    vi.restoreAllMocks();
  });

  function renderLiveViewer() {
    return render(
      <LiveViewer
        callId={callId}
        actorId={actorId}
        session={session}
        participants={participants}
      />
    );
  }

  // Helper to publish a remote participant's screen track on the mocked Room transport
  function emitRemoteScreenPublished(participant: CallParticipantDTO, sid: string) {
    const room = mockTransport.latestRoom!;
    const pub = createRemoteScreenPublication(participant.mediaIdentity!, sid);
    const peer = {
      identity: participant.mediaIdentity,
      trackPublications: new Map([[sid, pub]]),
    };
    room.remoteParticipants.set(participant.mediaIdentity!, peer);
    room.emit(mockTransport.events.TrackPublished, pub, peer);
    return pub;
  }

  // 1. Switching unsubscribes old video before new selected subscription via real session logic
  it('unsubscribes old video before subscribing new selected video when switching streams', async () => {
    const pubLinh = emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');
    const pubHuy = emitRemoteScreenPublished(huyParticipant, 'track-huy-screen');

    const callOrder: string[] = [];
    pubLinh.setSubscribed.mockImplementation(function (this: any, sub: boolean) {
      callOrder.push(`linh:${sub}`);
      this.isSubscribed = sub;
      return this;
    });
    pubHuy.setSubscribed.mockImplementation(function (this: any, sub: boolean) {
      callOrder.push(`huy:${sub}`);
      this.isSubscribed = sub;
      return this;
    });

    renderLiveViewer();

    // Default initial selected stream is Linh
    await waitFor(() => {
      expect(callOrder).toContain('linh:true');
    });

    // Stream selector has tab buttons with names from participants
    const huyTab = await screen.findByRole('tab', {name: /Huy/i});
    fireEvent.click(huyTab);

    await waitFor(() => {
      expect(callOrder).toContain('huy:true');
    });

    // Linh was unsubscribed before Huy was subscribed
    const linhUnsubIndex = callOrder.indexOf('linh:false');
    const huySubIndex = callOrder.indexOf('huy:true');
    expect(linhUnsubIndex).toBeGreaterThan(-1);
    expect(huySubIndex).toBeGreaterThan(-1);
    expect(linhUnsubIndex).toBeLessThan(huySubIndex);

    // Final true subscription states: exactly one true, the other false
    expect(pubLinh.isSubscribed).toBe(false);
    expect(pubHuy.isSubscribed).toBe(true);

    // Main stage hosts single active video element
    const mainStage = screen.getByRole('region', {name: /Màn hình đang xem/i});
    expect(mainStage.querySelectorAll('video')).toHaveLength(1);

    // Stream selector displays names/icons and NO simultaneous preview videos
    const selector = screen.getByRole('tablist', {name: /Danh sách luồng phát/i});
    expect(selector.querySelectorAll('video')).toHaveLength(0);
    expect(selector.textContent).toMatch(/Linh/);
    expect(selector.textContent).toMatch(/Huy/);
  });

  // 2. Late old TrackSubscribed event cannot attach wrong video after rapid switch
  it('prevents late old TrackSubscribed event from attaching stale video after switching', async () => {
    const room = mockTransport.latestRoom!;
    const pubLinh = emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');
    const pubHuy = emitRemoteScreenPublished(huyParticipant, 'track-huy-screen');

    renderLiveViewer();

    // User switches to Huy
    const huyTab = await screen.findByRole('tab', {name: /Huy/i});
    fireEvent.click(huyTab);

    // Simulate delayed TrackSubscribed arriving from Linh's track
    act(() => {
      room.emit(mockTransport.events.TrackSubscribed, pubLinh.track, pubLinh, {identity: linhParticipant.mediaIdentity});
    });

    // Main stage video element must not be attached to Linh's track
    const stageVideo = screen.getByRole('region', {name: /Màn hình đang xem/i}).querySelector('video');
    expect(stageVideo?.dataset.trackSid).not.toBe('track-linh-screen');
  });

  // 3. Ended selected stream chooses available fallback automatically
  it('ended selected stream chooses available fallback automatically or returns to standby', async () => {
    const room = mockTransport.latestRoom!;
    const pubLinh = emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');
    const pubHuy = emitRemoteScreenPublished(huyParticipant, 'track-huy-screen');

    renderLiveViewer();

    await waitFor(() => {
      expect(pubLinh.isSubscribed).toBe(true);
    });

    // Linh unpublishes screen
    act(() => {
      room.emit(mockTransport.events.TrackUnsubscribed, pubLinh.track, pubLinh, {identity: linhParticipant.mediaIdentity});
    });

    // Automatically falls back to Huy
    await waitFor(() => {
      expect(pubHuy.isSubscribed).toBe(true);
    });
    expect(screen.getByRole('tab', {name: /Huy/i})).toHaveAttribute('aria-selected', 'true');

    // Huy also unpublishes
    act(() => {
      room.emit(mockTransport.events.TrackUnsubscribed, pubHuy.track, pubHuy, {identity: huyParticipant.mediaIdentity});
    });

    // Stage transitions to standby empty state
    await waitFor(() => {
      expect(screen.getByText(/Chưa có luồng chia sẻ màn hình/i)).toBeInTheDocument();
    });
  });

  // 4. Safe capture-first flow: getDisplayMedia executes synchronously in click before await
  it('invokes getDisplayMedia synchronously in click before any await and defaults 720p30', async () => {
    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    // Called synchronously in click tick to preserve transient user activation
    expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);
    const constraints = getDisplayMediaMock.mock.calls[0][0];
    expect(constraints?.video).toMatchObject({
      width: 1280,
      height: 720,
      frameRate: 30,
    });

    // Claim dispatched only after media capture resolves
    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/claim'))).toBe(true);
    });

    // Button label transitions to Stop sharing
    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });
  });

  // 5. Canceled / denied capture sends NO claim and NO release (no leaked quota)
  it('denied or canceled capture does not dispatch claim or release, leaving quota untouched', async () => {
    getDisplayMediaMock.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(getDisplayMediaMock).toHaveBeenCalled();
    });

    // Because capture was denied before claim, NO claim was made and NO release is dispatched
    expect(requests.filter((r) => r.url.includes('/screen-share/claim'))).toHaveLength(0);
    expect(requests.filter((r) => r.url.includes('/screen-share/release'))).toHaveLength(0);

    // Button remains idle and UI stable
    expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeEnabled();
  });

  // 6. Publish failure after successful claim stops captured track and releases quota once
  it('stops captured track and releases quota once if publish fails after successful claim', async () => {
    const room = mockTransport.latestRoom!;
    room.localParticipant.publishTrack.mockRejectedValueOnce(new Error('LiveKit publish rejected'));

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/claim'))).toBe(true);
    });

    // Acquired track stopped immediately upon publish failure
    await waitFor(() => {
      expect(mockTrack.stop).toHaveBeenCalled();
    });

    // Release sent exactly once to clean up claimed quota
    await waitFor(() => {
      expect(requests.filter((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toHaveLength(1);
    });

    expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeEnabled();
  });

  // 7. Fourth publisher explains 3 screen slots and stops track without release
  it('stops captured track and explains the 3 screen slots limit when 4th publisher attempts to share', async () => {
    claimStatus = 409;
    claimResponse = {
      code: 'CAPACITY_FULL',
      message: 'Screen publisher limit is three',
    };

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    // Track stopped immediately upon 409 capacity rejection
    await waitFor(() => {
      expect(mockTrack.stop).toHaveBeenCalled();
    });

    // No release needed because claim was never granted
    expect(requests.filter((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toHaveLength(0);

    // User alert explains 3 screen publishers limit
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/3 người chia sẻ.*tối đa.*3|giới hạn.*3.*màn hình/i);
  });

  // 8. Late successful claim after unmount stops track and releases quota once
  it('stops track and releases quota once if claim resolves after component unmount', async () => {
    let resolveClaim!: (resp: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input) => {
      const url = String(input);
      if (url.includes('/screen-share/claim')) {
        return new Promise<Response>((resolve) => {
          resolveClaim = resolve;
        });
      }
      return new Response(JSON.stringify({}), {status: 200});
    });

    const view = renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    // Component unmounts while HTTP claim is in-flight
    view.unmount();

    // Late claim response arrives
    await act(async () => {
      resolveClaim(new Response(JSON.stringify(validJoinGrant), {status: 201}));
    });

    // Track stopped, release called once, no local publication
    expect(mockTrack.stop).toHaveBeenCalled();
    await waitFor(() => {
      expect(requests.filter((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toHaveLength(1);
    });
  });

  // 9. Mobile platform hides capture button and displays view-only guidance while keeping viewing and mic
  it('hides capture button and displays view-only guidance on mobile browser while preserving viewing', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    });

    emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');

    renderLiveViewer();

    // Capture button is hidden on mobile
    expect(screen.queryByRole('button', {name: /Chia sẻ màn hình/i})).not.toBeInTheDocument();

    // Guidance text displayed
    expect(screen.getByText(/thiết bị di động.*chỉ hỗ trợ xem.*chưa hỗ trợ phát/i)).toBeInTheDocument();

    // Screen viewing still functions for mobile viewer
    expect(screen.getByRole('tab', {name: /Linh/i})).toBeInTheDocument();
  });

  // 10. Unsupported desktop browser hides capture and shows unsupported guidance
  it('hides capture button and displays guidance on desktop browsers without getDisplayMedia support', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      configurable: true,
      value: {},
    });

    renderLiveViewer();

    expect(screen.queryByRole('button', {name: /Chia sẻ màn hình/i})).not.toBeInTheDocument();
    expect(screen.getByText(/chưa hỗ trợ phát màn hình trực tiếp/i)).toBeInTheDocument();
  });

  // 11. Narrow desktop viewport alone does not block supported desktop capture
  it('permits desktop capture even when responsive viewport is narrow', async () => {
    window.innerWidth = 360;

    renderLiveViewer();

    // Desktop browser resized to mobile width still offers Share Screen button
    expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeInTheDocument();
  });

  // 12. Leave / route change cleans screen tracks and quota without ending persistent room or team
  it('cleans screen tracks and quota on leave or route change without ending persistent room or team', async () => {
    const view = renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

    // Unmount simulating route change / leave
    view.unmount();

    expect(mockTrack.stop).toHaveBeenCalled();
    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toBe(true);
    });

    // Room and play session endpoints must never be called
    expect(requests.some((r) => r.method === 'POST' && /\/rooms\/[^/]+\/leave|play-sessions|\/end$/.test(r.url))).toBe(false);
  });

  // 13. Native browser stop sharing button (track.onended) releases quota and resets button
  it('releases quota and resets button when browser native stop sharing button is clicked', async () => {
    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

    // Browser floating bar triggers onended
    await act(async () => {
      mockTrack.onended?.();
    });

    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeInTheDocument();
    });
  });

  // 14. Moderator stop screen share removes local publication and resets state
  it('resets local state and releases quota when moderator stops local screen share', async () => {
    const room = mockTransport.latestRoom!;

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

    // Room transport fires LocalTrackUnpublished
    act(() => {
      room.emit(mockTransport.events.LocalTrackUnpublished, {track: mockTrack, source: 'screen_share'});
    });

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeInTheDocument();
    });
  });

  // 15. Keyboard navigation across stream selector tabs (ArrowRight, ArrowLeft, Home, End)
  it('navigates selector tabs using keyboard Arrow keys, Home and End with focus retention', async () => {
    emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');
    emitRemoteScreenPublished(huyParticipant, 'track-huy-screen');

    renderLiveViewer();

    const linhTab = await screen.findByRole('tab', {name: /Linh/i});
    const huyTab = await screen.findByRole('tab', {name: /Huy/i});

    linhTab.focus();
    expect(document.activeElement).toBe(linhTab);

    // ArrowRight moves focus and selection to next tab
    fireEvent.keyDown(linhTab, {key: 'ArrowRight'});
    expect(document.activeElement).toBe(huyTab);
    expect(huyTab).toHaveAttribute('aria-selected', 'true');

    // ArrowLeft moves back
    fireEvent.keyDown(huyTab, {key: 'ArrowLeft'});
    expect(document.activeElement).toBe(linhTab);
    expect(linhTab).toHaveAttribute('aria-selected', 'true');

    // End moves to last tab
    fireEvent.keyDown(linhTab, {key: 'End'});
    expect(document.activeElement).toBe(huyTab);

    // Home moves to first tab
    fireEvent.keyDown(huyTab, {key: 'Home'});
    expect(document.activeElement).toBe(linhTab);
  });
});
