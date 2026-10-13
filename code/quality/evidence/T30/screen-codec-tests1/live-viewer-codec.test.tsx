// @vitest-environment jsdom
import React from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor, cleanup, act} from '@testing-library/react';
import {CallParticipantSchema, CallJoinSchema, UserSummarySchema, type CallParticipantDTO, type CallJoinDTO} from '@fg/contracts';
import {createMediaSession, type MediaSession} from '../../../../apps/web/src/features/calls/media.js';
import {LiveViewer} from '../../../../apps/web/src/features/live/LiveViewer.js';

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

interface MockRemoteTrack {
  kind: string;
  source: string;
  sid: string;
  attach: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  setVolume?: ReturnType<typeof vi.fn>;
}

interface MockLocalTrackWrapper {
  kind: string;
  source: string;
  sid: string;
  mediaStreamTrack: unknown;
  attach: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface MockTrackPublication {
  trackSid: string;
  kind: string;
  source: string;
  track: MockRemoteTrack | MockLocalTrackWrapper;
  isSubscribed: boolean;
  setSubscribed: ReturnType<typeof vi.fn>;
}

interface MockRemoteParticipant {
  identity: string;
  trackPublications: Map<string, MockTrackPublication>;
}

interface MockLocalParticipant {
  identity: string;
  permissions?: {
    canPublish?: boolean;
    canPublishSources?: number[];
  };
  trackPublications: Map<string, MockTrackPublication>;
  publishTrack: ReturnType<typeof vi.fn>;
  unpublishTrack: ReturnType<typeof vi.fn>;
  setMicrophoneEnabled: ReturnType<typeof vi.fn>;
  isMicrophoneEnabled: boolean;
}

// Mock LiveKit SDK transport boundary only. Production media.ts and LiveViewer are exercised directly.
const mockTransport = vi.hoisted(() => {
  const events = {
    ConnectionStateChanged: 'connectionStateChanged',
    TrackPublished: 'trackPublished',
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    TrackUnpublished: 'trackUnpublished',
    ParticipantDisconnected: 'participantDisconnected',
    ParticipantPermissionsChanged: 'participantPermissionsChanged',
    Disconnected: 'disconnected',
    LocalTrackPublished: 'localTrackPublished',
    LocalTrackUnpublished: 'localTrackUnpublished',
    TrackMuted: 'trackMuted',
    TrackUnmuted: 'trackUnmuted',
    AudioPlaybackStatusChanged: 'audioPlaybackChanged',
  };

  let nextLocalTrackSid = 1;

  function makeLocalPublication(rawTrack: unknown, source: string): MockTrackPublication {
    const isAudio = source === 'screen_share_audio';
    const sid = `track-local-screen-${nextLocalTrackSid++}${isAudio ? '-audio' : ''}`;
    const mediaStreamTrack = rawTrack as { stop?: () => void; readyState?: string };
    const attachedElements = new Set<HTMLMediaElement>();

    const wrapper: MockLocalTrackWrapper = {
      kind: isAudio ? 'audio' : 'video',
      source,
      sid,
      mediaStreamTrack: rawTrack,
      attach: vi.fn((el?: HTMLMediaElement) => {
        const target = el ?? document.createElement(isAudio ? 'audio' : 'video');
        target.dataset.trackSid = sid;
        attachedElements.add(target);
        return target;
      }),
      detach: vi.fn((el?: HTMLMediaElement) => {
        if (el) {
          attachedElements.delete(el);
          return [el];
        }
        const list = Array.from(attachedElements);
        attachedElements.clear();
        return list;
      }),
      stop: vi.fn(() => {
        if (typeof mediaStreamTrack?.stop === 'function') {
          mediaStreamTrack.stop();
        }
      }),
    };

    const pub: MockTrackPublication = {
      trackSid: sid,
      kind: isAudio ? 'audio' : 'video',
      source,
      track: wrapper,
      isSubscribed: true,
      setSubscribed: vi.fn(),
    };

    return pub;
  }

  class MockRoom {
    state = 'disconnected';
    options: Record<string, unknown>;
    handlers = new Map<string, Set<(...args: unknown[]) => void>>();
    remoteParticipants = new Map<string, MockRemoteParticipant>();
    localParticipant: MockLocalParticipant = {
      identity: 'admission_11111111-1111-4111-8111-111111111111',
      permissions: {
        canPublish: true,
        canPublishSources: [1, 2, 3, 4],
      },
      trackPublications: new Map<string, MockTrackPublication>(),
      publishTrack: vi.fn(async (track: unknown, options?: {source?: string}) => {
        const pub = makeLocalPublication(track, options?.source ?? 'screen_share');
        mockTransport.latestRoom?.localParticipant.trackPublications.set(pub.trackSid, pub);
        mockTransport.latestRoom?.emit(events.LocalTrackPublished, pub, mockTransport.latestRoom.localParticipant);
        return pub;
      }),
      unpublishTrack: vi.fn(async (trackOrPub?: unknown) => {
        if (trackOrPub) {
          const room = mockTransport.latestRoom;
          if (room) {
            for (const [sid, pub] of room.localParticipant.trackPublications.entries()) {
              const wrapper = pub.track as unknown as MockLocalTrackWrapper;
              if (pub === trackOrPub || pub.track === trackOrPub || wrapper?.mediaStreamTrack === trackOrPub) {
                room.localParticipant.trackPublications.delete(sid);
                room.emit(events.LocalTrackUnpublished, pub, room.localParticipant);
                break;
              }
            }
          }
        }
      }),
      setMicrophoneEnabled: vi.fn(async (enabled?: boolean) => {
        if (enabled !== undefined) {
          const room = mockTransport.latestRoom;
          if (room) {
            room.localParticipant.isMicrophoneEnabled = enabled;
          }
        }
      }),
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

    async connect(url?: string, token?: string, opts?: unknown) {
      if (!url && !token && !opts) {
        // Parameter usage guard for strict linters
      }
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
    makeLocalPublication,
  };
});

vi.mock('livekit-client', () => ({
  Room: mockTransport.MockRoom,
  RoomEvent: mockTransport.events,
  Track: {
    Kind: {Audio: 'audio', Video: 'video'},
    Source: {Microphone: 'microphone', ScreenShare: 'screen_share', ScreenShareAudio: 'screen_share_audio', Camera: 'camera'},
    sourceToProto: (source: string) => {
      if (source === 'camera') return 1;
      if (source === 'microphone') return 2;
      if (source === 'screen_share') return 3;
      if (source === 'screen_share_audio') return 4;
      return 0;
    },
  },
  ScreenSharePresets: {
    h720fps30: {
      resolution: {width: 1280, height: 720, frameRate: 30},
      encoding: {maxBitrate: 1500000, maxFramerate: 30},
    },
  },
  AudioPresets: {
    music: {maxBitrate: 64000},
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
    readyState: string;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  let mockStream: {
    getTracks: () => typeof mockTrack[];
    getVideoTracks: () => typeof mockTrack[];
    getAudioTracks: () => unknown[];
  };

  let audioRoot: HTMLDivElement;
  let session: MediaSession;

  let originalMediaDevices: unknown;
  let originalUserAgent: string;
  let originalInnerWidth: number;
  let originalPlatform: string;
  let originalMaxTouchPoints: number;

  function matchesConstraint(actual: unknown, expected: number): boolean {
    if (actual === expected) return true;
    if (actual && typeof actual === 'object') {
      const obj = actual as Record<string, unknown>;
      return obj.ideal === expected || obj.max === expected || obj.exact === expected;
    }
    return false;
  }

  function createRemoteScreenPublication(identity: string, sid: string): MockTrackPublication {
    const videoElement = document.createElement('video');
    videoElement.dataset.identity = identity;
    const track: MockRemoteTrack = {
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

    const pub: MockTrackPublication = {
      trackSid: sid,
      kind: 'video',
      source: 'screen_share',
      track,
      isSubscribed: false,
      setSubscribed: vi.fn(function (this: MockTrackPublication, subscribed: boolean) {
        this.isSubscribed = subscribed;
        return this;
      }),
    };
    return pub;
  }

  function createRemoteAudioPublication(identity: string, sid: string): MockTrackPublication {
    const audioElement = document.createElement('audio');
    audioElement.dataset.identity = identity;
    const track: MockRemoteTrack = {
      kind: 'audio',
      source: 'microphone',
      sid,
      attach: vi.fn(() => audioElement),
      detach: vi.fn(() => [audioElement]),
      stop: vi.fn(),
      setVolume: vi.fn(),
    };

    const pub: MockTrackPublication = {
      trackSid: sid,
      kind: 'audio',
      source: 'microphone',
      track,
      isSubscribed: false,
      setSubscribed: vi.fn(function (this: MockTrackPublication, subscribed: boolean) {
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

    originalMediaDevices = navigator.mediaDevices;
    originalUserAgent = navigator.userAgent;
    originalInnerWidth = window.innerWidth;
    originalPlatform = navigator.platform;
    originalMaxTouchPoints = navigator.maxTouchPoints;

    mockTrack = {
      kind: 'video',
      readyState: 'live',
      stop: vi.fn(() => {
        mockTrack.readyState = 'ended';
      }),
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

    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36',
    });

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

    session = createMediaSession(
      audioRoot,
      () => {},
      () => {}
    );
    await session.connect(validJoinGrant);
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {
      await session?.disconnect();
    });
    audioRoot.remove();

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      configurable: true,
      value: originalMediaDevices,
    });
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: originalUserAgent,
    });
    Object.defineProperty(navigator, 'platform', {
      writable: true,
      configurable: true,
      value: originalPlatform,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      writable: true,
      configurable: true,
      value: originalMaxTouchPoints,
    });
    window.innerWidth = originalInnerWidth;

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

  function emitRemoteScreenPublished(participant: CallParticipantDTO, sid: string): MockTrackPublication {
    const room = mockTransport.latestRoom!;
    const pub = createRemoteScreenPublication(participant.mediaIdentity!, sid);
    const peer: MockRemoteParticipant = {
      identity: participant.mediaIdentity!,
      trackPublications: new Map([[sid, pub]]),
    };
    room.remoteParticipants.set(participant.mediaIdentity!, peer);
    room.emit(mockTransport.events.TrackPublished, pub, peer);
    return pub;
  }

  // 1. Switching unsubscribes old video before subscribing new selected video via real session logic
  it('unsubscribes old video before subscribing new selected video when switching streams', async () => {
    const pubLinh = emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');
    const pubHuy = emitRemoteScreenPublished(huyParticipant, 'track-huy-screen');

    const callOrder: string[] = [];
    pubLinh.setSubscribed.mockImplementation(function (this: MockTrackPublication, sub: boolean) {
      callOrder.push(`linh:${sub}`);
      this.isSubscribed = sub;
      return this;
    });
    pubHuy.setSubscribed.mockImplementation(function (this: MockTrackPublication, sub: boolean) {
      callOrder.push(`huy:${sub}`);
      this.isSubscribed = sub;
      return this;
    });

    renderLiveViewer();

    await waitFor(() => {
      expect(callOrder).toContain('linh:true');
    });

    const huyTab = await screen.findByRole('tab', {name: /Huy/i});
    fireEvent.click(huyTab);

    await waitFor(() => {
      expect(callOrder).toContain('huy:true');
    });

    const linhUnsubIndex = callOrder.indexOf('linh:false');
    const huySubIndex = callOrder.indexOf('huy:true');
    expect(linhUnsubIndex).toBeGreaterThan(-1);
    expect(huySubIndex).toBeGreaterThan(-1);
    expect(linhUnsubIndex).toBeLessThan(huySubIndex);

    expect(pubLinh.isSubscribed).toBe(false);
    expect(pubHuy.isSubscribed).toBe(true);

    const mainStage = screen.getByRole('region', {name: /Màn hình đang xem/i});
    expect(mainStage.querySelectorAll('video')).toHaveLength(1);

    const selector = screen.getByRole('tablist', {name: /Danh sách luồng phát/i});
    expect(selector.querySelectorAll('video')).toHaveLength(0);
    expect(selector.textContent).toMatch(/Linh/);
    expect(selector.textContent).toMatch(/Huy/);
  });

  // 2. TrackUnsubscribed detaches old selected video but preserves both available sources in selector
  it('retains both available choices in selector upon TrackUnsubscribed during switching', async () => {
    const room = mockTransport.latestRoom!;
    const pubLinh = emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');
    emitRemoteScreenPublished(huyParticipant, 'track-huy-screen');

    renderLiveViewer();

    const huyTab = await screen.findByRole('tab', {name: /Huy/i});
    fireEvent.click(huyTab);

    // SDK fires TrackUnsubscribed for old track
    act(() => {
      room.emit(mockTransport.events.TrackUnsubscribed, pubLinh.track, pubLinh, {identity: linhParticipant.mediaIdentity});
    });

    // Linh is unsubscribed, but publication remains published: both choices must remain in the selector
    const selector = screen.getByRole('tablist', {name: /Danh sách luồng phát/i});
    expect(selector).toHaveTextContent(/Linh/);
    expect(selector).toHaveTextContent(/Huy/);
    expect(screen.getByRole('tab', {name: /Huy/i})).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', {name: /Linh/i})).toHaveAttribute('aria-selected', 'false');
  });

  // 3. Late old TrackSubscribed event cannot attach wrong video after rapid switch
  it('prevents late old TrackSubscribed event from attaching stale video after switching', async () => {
    const room = mockTransport.latestRoom!;
    const pubLinh = emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');
    emitRemoteScreenPublished(huyParticipant, 'track-huy-screen');

    renderLiveViewer();

    const huyTab = await screen.findByRole('tab', {name: /Huy/i});
    fireEvent.click(huyTab);

    // Stale TrackSubscribed event arriving for Linh's track
    act(() => {
      room.emit(mockTransport.events.TrackSubscribed, pubLinh.track, pubLinh, {identity: linhParticipant.mediaIdentity});
    });

    const stageVideo = screen.getByRole('region', {name: /Màn hình đang xem/i}).querySelector('video');
    expect(stageVideo?.dataset.trackSid).not.toBe('track-linh-screen');
  });

  // 4. Ended remote stream via TrackUnpublished chooses available fallback automatically
  it('ended remote stream via TrackUnpublished chooses available fallback automatically', async () => {
    const room = mockTransport.latestRoom!;
    const pubLinh = emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');
    const pubHuy = emitRemoteScreenPublished(huyParticipant, 'track-huy-screen');

    renderLiveViewer();

    await waitFor(() => {
      expect(pubLinh.isSubscribed).toBe(true);
    });

    // Remote publisher Linh actually terminates source: remove from publications and emit TrackUnpublished
    act(() => {
      const peer = room.remoteParticipants.get(linhParticipant.mediaIdentity!)!;
      peer.trackPublications.delete('track-linh-screen');
      room.emit(mockTransport.events.TrackUnpublished, pubLinh, peer);
    });

    // Automatically falls back to Huy
    await waitFor(() => {
      expect(pubHuy.isSubscribed).toBe(true);
    });
    expect(screen.getByRole('tab', {name: /Huy/i})).toHaveAttribute('aria-selected', 'true');

    // Huy also terminates source via TrackUnpublished
    act(() => {
      const peer = room.remoteParticipants.get(huyParticipant.mediaIdentity!)!;
      peer.trackPublications.delete('track-huy-screen');
      room.emit(mockTransport.events.TrackUnpublished, pubHuy, peer);
    });

    await waitFor(() => {
      expect(screen.getByText(/Chưa có luồng chia sẻ màn hình/i)).toBeInTheDocument();
    });
  });

  // 5. ParticipantDisconnected removes all that participant's sources and falls back
  it('removes participant sources and falls back when participant disconnects', async () => {
    const room = mockTransport.latestRoom!;
    emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');
    const pubHuy = emitRemoteScreenPublished(huyParticipant, 'track-huy-screen');

    renderLiveViewer();

    // Linh disconnects from call
    act(() => {
      const peer = room.remoteParticipants.get(linhParticipant.mediaIdentity!)!;
      room.remoteParticipants.delete(linhParticipant.mediaIdentity!);
      room.emit(mockTransport.events.ParticipantDisconnected, peer);
    });

    await waitFor(() => {
      expect(pubHuy.isSubscribed).toBe(true);
    });
    expect(screen.queryByRole('tab', {name: /Linh/i})).not.toBeInTheDocument();
    expect(screen.getByRole('tab', {name: /Huy/i})).toBeInTheDocument();
  });

  // 6. Safe capture-first flow: getDisplayMedia executes synchronously in click before await
  it('invokes getDisplayMedia synchronously in click before any await and requests 720p30', async () => {
    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);
    const constraints = getDisplayMediaMock.mock.calls[0][0] as {video?: Record<string, unknown>};
    expect(constraints?.video).toBeDefined();

    expect(matchesConstraint(constraints.video?.width, 1280)).toBe(true);
    expect(matchesConstraint(constraints.video?.height, 720)).toBe(true);
    expect(matchesConstraint(constraints.video?.frameRate, 30)).toBe(true);

    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/claim'))).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });
  });

  // 7. Canceled / denied capture sends zero claim and zero release (no leaked quota)
  it('denied or canceled capture does not dispatch claim or release, leaving quota untouched', async () => {
    getDisplayMediaMock.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(getDisplayMediaMock).toHaveBeenCalled();
    });

    expect(requests.filter((r) => r.url.includes('/screen-share/claim'))).toHaveLength(0);
    expect(requests.filter((r) => r.url.includes('/screen-share/release'))).toHaveLength(0);

    expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeEnabled();
  });

  // 8. Deferred capture promise unmounted before resolution stops track with zero claim and zero release
  it('stops late resolved capture stream after unmount with zero claim and zero release', async () => {
    let resolveCapture!: (stream: typeof mockStream) => void;
    getDisplayMediaMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCapture = resolve;
    }));

    const view = renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    // Unmount before capture prompt resolves
    view.unmount();

    // User accepts capture dialog late
    await act(async () => {
      resolveCapture(mockStream);
    });

    await waitFor(() => {
      expect(mockTrack.stop).toHaveBeenCalled();
    });

    // Because unmounted before capture finished, no claim was ever sent and no release needed
    expect(requests.filter((r) => r.url.includes('/screen-share/claim'))).toHaveLength(0);
    expect(requests.filter((r) => r.url.includes('/screen-share/release'))).toHaveLength(0);
    expect(mockTransport.latestRoom?.localParticipant.publishTrack).not.toHaveBeenCalled();
  });

  // 9. Publish failure after successful claim stops captured track and releases quota once
  it('stops captured track and releases quota once if publish fails after successful claim', async () => {
    const room = mockTransport.latestRoom!;
    room.localParticipant.publishTrack.mockRejectedValueOnce(new Error('LiveKit publish rejected'));

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/claim'))).toBe(true);
    });

    await waitFor(() => {
      expect(mockTrack.stop).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(requests.filter((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toHaveLength(1);
    });

    expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeEnabled();
  });

  // 10. Fourth publisher explains 3 screen slots and stops track without release
  it('stops captured track and explains the 3 screen slots limit when 4th publisher attempts to share', async () => {
    claimStatus = 409;
    claimResponse = {
      code: 'CAPACITY_FULL',
      message: 'Screen publisher limit is three',
    };

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(mockTrack.stop).toHaveBeenCalled();
    });

    expect(requests.filter((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toHaveLength(0);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/3 người chia sẻ.*tối đa.*3|giới hạn.*3.*màn hình/i);
  });

  // 11. Late HTTP claim after unmount releases once with zero local publish
  it('stops track and releases quota once if claim resolves late after component unmount', async () => {
    let resolveClaim!: (resp: Response) => void;
    let claimStartedTrigger!: () => void;
    const claimStarted = new Promise<void>((r) => {
      claimStartedTrigger = r;
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method?.toUpperCase() ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({url, method, body});

      if (url.includes('/screen-share/claim')) {
        claimStartedTrigger();
        return new Promise<Response>((resolve) => {
          resolveClaim = resolve;
        });
      }
      if (url.includes('/screen-share/release')) {
        return new Response(JSON.stringify({success: true}), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        });
      }
      return new Response(JSON.stringify({}), {status: 200});
    });

    const view = renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    // Wait until fetch('/screen-share/claim') has actually started and recorded
    await claimStarted;

    // Component unmounts while HTTP claim is pending
    view.unmount();

    // Late claim response arrives
    await act(async () => {
      resolveClaim(new Response(JSON.stringify(validJoinGrant), {status: 201}));
    });

    expect(mockTrack.stop).toHaveBeenCalled();
    await waitFor(() => {
      expect(requests.filter((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toHaveLength(1);
    });
    expect(mockTransport.latestRoom?.localParticipant.publishTrack).not.toHaveBeenCalled();
  });

  // 12. Mobile platform hides capture button and displays view-only guidance while keeping viewing and mic
  it('hides capture button and displays view-only guidance on mobile browser while preserving viewing', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    });

    emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');

    renderLiveViewer();

    expect(screen.queryByRole('button', {name: /Chia sẻ màn hình/i})).not.toBeInTheDocument();
    expect(screen.getByText(/thiết bị di động.*chỉ hỗ trợ xem.*chưa hỗ trợ phát/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', {name: /Linh/i})).toBeInTheDocument();
  });

  // 13. Unsupported desktop browser hides capture and shows unsupported guidance
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

  // 14. Narrow desktop viewport alone does not block supported desktop capture
  it('permits desktop capture even when responsive viewport is narrow', async () => {
    window.innerWidth = 360;

    renderLiveViewer();

    expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeInTheDocument();
  });

  // 15. Leave / route change cleans screen tracks and quota without ending persistent room or team
  it('cleans screen tracks and quota on leave or route change without ending persistent room or team', async () => {
    const view = renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

    view.unmount();

    expect(mockTrack.stop).toHaveBeenCalled();
    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toBe(true);
    });

    expect(requests.some((r) => r.method === 'POST' && /\/rooms\/[^/]+\/leave|play-sessions|\/end$/.test(r.url))).toBe(false);
  });

  // 16. Native browser stop sharing button (track.onended) releases quota and resets button
  it('releases quota and resets button when browser native stop sharing button is clicked', async () => {
    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

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

  // 17. Moderator stop screen share removes local publication and resets state
  it('resets local state and releases quota when moderator stops local screen share', async () => {
    const room = mockTransport.latestRoom!;

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

    act(() => {
      const pub = room.localParticipant.trackPublications.get('track-local-screen-1');
      room.emit(mockTransport.events.LocalTrackUnpublished, pub ?? {track: mockTrack, trackSid: 'track-local-screen-1', source: 'screen_share'});
    });

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeInTheDocument();
    });
  });

  // 18. Keyboard navigation across stream selector tabs (ArrowRight, ArrowLeft, Home, End)
  it('navigates selector tabs using keyboard Arrow keys, Home and End with focus retention', async () => {
    emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');
    emitRemoteScreenPublished(huyParticipant, 'track-huy-screen');

    renderLiveViewer();

    const linhTab = await screen.findByRole('tab', {name: /Linh/i});
    const huyTab = await screen.findByRole('tab', {name: /Huy/i});

    linhTab.focus();
    expect(document.activeElement).toBe(linhTab);

    fireEvent.keyDown(linhTab, {key: 'ArrowRight'});
    expect(document.activeElement).toBe(huyTab);
    expect(huyTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(huyTab, {key: 'ArrowLeft'});
    expect(document.activeElement).toBe(linhTab);
    expect(linhTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(linhTab, {key: 'End'});
    expect(document.activeElement).toBe(huyTab);

    fireEvent.keyDown(huyTab, {key: 'Home'});
    expect(document.activeElement).toBe(linhTab);
  });

  // 19. Audio subscription remains independent on audioRoot while screen video changes
  it('maintains independent audio subscription while screen video changes', async () => {
    const room = mockTransport.latestRoom!;
    const pubAudio = createRemoteAudioPublication(linhParticipant.mediaIdentity!, 'track-linh-audio');
    const peerAudio: MockRemoteParticipant = {
      identity: linhParticipant.mediaIdentity!,
      trackPublications: new Map([['track-linh-audio', pubAudio]]),
    };
    room.remoteParticipants.set(linhParticipant.mediaIdentity!, peerAudio);

    // Publish audio track
    act(() => {
      room.emit(mockTransport.events.TrackPublished, pubAudio, peerAudio);
    });

    // Auto-subscribed by MediaSession baseline
    expect(pubAudio.setSubscribed).toHaveBeenCalledWith(true);

    emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');
    emitRemoteScreenPublished(huyParticipant, 'track-huy-screen');

    renderLiveViewer();

    // Switch screen from Linh to Huy
    const huyTab = await screen.findByRole('tab', {name: /Huy/i});
    fireEvent.click(huyTab);

    // Audio subscription on audioRoot is unaffected and remains active
    expect(pubAudio.isSubscribed).toBe(true);
    expect(audioRoot.querySelectorAll('audio')).toHaveLength(1);
  });

  // 20. In-flight double click drops duplicate capture/claim
  it('drops duplicate capture and claim when share button is clicked twice in-flight', async () => {
    let resolveCapture!: (stream: typeof mockStream) => void;
    getDisplayMediaMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCapture = resolve;
    }));

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);
    fireEvent.click(shareButton);

    expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCapture(mockStream);
    });

    await waitFor(() => {
      expect(requests.filter((r) => r.url.includes('/screen-share/claim'))).toHaveLength(1);
    });
  });

  // 21. Track ended while HTTP claim is pending stops track, releases slot, does not publish
  it('releases claimed slot and stops track if capture ended while HTTP claim was pending', async () => {
    let resolveClaim!: (resp: Response) => void;
    let claimStartedTrigger!: () => void;
    const claimStarted = new Promise<void>((r) => {
      claimStartedTrigger = r;
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method?.toUpperCase() ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({url, method, body});

      if (url.includes('/screen-share/claim')) {
        claimStartedTrigger();
        return new Promise<Response>((resolve) => {
          resolveClaim = resolve;
        });
      }
      if (url.includes('/screen-share/release')) {
        return new Response(JSON.stringify({success: true}), {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        });
      }
      return new Response(JSON.stringify({}), {status: 200});
    });

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await claimStarted;

    // Track ended while claim was pending
    mockTrack.readyState = 'ended';

    await act(async () => {
      resolveClaim(new Response(JSON.stringify(validJoinGrant), {status: 201}));
    });

    expect(mockTrack.stop).toHaveBeenCalled();
    await waitFor(() => {
      expect(requests.filter((r) => r.url.endsWith('/screen-share/release'))).toHaveLength(1);
    });
    expect(mockTransport.latestRoom?.localParticipant.publishTrack).not.toHaveBeenCalled();
  });

  // 22. Permission revoke via ParticipantPermissionsChanged stops local capture and releases quota once
  it('stops local capture and releases quota when server revokes screen share permission', async () => {
    const room = mockTransport.latestRoom!;

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

    // Server revokes screen permission
    act(() => {
      room.localParticipant.permissions = {
        canPublish: true,
        canPublishSources: [1, 2], // Only Camera and Mic, ScreenShare removed!
      };
      room.emit(mockTransport.events.ParticipantPermissionsChanged, {canPublish: true}, room.localParticipant);
    });

    await waitFor(() => {
      expect(mockTrack.stop).toHaveBeenCalled();
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toBe(true);
      expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeInTheDocument();
    });
  });

  // 23. Idempotent attachment: multiple clicks or duplicate events do not create duplicate video elements
  it('guarantees idempotent video attachment without duplicate elements on repeat selection', async () => {
    emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');
    renderLiveViewer();

    const linhTab = await screen.findByRole('tab', {name: /Linh/i});
    fireEvent.click(linhTab);
    fireEvent.click(linhTab);

    const mainStage = screen.getByRole('region', {name: /Màn hình đang xem/i});
    expect(mainStage.querySelectorAll('video')).toHaveLength(1);
  });

  // 24. iPad detection (MacIntel + maxTouchPoints > 1) is view-only
  it('detects iPadOS desktop Safari as view-only tablet device', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      writable: true,
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    });
    Object.defineProperty(navigator, 'platform', {
      writable: true,
      configurable: true,
      value: 'MacIntel',
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      writable: true,
      configurable: true,
      value: 5,
    });

    emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');

    renderLiveViewer();

    expect(screen.queryByRole('button', {name: /Chia sẻ màn hình/i})).not.toBeInTheDocument();
    expect(screen.getByText(/thiết bị di động.*chỉ hỗ trợ xem.*chưa hỗ trợ phát/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', {name: /Linh/i})).toBeInTheDocument();
  });

  // 25. Awaits delayed native permission update via ParticipantPermissionsChanged before publishing
  it('waits for delayed native permission grant before completing screen publish', async () => {
    const room = mockTransport.latestRoom!;
    // Initially localParticipant has no screen share permission
    room.localParticipant.permissions = {
      canPublish: true,
      canPublishSources: [1, 2], // Only Camera & Mic
    };

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    // Wait until HTTP claim has succeeded
    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/claim'))).toBe(true);
    });

    // publishTrack has NOT been called yet because permissions are still restricted
    expect(room.localParticipant.publishTrack).not.toHaveBeenCalled();

    // Now server sends ParticipantPermissionsChanged granting ScreenShare (3)
    await act(async () => {
      room.localParticipant.permissions = {
        canPublish: true,
        canPublishSources: [1, 2, 3, 4],
      };
      room.emit(mockTransport.events.ParticipantPermissionsChanged, {canPublish: true}, room.localParticipant);
    });

    // Now publishTrack proceeds
    await waitFor(() => {
      expect(room.localParticipant.publishTrack).toHaveBeenCalled();
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });
  });

  // 26. Atomically unpublishes video track if optional system audio publish fails
  it('atomically unpublishes video track and releases quota if optional system audio publish fails', async () => {
    const room = mockTransport.latestRoom!;
    const mockAudioTrack = {
      kind: 'audio',
      readyState: 'live',
      stop: vi.fn(),
      onended: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    mockStream.getAudioTracks = () => [mockAudioTrack];

    // First call (video) succeeds, second call (audio) fails
    room.localParticipant.publishTrack
      .mockImplementationOnce(async (track: unknown) => mockTransport.makeLocalPublication(track, 'screen_share'))
      .mockRejectedValueOnce(new Error('Audio publish rejected'));

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(room.localParticipant.unpublishTrack).toHaveBeenCalled();
      expect(mockTrack.stop).toHaveBeenCalled();
      expect(mockAudioTrack.stop).toHaveBeenCalled();
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toBe(true);
    });

    expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeInTheDocument();
  });

  // 27. Stop sharing while publish is in-flight waits for start settlement and cleans up safely
  it('prevents duplicate release and cleans up safely when stopped while publish is in-flight', async () => {
    const room = mockTransport.latestRoom!;
    let resolvePublish!: (pub: unknown) => void;
    room.localParticipant.publishTrack.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePublish = resolve;
    }));

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/claim'))).toBe(true);
    });

    // In-flight: click share again while starting (busy)
    fireEvent.click(shareButton);
    // No second getDisplayMedia
    expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);

    // Resolve publish
    await act(async () => {
      resolvePublish(mockTransport.makeLocalPublication(mockTrack, 'screen_share'));
    });

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

    // Now stop sharing
    const stopButton = screen.getByRole('button', {name: /Dừng chia sẻ/i});
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(requests.filter((r) => r.url.endsWith('/screen-share/release'))).toHaveLength(1);
      expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeInTheDocument();
    });
  });

  // 28. Real pending-publication ended test: raw track ends while native publish is pending
  it('rolls back and unpublishes if raw capture ends while native SDK publish is in-flight', async () => {
    const room = mockTransport.latestRoom!;
    let resolvePublish!: (pub: unknown) => void;
    let publishTriggered!: () => void;
    const publishCalled = new Promise<void>((r) => {
      publishTriggered = r;
    });

    room.localParticipant.publishTrack.mockImplementationOnce(async () => {
      publishTriggered();
      return new Promise((resolve) => {
        resolvePublish = resolve;
      });
    });

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    // Wait until publishTrack was actually invoked
    await publishCalled;

    // Track ends while publishTrack is pending
    mockTrack.readyState = 'ended';
    await act(async () => {
      mockTrack.onended?.();
    });

    // Native SDK publish resolves
    await act(async () => {
      resolvePublish(mockTransport.makeLocalPublication(mockTrack, 'screen_share'));
    });

    await waitFor(() => {
      expect(room.localParticipant.unpublishTrack).toHaveBeenCalled();
      expect(mockTrack.stop).toHaveBeenCalled();
      expect(requests.filter((r) => r.url.endsWith('/screen-share/release'))).toHaveLength(1);
    });

    expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeInTheDocument();
  });

  // 29. Local preview attaches exactly one muted playsinline video without subscribing to remote streams
  it('attaches exactly one muted playsinline video for local preview without remote subscriptions', async () => {
    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

    const mainStage = screen.getByRole('region', {name: /Màn hình đang xem/i});
    const video = mainStage.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.muted).toBe(true);
    expect(video?.getAttribute('playsinline')).toBe('true');

    // No remote subscriptions were created
    for (const p of mockTransport.latestRoom?.remoteParticipants.values() ?? []) {
      for (const pub of p.trackPublications.values()) {
        expect(pub.isSubscribed).toBe(false);
      }
    }
  });

  // 30. Stop local sharing while remote stream is selected preserves remote video and subscription
  it('preserves remote video attachment and subscription when local sharing is stopped while watching remote', async () => {
    const pubLinh = emitRemoteScreenPublished(linhParticipant, 'track-linh-screen');

    renderLiveViewer();

    // Start local sharing
    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

    // Select remote Linh stream to watch
    const linhTab = await screen.findByRole('tab', {name: /Linh/i});
    fireEvent.click(linhTab);

    await waitFor(() => {
      expect(pubLinh.isSubscribed).toBe(true);
    });

    // Stop local sharing
    const stopButton = screen.getByRole('button', {name: /Dừng chia sẻ/i});
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeInTheDocument();
    });

    // Remote Linh screen remains selected, subscribed, and attached
    expect(pubLinh.isSubscribed).toBe(true);
    const mainStage = screen.getByRole('region', {name: /Màn hình đang xem/i});
    const video = mainStage.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.dataset.trackSid).toBe('track-linh-screen');
  });

  // 31. Local video unpublication preserves system audio handle and unpublishes both
  it('preserves and unpublishes system audio handle when screen tracks are unpublished', async () => {
    const room = mockTransport.latestRoom!;
    const mockAudioTrack = {
      kind: 'audio',
      readyState: 'live',
      stop: vi.fn(),
      onended: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    mockStream.getAudioTracks = () => [mockAudioTrack];

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

    // Stop sharing
    const stopButton = screen.getByRole('button', {name: /Dừng chia sẻ/i});
    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeInTheDocument();
    });

    // unpublishTrack was called for both video and audio
    expect(room.localParticipant.unpublishTrack).toHaveBeenCalledTimes(2);
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(mockAudioTrack.stop).toHaveBeenCalled();
  });

  // 32. Stale old local unpublication does not cancel newly active publication
  it('does not cancel new publication when a stale unpublication event arrives for old track SID', async () => {
    const room = mockTransport.latestRoom!;

    renderLiveViewer();

    // Start first share
    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

    // An old stale unpublication event arrives with an obsolete SID
    act(() => {
      room.emit(mockTransport.events.LocalTrackUnpublished, {trackSid: 'track-obsolete-stale-sid'});
    });

    // Still sharing active stream!
    expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
  });

  // 33. Pending permission await removes timers and listeners on session disconnect
  it('removes pending permission listeners and timer when media session disconnects', async () => {
    const room = mockTransport.latestRoom!;
    room.localParticipant.permissions = {
      canPublish: true,
      canPublishSources: [1, 2], // Only Camera & Mic (ScreenShare restricted)
    };

    renderLiveViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(requests.some((r) => r.url.endsWith('/screen-share/claim'))).toBe(true);
    });

    // Disconnect session while awaiting permission
    await act(async () => {
      await session.disconnect();
    });

    // Reconnecting with permission grant later must not trigger stale publish on closed session
    act(() => {
      room.localParticipant.permissions = {
        canPublish: true,
        canPublishSources: [1, 2, 3, 4],
      };
      room.emit(mockTransport.events.ParticipantPermissionsChanged, {canPublish: true}, room.localParticipant);
    });

    expect(room.localParticipant.publishTrack).not.toHaveBeenCalled();
  });

  for(const [name,sender,expected] of [
    ['advertised H264',{getCapabilities:()=>({codecs:[{mimeType:'video/VP8'},{mimeType:'video/H264'}]})},'h264'],
    ['VP8 only',{getCapabilities:()=>({codecs:[{mimeType:'video/VP8'}]})},undefined],
    ['missing capability API',undefined,undefined],
    ['capability query throws',{getCapabilities:()=>{throw new Error('not available');}},undefined],
  ] as const)it('preserves capture/claim/release with codec capability '+name,async()=>{
    const saved=Object.getOwnPropertyDescriptor(globalThis,'RTCRtpSender');Object.defineProperty(globalThis,'RTCRtpSender',{value:sender,configurable:true});
    try{
      renderLiveViewer();fireEvent.click(await screen.findByRole('button',{name:/Chia sẻ màn hình/i}));
      await waitFor(()=>expect(screen.getByRole('button',{name:/Dừng chia sẻ/i})).toBeInTheDocument());
      const publish=mockTransport.latestRoom!.localParticipant.publishTrack;
      expect(publish).toHaveBeenCalledTimes(1);expect(publish.mock.calls[0][1].videoCodec).toBe(expected);
      expect(publish.mock.calls[0][1].screenShareEncoding).toEqual(expect.objectContaining({maxFramerate:30,priority:'low'}));
      expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);expect(requests.filter(r=>r.url.endsWith('/screen-share/claim'))).toHaveLength(1);
      fireEvent.click(screen.getByRole('button',{name:/Dừng chia sẻ/i}));await waitFor(()=>expect(requests.filter(r=>r.url.endsWith('/screen-share/release'))).toHaveLength(1));expect(mockTrack.stop).toHaveBeenCalled();
    }finally{if(saved)Object.defineProperty(globalThis,'RTCRtpSender',saved);else delete (globalThis as {RTCRtpSender?:unknown}).RTCRtpSender;}
  });
});
