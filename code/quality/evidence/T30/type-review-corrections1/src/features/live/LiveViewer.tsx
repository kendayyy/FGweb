import React, { useEffect, useRef, useState, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { Monitor, MonitorOff, MonitorUp, AlertTriangle } from 'lucide-react';
import type { CallParticipantDTO } from '@fg/contracts';
import { Button } from '../../components/ui/Button.js';
import { CallApiError } from '../calls/api.js';
import type { MediaSession, ScreenPublisherInfo } from '../calls/media.js';
import { claimScreenShare, releaseScreenShare } from './api.js';
import './live.css';

export interface LiveViewerProps {
  callId: string;
  actorId: string;
  session: MediaSession;
  participants: CallParticipantDTO[];
  controlsTarget?: HTMLElement | null;
}

function isTrackEnded(track: MediaStreamTrack): boolean {
  return track.readyState === 'ended';
}

interface ShareOperation {
  id: number;
  stream: MediaStream | null;
  claimed: boolean;
  cancelled: boolean;
  settled: boolean;
  startSettledPromise: Promise<void>;
  resolveStartSettled: () => void;
  cleanupPromise: Promise<void> | null;
  abortController: AbortController;
  endedListener?: (() => void) | null;
}

export function LiveViewer({ callId, session, participants, controlsTarget }: LiveViewerProps) {
  const [publishers, setPublishers] = useState<ScreenPublisherInfo[]>([]);
  const [selectedSid, setSelectedSid] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const selectedSidRef = useRef<string | null>(null);
  const currentOperationRef = useRef<ShareOperation | null>(null);
  const opSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const idPrefix = useId();

  const isMobile =
    typeof navigator !== 'undefined' &&
    (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1));

  const hasGetDisplayMedia =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  const cleanupOp = useCallback(
    async (op: ShareOperation) => {
      if (op.cleanupPromise) return op.cleanupPromise;

      op.cleanupPromise = (async () => {
        op.cancelled = true;

        if (op.stream) {
          for (const track of op.stream.getTracks()) {
            if (op.endedListener) {
              track.removeEventListener('ended', op.endedListener);
            }
            try {
              track.stop();
            } catch {
              // Best effort
            }
          }
        }

        try {
          await session.unpublishScreenTracks();
        } catch {
          // Best effort
        }

        if (op.claimed) {
          try {
            await releaseScreenShare(callId);
          } catch {
            if (mountedRef.current && currentOperationRef.current === op) {
              setError('Không thể giải phóng vị trí phát màn hình. Vui lòng thử lại.');
            }
          }
        }

        if (currentOperationRef.current === op) {
          currentOperationRef.current = null;
          if (mountedRef.current) {
            setIsSharing(false);
            setBusy(false);
          }
        }
      })();

      return op.cleanupPromise;
    },
    [callId, session]
  );

  const stopSharing = useCallback(async () => {
    const op = currentOperationRef.current;
    if (!op) return;

    op.cancelled = true;
    if (op.stream) {
      for (const track of op.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Best effort
        }
      }
    }
    op.abortController.abort();

    if (mountedRef.current) {
      setBusy(true);
    }

    try {
      await op.startSettledPromise;
    } catch {
      // Ignored
    }

    await cleanupOp(op);
  }, [cleanupOp]);

  useEffect(() => {
    mountedRef.current = true;

    if (stageRef.current) {
      session.setScreenStage(stageRef.current);
    }

    const initialPubs = session.getScreenPublishers();
    setPublishers(initialPubs);
    if (initialPubs.length > 0) {
      const firstSid = initialPubs[0].trackSid;
      selectedSidRef.current = firstSid;
      setSelectedSid(firstSid);
      session.selectScreen(firstSid);
    }

    const unregPublishers = session.onScreenPublishers((pubs) => {
      setPublishers(pubs);
      const current = selectedSidRef.current;
      const next =
        pubs.length === 0
          ? null
          : current && pubs.some((p) => p.trackSid === current)
          ? current
          : pubs[0].trackSid;

      selectedSidRef.current = next;
      setSelectedSid(next);
      session.selectScreen(next);
    });

    const unregLocal = session.onLocalScreenUnpublished(() => {
      const op = currentOperationRef.current;
      if (op) {
        void stopSharing();
      }
    });

    return () => {
      mountedRef.current = false;
      unregPublishers();
      unregLocal();
      session.setScreenStage(null);
      selectedSidRef.current = null;
      session.selectScreen(null);

      const op = currentOperationRef.current;
      if (op) {
        op.cancelled = true;
        if (op.stream) {
          for (const track of op.stream.getTracks()) {
            try {
              track.stop();
            } catch {
              // Best effort
            }
          }
        }
        op.abortController.abort();
        void stopSharing();
      }
    };
  }, [session, stopSharing]);

  const handleSelect = (sid: string) => {
    selectedSidRef.current = sid;
    setSelectedSid(sid);
    session.selectScreen(sid);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (publishers.length === 0) return;
    let targetIndex = -1;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      targetIndex = (index + 1) % publishers.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      targetIndex = (index - 1 + publishers.length) % publishers.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIndex = publishers.length - 1;
    }

    if (targetIndex >= 0) {
      const targetPub = publishers[targetIndex];
      if (targetPub) {
        handleSelect(targetPub.trackSid);
        tabsRef.current[targetIndex]?.focus();
      }
    }
  };

  const handleShareClick = () => {
    if (isSharing || currentOperationRef.current?.claimed) {
      void stopSharing();
      return;
    }

    if (currentOperationRef.current) {
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) return;

    let resolveSettled!: () => void;
    const startSettledPromise = new Promise<void>((res) => {
      resolveSettled = res;
    });

    const op: ShareOperation = {
      id: ++opSeqRef.current,
      stream: null,
      claimed: false,
      cancelled: false,
      settled: false,
      startSettledPromise,
      resolveStartSettled: resolveSettled,
      cleanupPromise: null,
      abortController: new AbortController(),
      endedListener: null,
    };

    currentOperationRef.current = op;
    setBusy(true);
    setError(null);

    let capturePromise: Promise<MediaStream>;
    try {
      capturePromise = navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: true,
      });
    } catch {
      op.cancelled = true;
      op.settled = true;
      op.resolveStartSettled();
      if (currentOperationRef.current === op) currentOperationRef.current = null;
      setBusy(false);
      setError('Không thể bắt đầu chia sẻ màn hình. Hãy thử lại.');
      return;
    }

    void (async () => {
      let stream: MediaStream;
      try {
        stream = await capturePromise;
      } catch {
        op.cancelled = true;
        op.settled = true;
        op.resolveStartSettled();
        if (currentOperationRef.current === op) currentOperationRef.current = null;
        if (mountedRef.current) setBusy(false);
        return;
      }

      op.stream = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || isTrackEnded(videoTrack)) {
        for (const track of stream.getTracks()) {
          try {
            track.stop();
          } catch {
            // Best effort
          }
        }
        op.cancelled = true;
        op.settled = true;
        op.resolveStartSettled();
        if (currentOperationRef.current === op) currentOperationRef.current = null;
        if (mountedRef.current) setBusy(false);
        return;
      }

      const onEnded = () => {
        if (currentOperationRef.current === op) {
          void stopSharing();
        }
      };
      op.endedListener = onEnded;
      videoTrack.addEventListener('ended', onEnded);

      if (op.cancelled || !mountedRef.current) {
        for (const track of stream.getTracks()) {
          try {
            track.stop();
          } catch {
            // Best effort
          }
        }
        await cleanupOp(op);
        op.settled = true;
        op.resolveStartSettled();
        return;
      }

      try {
        await claimScreenShare(callId);
        op.claimed = true;
      } catch (err) {
        for (const track of stream.getTracks()) {
          try {
            track.stop();
          } catch {
            // Best effort
          }
        }
        op.cancelled = true;
        op.settled = true;
        op.resolveStartSettled();
        if (currentOperationRef.current === op) currentOperationRef.current = null;
        if (mountedRef.current) {
          setBusy(false);
          if (err instanceof CallApiError && err.status === 409 && err.code === 'CAPACITY_FULL') {
            setError('Đã có 3 người chia sẻ màn hình. Giới hạn tối đa là 3 luồng chia sẻ đồng thời trong một nhóm gọi.');
          } else {
            setError('Không thể bắt đầu chia sẻ màn hình. Hãy thử lại.');
          }
        }
        return;
      }

      if (op.cancelled || !mountedRef.current || isTrackEnded(videoTrack)) {
        for (const track of stream.getTracks()) {
          try {
            track.stop();
          } catch {
            // Best effort
          }
        }
        await cleanupOp(op);
        op.settled = true;
        op.resolveStartSettled();
        return;
      }

      const audioTrack = stream.getAudioTracks()[0];

      try {
        await session.publishScreenTracks(videoTrack, audioTrack, op.abortController.signal);

        if (op.cancelled || !mountedRef.current || isTrackEnded(videoTrack)) {
          await cleanupOp(op);
          op.settled = true;
          op.resolveStartSettled();
          return;
        }

        op.settled = true;
        op.resolveStartSettled();

        if (mountedRef.current && currentOperationRef.current === op) {
          setIsSharing(true);
          setBusy(false);
          setError(null);
        }
      } catch {
        op.cancelled = true;
        await cleanupOp(op);
        op.settled = true;
        op.resolveStartSettled();
      }
    })();
  };

  const getParticipantName = (pub: ScreenPublisherInfo) => {
    if (pub.isLocal) return 'Màn hình của bạn';
    const found = participants.find((p) => p.mediaIdentity === pub.identity);
    return found?.user?.displayName ?? 'Người chơi';
  };

  const shareControl = !isMobile && hasGetDisplayMedia ? (
    <Button
      variant={isSharing ? 'destructive' : 'secondary'}
      onClick={handleShareClick}
      disabled={busy}
      leftIcon={isSharing ? <MonitorOff size={16} aria-hidden="true" /> : <MonitorUp size={16} aria-hidden="true" />}
    >
      {busy ? 'Đang xử lý…' : isSharing ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}
    </Button>
  ) : null;

  return (
    <div className="fg-live-viewer">
      {publishers.length > 0 && (
        <div
          role="tablist"
          aria-label="Danh sách luồng phát"
          className="fg-live-selector"
        >
          {publishers.map((pub, idx) => {
            const isSelected = pub.trackSid === selectedSid;
            const tabId = `${idPrefix}-tab-${pub.trackSid}`;
            const panelId = `${idPrefix}-stage`;
            return (
              <button
                key={pub.trackSid}
                ref={(el) => {
                  tabsRef.current[idx] = el;
                }}
                id={tabId}
                role="tab"
                aria-selected={isSelected}
                aria-controls={panelId}
                tabIndex={isSelected ? 0 : -1}
                className={`fg-live-tab ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(pub.trackSid)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
              >
                <Monitor size={16} aria-hidden="true" />
                <span>{getParticipantName(pub)}</span>
              </button>
            );
          })}
        </div>
      )}

      <div
        ref={stageRef}
        id={`${idPrefix}-stage`}
        role="region"
        aria-label="Màn hình đang xem"
        aria-describedby={selectedSid ? `${idPrefix}-tab-${selectedSid}` : undefined}
        className="fg-live-stage"
      >
        {publishers.length === 0 && (
          <p className="fg-live-empty">Chưa có luồng chia sẻ màn hình nào trong nhóm gọi.</p>
        )}
      </div>

      {controlsTarget ? (
        shareControl ? createPortal(shareControl, controlsTarget) : null
      ) : (
        shareControl && <div className="fg-live-controls">{shareControl}</div>
      )}

      {isMobile && (
        <p role="status" className="fg-live-guidance">
          Thiết bị di động chỉ hỗ trợ xem luồng chia sẻ và dùng mic, chưa hỗ trợ phát màn hình trực tiếp.
        </p>
      )}

      {!isMobile && !hasGetDisplayMedia && (
        <p role="status" className="fg-live-guidance">
          Trình duyệt này chưa hỗ trợ phát màn hình trực tiếp.
        </p>
      )}

      {error && (
        <p role="alert" className="fg-live-error">
          <AlertTriangle size={16} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          {error}
        </p>
      )}
    </div>
  );
}
