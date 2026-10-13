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

export function LiveViewer({ callId, actorId, session, participants }: LiveViewerProps) {
  void actorId;
  const [publishers, setPublishers] = useState<ScreenPublisherInfo[]>([]);
  const [selectedSid, setSelectedSid] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const capturedStreamRef = useRef<MediaStream | null>(null);
  const hasClaimedRef = useRef(false);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const isSupported = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

  const stopSharing = useCallback(async () => {
    const stream = capturedStreamRef.current;
    capturedStreamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    const hadClaimed = hasClaimedRef.current;
    hasClaimedRef.current = false;
    setIsSharing(false);

    try {
      await session.unpublishScreenTrack();
    } catch {
      // Ignored during shutdown
    }

    if (hadClaimed) {
      try {
        await releaseScreenShare(callId);
      } catch {
        // Best-effort release
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
      setSelectedSid((currentSid) => {
        if (pubs.length === 0) {
          session.selectScreen(null);
          return null;
        }
        if (currentSid && pubs.some((p) => p.trackSid === currentSid)) {
          return currentSid;
        }
        const fallbackSid = pubs[0].trackSid;
        session.selectScreen(fallbackSid);
        return fallbackSid;
      });
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
      void stopSharing();
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) return;

    setError(null);
    // Transient activation preservation: synchronous invocation before any await
    const capturePromise = navigator.mediaDevices.getDisplayMedia({
      video: {
        width: 1280,
        height: 720,
        frameRate: 30,
      },
    });

    void (async () => {
      let stream: MediaStream;
      try {
        stream = await capturePromise;
      } catch {
        // User denied or dismissed browser prompt; zero claim, zero release
        return;
      }

      if (!mountedRef.current) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
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
        if (err instanceof CallApiError && err.status === 409 && err.code === 'CAPACITY_FULL') {
          setError('Đã có 3 người chia sẻ màn hình. Giới hạn tối đa là 3 luồng chia sẻ đồng thời trong một nhóm gọi.');
        } else {
          setError('Không thể bắt đầu chia sẻ màn hình. Hãy thử lại.');
        }
        return;
      }

      if (!mountedRef.current) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        capturedStreamRef.current = null;
        try {
          await releaseScreenShare(callId);
        } catch {
          // Best effort release
        }
        return;
      }

      hasClaimedRef.current = true;

      try {
        await session.publishScreenTrack(videoTrack);
        if (!mountedRef.current) {
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
        setIsSharing(false);
        setError('Không thể phát luồng màn hình lên cuộc gọi. Hãy thử lại.');
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
            const displayName = participant?.user?.displayName ?? 'Người chơi';

            return (
              <button
                key={pub.trackSid}
                role="tab"
                id={`tab-${pub.trackSid}`}
                aria-controls="live-stage"
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
        id="live-stage"
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
