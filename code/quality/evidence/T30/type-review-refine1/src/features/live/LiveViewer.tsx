import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Monitor, MonitorOff, MonitorUp } from 'lucide-react';
import type { CallParticipantDTO } from '@fg/contracts';
import { Button } from '../../components/ui/Button.js';
import type { MediaSession, ScreenPublisherInfo } from '../calls/media.js';
import { claimScreenShare, releaseScreenShare } from './api.js';
import { CallApiError } from '../calls/api.js';
import './live.css';

export interface LiveViewerProps {
  callId: string;
  actorId: string;
  session: MediaSession;
  participants: CallParticipantDTO[];
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
}

function isMobileOrTablet(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function LiveViewer({ callId, actorId, session, participants }: LiveViewerProps) {
  void actorId;
  const [publishers, setPublishers] = useState<ScreenPublisherInfo[]>([]);
  const [selectedSid, setSelectedSid] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const selectedSidRef = useRef<string | null>(null);
  const currentOperationRef = useRef<ShareOperation | null>(null);
  const opSeqRef = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const isMobile = isMobileOrTablet();
  const isSupported = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  const idPrefix = useId();
  const stageId = `${idPrefix}-stage`;
  const getTabId = (sid: string) => `${idPrefix}-tab-${sid}`;

  const cleanupOp = useCallback(
    (op: ShareOperation, isExplicitStop = false): Promise<void> => {
      if (op.cleanupPromise) return op.cleanupPromise;

      op.cleanupPromise = (async () => {
        op.cancelled = true;
        op.abortController.abort();
        if (op.stream) {
          for (const track of op.stream.getTracks()) {
            track.stop();
          }
        }

        try {
          await session.unpublishScreenTracks();
        } catch {
          // Ignored during shutdown
        }

        if (op.claimed) {
          op.claimed = false; // release slot exactly once
          try {
            await releaseScreenShare(callId);
          } catch {
            if (mountedRef.current && isExplicitStop) {
              setError('Không thể giải phóng vị trí chia sẻ màn hình. Hãy kiểm tra kết nối.');
            }
          }
        }

        if (currentOperationRef.current === op) {
          currentOperationRef.current = null;
        }

        if (mountedRef.current) {
          setIsSharing(false);
          setBusy(false);
        }
      })();

      return op.cleanupPromise;
    },
    [callId, session]
  );

  const stopSharing = useCallback(
    async (isExplicitStop = false) => {
      const op = currentOperationRef.current;
      if (!op) return;

      op.cancelled = true;
      if (op.stream) {
        for (const track of op.stream.getTracks()) {
          track.stop();
        }
      }
      op.abortController.abort();

      if (mountedRef.current) {
        setBusy(true);
      }

      // Await start flow settlement to avoid cleanup race/interleaving
      try {
        await op.startSettledPromise;
      } catch {
        // Ignored
      }

      await cleanupOp(op, isExplicitStop);
    },
    [cleanupOp]
  );

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
      let next: string | null = null;
      if (pubs.length === 0) {
        next = null;
      } else if (current && pubs.some((p) => p.trackSid === current)) {
        next = current;
      } else {
        next = pubs[0].trackSid;
      }

      selectedSidRef.current = next;
      setSelectedSid(next);
      session.selectScreen(next);
    });

    const unregLocal = session.onLocalScreenUnpublished(() => {
      void stopSharing(false);
    });

    return () => {
      mountedRef.current = false;
      unregPublishers();
      unregLocal();
      session.setScreenStage(null);
      selectedSidRef.current = null;
      session.selectScreen(null);
      void stopSharing(false);
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
    if (isSharing) {
      void stopSharing(true);
      return;
    }

    const currentOp = currentOperationRef.current;
    if (currentOp && (!currentOp.settled || !currentOp.cleanupPromise)) {
      return; // In-flight start or stop already owned
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
    };

    currentOperationRef.current = op;
    setBusy(true);
    setError(null);

    // Synchronous execution in click handler tick before any await
    let capturePromise: Promise<MediaStream>;
    try {
      capturePromise = navigator.mediaDevices.getDisplayMedia({
        video: {
          width: 1280,
          height: 720,
          frameRate: 30,
        },
        audio: true,
      });
    } catch {
      op.cancelled = true;
      op.settled = true;
      op.resolveStartSettled();
      if (currentOperationRef.current === op) currentOperationRef.current = null;
      if (mountedRef.current) setBusy(false);
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

      if (op.cancelled || !mountedRef.current) {
        for (const track of stream.getTracks()) track.stop();
        op.settled = true;
        op.resolveStartSettled();
        if (currentOperationRef.current === op) currentOperationRef.current = null;
        if (mountedRef.current) setBusy(false);
        return;
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack || videoTrack.readyState === 'ended') {
        for (const track of stream.getTracks()) track.stop();
        op.cancelled = true;
        op.settled = true;
        op.resolveStartSettled();
        if (currentOperationRef.current === op) currentOperationRef.current = null;
        if (mountedRef.current) setBusy(false);
        return;
      }

      const onTrackEnded = () => {
        void stopSharing(false);
      };
      videoTrack.addEventListener('ended', onTrackEnded);

      try {
        await claimScreenShare(callId);
        op.claimed = true;
      } catch (err) {
        for (const track of stream.getTracks()) track.stop();
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

      if (op.cancelled || !mountedRef.current || videoTrack.readyState === 'ended') {
        for (const track of stream.getTracks()) track.stop();
        await cleanupOp(op, false);
        op.settled = true;
        op.resolveStartSettled();
        return;
      }

      const audioTrack = stream.getAudioTracks()[0];

      try {
        await session.publishScreenTracks(videoTrack, audioTrack, op.abortController.signal);

        if (op.cancelled || !mountedRef.current || videoTrack.readyState === 'ended') {
          await cleanupOp(op, false);
          op.settled = true;
          op.resolveStartSettled();
          return;
        }

        op.settled = true;
        op.resolveStartSettled();

        if (mountedRef.current) {
          setIsSharing(true);
          setBusy(false);
          setError(null);
        }
      } catch {
        op.cancelled = true;
        await cleanupOp(op, false);
        op.settled = true;
        op.resolveStartSettled();

        if (mountedRef.current) {
          setIsSharing(false);
          setBusy(false);
          setError('Không thể phát luồng màn hình lên cuộc gọi. Hãy thử lại.');
        }
      }
    })();
  };

  return (
    <div className="fg-live-viewer">
      {publishers.length > 0 && (
        <div role="tablist" aria-label="Danh sách luồng phát" className="fg-live-selector">
          {publishers.map((pub, index) => {
            const isSelected = pub.trackSid === selectedSid;
            const participant = participants.find(
              (p) => p.mediaIdentity === pub.identity || p.userId === pub.identity
            );
            const displayName = pub.isLocal
              ? `${participant?.user?.displayName ?? 'Bạn'} (màn hình của bạn)`
              : participant?.user?.displayName ?? 'Người chơi';

            return (
              <button
                key={pub.trackSid}
                role="tab"
                id={getTabId(pub.trackSid)}
                aria-controls={stageId}
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                ref={(el) => {
                  tabsRef.current[index] = el;
                }}
                onClick={() => handleSelect(pub.trackSid)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={`fg-live-tab ${isSelected ? 'selected' : ''}`}
                type="button"
              >
                <Monitor size={16} aria-hidden="true" />
                <span>{displayName}</span>
              </button>
            );
          })}
        </div>
      )}

      <div
        role="region"
        aria-label="Màn hình đang xem"
        id={stageId}
        className="fg-live-stage"
        ref={stageRef}
      >
        {publishers.length === 0 && (
          <p className="fg-live-empty">Chưa có luồng chia sẻ màn hình nào trong nhóm gọi.</p>
        )}
      </div>

      {error && (
        <p role="alert" className="fg-live-error">
          {error}
        </p>
      )}

      <div className="fg-live-controls">
        {isMobile ? (
          <p className="fg-live-guidance">
            Thiết bị di động chỉ hỗ trợ xem luồng chia sẻ và dùng mic, chưa hỗ trợ phát màn hình trực tiếp.
          </p>
        ) : !isSupported ? (
          <p className="fg-live-guidance">
            Trình duyệt này chưa hỗ trợ phát màn hình trực tiếp.
          </p>
        ) : (
          <Button
            variant={isSharing ? 'destructive' : 'outline'}
            disabled={busy}
            onClick={handleShareClick}
            leftIcon={isSharing ? <MonitorOff size={16} aria-hidden="true" /> : <MonitorUp size={16} aria-hidden="true" />}
          >
            {isSharing ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}
          </Button>
        )}
      </div>
    </div>
  );
}
