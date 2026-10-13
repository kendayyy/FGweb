import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  const inFlightRef = useRef(false);
  const operationIdRef = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const capturedStreamRef = useRef<MediaStream | null>(null);
  const hasClaimedRef = useRef(false);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const isMobile = isMobileOrTablet();
  const isSupported = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  const stageId = `live-stage-${callId}`;
  const getTabId = (sid: string) => `live-tab-${callId}-${sid}`;

  const stopSharing = useCallback(async (isExplicitClick = false) => {
    const stream = capturedStreamRef.current;
    capturedStreamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    const hadClaimed = hasClaimedRef.current;
    hasClaimedRef.current = false;
    if (mountedRef.current) {
      setIsSharing(false);
      setBusy(false);
    }

    try {
      await session.unpublishScreenTracks();
    } catch {
      // Ignored during shutdown
    }

    if (hadClaimed) {
      try {
        await releaseScreenShare(callId);
      } catch {
        if (mountedRef.current && isExplicitClick) {
          setError('Không thể giải phóng vị trí chia sẻ màn hình. Hãy kiểm tra kết nối.');
        }
      }
    }
  }, [callId, session]);

  useEffect(() => {
    mountedRef.current = true;

    if (stageRef.current) {
      session.setScreenStage(stageRef.current);
    }

    const initialPubs = session.getScreenPublishers();
    setPublishers(initialPubs);
    if (initialPubs.length > 0) {
      const firstSid = initialPubs[0].trackSid;
      setSelectedSid(firstSid);
      session.selectScreen(firstSid);
    }

    const unregPublishers = session.onScreenPublishers((pubs) => {
      setPublishers(pubs);
      let targetSid: string | null = null;
      setSelectedSid((currentSid) => {
        if (pubs.length === 0) {
          targetSid = null;
          return null;
        }
        if (currentSid && pubs.some((p) => p.trackSid === currentSid)) {
          targetSid = currentSid;
          return currentSid;
        }
        targetSid = pubs[0].trackSid;
        return targetSid;
      });
      session.selectScreen(targetSid);
    });

    const unregLocal = session.onLocalScreenUnpublished(() => {
      void stopSharing();
    });

    return () => {
      mountedRef.current = false;
      unregPublishers();
      unregLocal();
      session.setScreenStage(null);
      session.selectScreen(null);
      void stopSharing();
    };
  }, [session, stopSharing]);

  const handleSelect = (sid: string) => {
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

    if (inFlightRef.current || !navigator.mediaDevices?.getDisplayMedia) return;

    inFlightRef.current = true;
    setBusy(true);
    setError(null);
    const operationId = ++operationIdRef.current;

    // Transient activation preservation: synchronous invocation before any await
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
      inFlightRef.current = false;
      setBusy(false);
      return;
    }

    void (async () => {
      let stream: MediaStream;
      try {
        stream = await capturePromise;
      } catch {
        // User denied or dismissed browser prompt; zero claim, zero release
        inFlightRef.current = false;
        if (mountedRef.current) setBusy(false);
        return;
      }

      if (!mountedRef.current || operationIdRef.current !== operationId) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        inFlightRef.current = false;
        return;
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        inFlightRef.current = false;
        if (mountedRef.current) setBusy(false);
        return;
      }

      capturedStreamRef.current = stream;

      const handleTrackEnded = () => {
        void stopSharing();
      };
      videoTrack.addEventListener('ended', handleTrackEnded);

      try {
        await claimScreenShare(callId);
      } catch (err) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        capturedStreamRef.current = null;
        inFlightRef.current = false;
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

      // Check if unmounted or if track ended while claim was in-flight
      if (!mountedRef.current || operationIdRef.current !== operationId || videoTrack.readyState === 'ended') {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        capturedStreamRef.current = null;
        inFlightRef.current = false;
        try {
          await releaseScreenShare(callId);
        } catch {
          // Best effort release during teardown
        }
        return;
      }

      hasClaimedRef.current = true;
      const audioTrack = stream.getAudioTracks()[0];

      try {
        await session.publishScreenTracks(videoTrack, audioTrack);
        if (!mountedRef.current || operationIdRef.current !== operationId) {
          await stopSharing();
          return;
        }
        setIsSharing(true);
        setError(null);
      } catch {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        capturedStreamRef.current = null;
        hasClaimedRef.current = false;
        try {
          await releaseScreenShare(callId);
        } catch {
          // Best effort release
        }
        if (mountedRef.current) {
          setIsSharing(false);
          setError('Không thể phát luồng màn hình lên cuộc gọi. Hãy thử lại.');
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setBusy(false);
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
