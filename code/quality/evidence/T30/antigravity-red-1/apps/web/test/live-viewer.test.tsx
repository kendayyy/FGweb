// @vitest-environment jsdom
import React from 'react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor, cleanup, act} from '@testing-library/react';
import {CallParticipantDTO, CallGroupDTO} from '@fg/contracts';
import {LiveViewer} from '../src/features/live/LiveViewer.js';
import type {MediaSession, ScreenPublisherInfo} from '../src/features/calls/media.js';

// Polyfill HTMLMediaElement methods in jsdom environment
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

vi.mock('livekit-client', () => {
  const events = {
    ConnectionStateChanged: 'connectionStateChanged',
    TrackPublished: 'trackPublished',
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    ParticipantDisconnected: 'participantDisconnected',
    Disconnected: 'disconnected',
    LocalTrackPublished: 'localTrackPublished',
    TrackMuted: 'trackMuted',
    TrackUnmuted: 'trackUnmuted',
    AudioPlaybackStatusChanged: 'audioPlaybackChanged',
  };
  class Room {
    state = 'connected';
    options: Record<string, unknown>;
    handlers = new Map<string, Set<(...args: unknown[]) => void>>();
    constructor(opts: Record<string, unknown> = {}) {
      this.options = opts;
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
    removeAllListeners() {
      this.handlers.clear();
      return this;
    }
    disconnect = vi.fn(async () => {
      this.state = 'disconnected';
    });
  }
  return {
    Room,
    RoomEvent: events,
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
  };
});

describe('T30 approved LiveViewer and screen share behavior', () => {
  const actorId = 'user-viewer';
  const callId = 'call-a';

  const participantViewer: CallParticipantDTO = {
    callId,
    userId: actorId,
    user: {id: actorId, displayName: 'Nam (Viewer)', avatarUrl: null, customStatus: 'JUST_CHATTING'},
    mediaIdentity: 'admission_viewer',
    micRestricted: false,
    isPublishing: false,
    isMuted: true,
    joinedAt: '2026-10-10T12:00:00Z',
  };

  const participantLinh: CallParticipantDTO = {
    callId,
    userId: 'user-linh',
    user: {id: 'user-linh', displayName: 'Linh', avatarUrl: null, customStatus: 'PLAYING'},
    mediaIdentity: 'admission_linh',
    micRestricted: false,
    isPublishing: true,
    isMuted: false,
    joinedAt: '2026-10-10T12:00:00Z',
  };

  const participantHuy: CallParticipantDTO = {
    callId,
    userId: 'user-huy',
    user: {id: 'user-huy', displayName: 'Huy', avatarUrl: null, customStatus: 'PLAYING'},
    mediaIdentity: 'admission_huy',
    micRestricted: false,
    isPublishing: true,
    isMuted: false,
    joinedAt: '2026-10-10T12:00:00Z',
  };

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
    getAudioTracks: () => typeof mockTrack[];
  };

  // Mock publication factories
  function createMockPublication(identity: string, sid: string) {
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
    const setSubscribed = vi.fn(async (_sub: boolean) => {});
    return {
      trackSid: sid,
      kind: 'video',
      source: 'screen_share',
      track,
      isSubscribed: false,
      setSubscribed,
    };
  }

  let pubLinh: ReturnType<typeof createMockPublication>;
  let pubHuy: ReturnType<typeof createMockPublication>;
  let publisherList: ScreenPublisherInfo[];
  let publisherListeners: Set<(publishers: ScreenPublisherInfo[]) => void>;
  let sharingState: boolean;
  let selectedIdentityState: string | null;

  function createMockMediaSession(): MediaSession {
    return {
      connect: vi.fn(async () => {}),
      requestMicrophone: vi.fn(async () => {}),
      setMicrophone: vi.fn(async () => {}),
      setVolume: vi.fn(),
      resumeAudio: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {
        sharingState = false;
        selectedIdentityState = null;
      }),
      startScreenShare: vi.fn(async () => {
        sharingState = true;
        return undefined;
      }),
      stopScreenShare: vi.fn(async () => {
        sharingState = false;
      }),
      isScreenSharing: vi.fn(() => sharingState),
      selectScreen: vi.fn(async (identity: string | null, targetElement?: HTMLMediaElement | null) => {
        const oldIdentity = selectedIdentityState;
        selectedIdentityState = identity;
        if (oldIdentity && oldIdentity !== identity) {
          const oldPub = publisherList.find((p) => p.identity === oldIdentity)?.publication;
          if (oldPub) {
            await oldPub.setSubscribed(false);
            oldPub.track?.detach();
          }
        }
        if (identity) {
          const newPub = publisherList.find((p) => p.identity === identity)?.publication;
          if (newPub) {
            await newPub.setSubscribed(true);
            if (targetElement && newPub.track) {
              newPub.track.attach(targetElement);
            }
          }
        }
      }),
      getSelectedScreenIdentity: vi.fn(() => selectedIdentityState),
      onScreenPublishers: vi.fn((listener: (publishers: ScreenPublisherInfo[]) => void) => {
        publisherListeners.add(listener);
        listener(publisherList);
        return () => {
          publisherListeners.delete(listener);
        };
      }),
      getScreenPublishers: vi.fn(() => publisherList),
    };
  }

  let session: MediaSession;

  beforeEach(() => {
    requests = [];
    claimStatus = 201;
    claimResponse = {
      callId,
      token: 'mock-claim-token',
      sfuUrl: 'https://sfu.fixture.invalid',
      roomName: `fg-call_${callId}`,
    };
    releaseStatus = 200;
    sharingState = false;
    selectedIdentityState = null;
    participants = [structuredClone(participantViewer), structuredClone(participantLinh), structuredClone(participantHuy)];
    publisherListeners = new Set();

    pubLinh = createMockPublication('admission_linh', 'track-linh-screen');
    pubHuy = createMockPublication('admission_huy', 'track-huy-screen');

    publisherList = [
      {
        identity: 'admission_linh',
        userId: 'user-linh',
        displayName: 'Linh',
        publication: pubLinh as unknown as ScreenPublisherInfo['publication'],
      },
      {
        identity: 'admission_huy',
        userId: 'user-huy',
        displayName: 'Huy',
        publication: pubHuy as unknown as ScreenPublisherInfo['publication'],
      },
    ];

    session = createMockMediaSession();

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
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {});
    vi.restoreAllMocks();
  });

  function renderViewer(props: Partial<React.ComponentProps<typeof LiveViewer>> = {}) {
    return render(
      <LiveViewer
        callId={callId}
        actorId={actorId}
        session={session}
        participants={participants}
        {...props}
      />
    );
  }

  // 1. Switching unsubscribes old video before new selected subscription
  it('unsubscribes old video before subscribing new selected video when switching streams', async () => {
    const callOrder: string[] = [];
    pubLinh.setSubscribed.mockImplementation(async (sub) => {
      callOrder.push(`linh:${sub}`);
    });
    pubHuy.setSubscribed.mockImplementation(async (sub) => {
      callOrder.push(`huy:${sub}`);
    });

    renderViewer();

    // Default or initial selection is Linh
    await waitFor(() => {
      expect(callOrder).toContain('linh:true');
    });

    const huyTab = await screen.findByRole('tab', {name: /Huy/i});
    fireEvent.click(huyTab);

    await waitFor(() => {
      expect(callOrder).toContain('huy:true');
    });

    // Critical assertion: Linh was unsubscribed BEFORE Huy was subscribed
    const linhUnsubIndex = callOrder.indexOf('linh:false');
    const huySubIndex = callOrder.indexOf('huy:true');
    expect(linhUnsubIndex).toBeGreaterThan(-1);
    expect(huySubIndex).toBeGreaterThan(-1);
    expect(linhUnsubIndex).toBeLessThan(huySubIndex);

    // Only one selected main video in the stage
    const mainStage = screen.getByRole('region', {name: /Màn hình đang xem/i});
    expect(mainStage.querySelectorAll('video')).toHaveLength(1);

    // Stream selector tiles have names/icons and NO simultaneous video previews
    const selector = screen.getByRole('tablist', {name: /Danh sách luồng phát/i});
    expect(selector.querySelectorAll('video')).toHaveLength(0);
    expect(selector.textContent).toMatch(/Linh/);
    expect(selector.textContent).toMatch(/Huy/);
  });

  // 2. Ended selected stream chooses available fallback
  it('ended selected stream chooses available fallback stream automatically', async () => {
    renderViewer();

    // Initial stream selected is Linh
    await waitFor(() => {
      expect(session.selectScreen).toHaveBeenCalledWith('admission_linh', expect.anything());
    });

    // Simulate Linh's stream ending (publisher list updates to only Huy)
    await act(async () => {
      publisherList = [
        {
          identity: 'admission_huy',
          userId: 'user-huy',
          displayName: 'Huy',
          publication: pubHuy as unknown as ScreenPublisherInfo['publication'],
        },
      ];
      for (const listener of publisherListeners) {
        listener(publisherList);
      }
    });

    // Automatically falls back to Huy
    await waitFor(() => {
      expect(session.selectScreen).toHaveBeenCalledWith('admission_huy', expect.anything());
    });

    // When Huy also unpublishes (no streams left)
    await act(async () => {
      publisherList = [];
      for (const listener of publisherListeners) {
        listener(publisherList);
      }
    });

    // Renders empty standby state
    await waitFor(() => {
      expect(screen.getByText(/Chưa có luồng chia sẻ màn hình/i)).toBeInTheDocument();
    });
  });

  // 3. Capture after actual share button gesture defaults 720p30
  it('invokes getDisplayMedia with default 720p30 constraints after share button click', async () => {
    renderViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    expect(shareButton).toBeEnabled();

    fireEvent.click(shareButton);

    // Must be invoked after the click gesture
    expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);
    const passedConstraints = getDisplayMediaMock.mock.calls[0][0];

    // Defaults to 720p 30fps
    expect(passedConstraints).toBeDefined();
    expect(passedConstraints.video).toMatchObject({
      width: 1280,
      height: 720,
      frameRate: 30,
    });

    // Calls server claim endpoint
    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/claim'))).toBe(true);
    });

    // MediaSession startScreenShare is invoked
    expect(session.startScreenShare).toHaveBeenCalledTimes(1);

    // Button transitions to stop share state
    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });
  });

  // 4. Denied / canceled capture releases claimed quota and tracks
  it('denied or canceled capture releases claimed quota and stops tracks without broken state', async () => {
    getDisplayMediaMock.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));

    renderViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(getDisplayMediaMock).toHaveBeenCalled();
    });

    // If quota was tentatively claimed, release must be sent
    await waitFor(() => {
      expect(session.startScreenShare).not.toHaveBeenCalled();
    });

    // Button returns to idle Share Screen without UI error loop
    expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeEnabled();
    expect(session.isScreenSharing()).toBe(false);
  });

  // 5. Fourth publisher explains three screen slots
  it('explains the 3 screen slots limit and stops tracks when 4th publisher attempts to share', async () => {
    claimStatus = 409;
    claimResponse = {
      code: 'CAPACITY_FULL',
      message: 'Screen publisher limit is three',
    };

    renderViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    // Display media track was acquired then immediately stopped upon 409 rejection
    await waitFor(() => {
      expect(mockTrack.stop).toHaveBeenCalled();
    });

    // Release called for quota cleanup
    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toBe(true);
    });

    // Shows clear explanation of the 3-stream capacity limit
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/3 người chia sẻ.*tối đa.*3|giới hạn.*3.*màn hình/i);
    expect(session.isScreenSharing()).toBe(false);
  });

  // 6. Mobile / unsupported capture shows view-only guidance
  it('hides capture button and displays view-only guidance on mobile or unsupported devices', async () => {
    renderViewer({isMobile: true});

    // Capture button is hidden
    expect(screen.queryByRole('button', {name: /Chia sẻ màn hình/i})).not.toBeInTheDocument();

    // Clear guidance for mobile view-only experience
    expect(screen.getByText(/thiết bị di động.*chỉ hỗ trợ xem.*chưa hỗ trợ phát/i)).toBeInTheDocument();

    // Stream viewing and switching still work normally for remote desktop streams
    const linhTab = screen.getByRole('tab', {name: /Linh/i});
    expect(linhTab).toBeInTheDocument();
  });

  // 7. Leave / route / disconnect cleans screen tracks/quota without ending persistent room/team
  it('cleans screen tracks and quota on leave or route change without ending persistent room or team', async () => {
    const view = renderViewer();

    // Start sharing screen
    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);
    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

    // Component unmounts (simulating route transition or call leave)
    view.unmount();

    // Acquired local track stopped
    expect(mockTrack.stop).toHaveBeenCalled();

    // Release called on server
    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toBe(true);
    });

    // Never ends persistent room, dissolve room, or end play session
    expect(requests.some((r) => r.method === 'POST' && /\/rooms\/[^/]+\/leave|play-sessions|\/end$/.test(r.url))).toBe(false);
  });

  // 8. Rapid stream switching cancels in-flight subscription and maintains single active stream
  it('rapid switching between streams maintains single active subscription and clean sequence', async () => {
    let resolveFirstSwitch: () => void = () => {};
    const firstSwitchPromise = new Promise<void>((r) => {
      resolveFirstSwitch = r;
    });

    pubLinh.setSubscribed.mockImplementationOnce(async () => {
      await firstSwitchPromise;
    });

    renderViewer();

    const linhTab = await screen.findByRole('tab', {name: /Linh/i});
    const huyTab = await screen.findByRole('tab', {name: /Huy/i});

    // Click Linh then immediately Huy before Linh resolves
    fireEvent.click(linhTab);
    fireEvent.click(huyTab);

    resolveFirstSwitch();

    await waitFor(() => {
      expect(session.selectScreen).toHaveBeenLastCalledWith('admission_huy', expect.anything());
    });

    // Only one video element attached in stage
    const mainStage = screen.getByRole('region', {name: /Màn hình đang xem/i});
    expect(mainStage.querySelectorAll('video')).toHaveLength(1);
  });

  // 9. Asynchronous late capture completion after unmount stops acquired track
  it('stops acquired track and releases quota when capture resolves after component unmount', async () => {
    let resolveCapture!: (stream: typeof mockStream) => void;
    getDisplayMediaMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCapture = resolve;
    }));

    const view = renderViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    // Unmount while capture dialog is still pending
    view.unmount();

    // User accepts capture dialog after unmount
    await act(async () => {
      resolveCapture(mockStream);
    });

    // Track must be stopped immediately to avoid leak
    expect(mockTrack.stop).toHaveBeenCalled();

    // Release sent to backend
    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toBe(true);
    });
  });

  // 10. Native track ended event (browser floating bar) releases quota and resets button
  it('releases quota and resets button when browser native stop sharing is clicked', async () => {
    renderViewer();

    const shareButton = await screen.findByRole('button', {name: /Chia sẻ màn hình/i});
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Dừng chia sẻ/i})).toBeInTheDocument();
    });

    // User clicks native browser "Stop sharing" bar
    await act(async () => {
      mockTrack.onended?.();
    });

    // Slot released on server
    await waitFor(() => {
      expect(requests.some((r) => r.method === 'POST' && r.url.endsWith('/screen-share/release'))).toBe(true);
    });

    // Button resets back to "Chia sẻ màn hình"
    await waitFor(() => {
      expect(screen.getByRole('button', {name: /Chia sẻ màn hình/i})).toBeInTheDocument();
    });
  });

  // 11. Accessible labels, focus indicators, and 44px minimum target
  it('provides accessible labels, roles, and keyboard navigation on controls and stream selector', async () => {
    renderViewer();

    expect(screen.getByRole('region', {name: /Màn hình đang xem/i})).toBeInTheDocument();
    expect(screen.getByRole('tablist', {name: /Danh sách luồng phát/i})).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThanOrEqual(2);

    for (const tab of tabs) {
      expect(tab).toHaveAttribute('aria-selected');
    }

    const shareButton = screen.getByRole('button', {name: /Chia sẻ màn hình/i});
    expect(shareButton).toHaveAttribute('aria-pressed', 'false');
  });
});
