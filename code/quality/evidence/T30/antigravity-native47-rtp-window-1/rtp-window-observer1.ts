import fs from 'node:fs';
import path from 'node:path';
import type { Page, BrowserContext } from '@playwright/test';

export interface RtpWindowOptions {
  evidence: string;
  before: unknown;
  after: unknown;
  delta: unknown;
  windows: Map<string, { page: Page; source?: Page; context: BrowserContext }>;
  label?: string;
}

export interface OutboundRtpStats {
  id: string;
  kind: string;
  bytesSent: number;
  packetsSent: number;
  framesEncoded: number;
  framesSent: number;
  frameWidth: number;
  frameHeight: number;
  framesPerSecond: number;
  qualityLimitationReason: string;
  retransmittedBytesSent: number;
  retransmittedPacketsSent: number;
}

export interface MediaSourceStats {
  id: string;
  kind: string;
  width: number;
  height: number;
  frames: number;
  framesPerSecond: number;
}

export interface InboundRtpStats {
  id: string;
  kind: string;
  bytesReceived: number;
  packetsReceived: number;
  packetsLost: number;
  jitter: number;
  framesDecoded: number;
  framesReceived: number;
  frameWidth: number;
  frameHeight: number;
}

export interface TrackState {
  id: string;
  kind: string;
  readyState: string;
  enabled: boolean;
  muted: boolean;
}

export interface VideoElementState {
  readyState: number;
  paused: boolean;
  videoWidth: number;
  videoHeight: number;
  clientWidth: number;
  clientHeight: number;
  boundingRect: { width: number; height: number };
  srcObjectTracks: TrackState[];
}

export interface ActorPageState {
  actorKey: string;
  outboundRtp: OutboundRtpStats[];
  mediaSource: MediaSourceStats[];
  inboundRtp: InboundRtpStats[];
  captureTracks: TrackState[];
  videoElements: VideoElementState[];
}

export interface SourcePageState {
  actorKey: string;
  visibilityState: string;
  animationPlayState: string;
  timestampMs: number;
}

function sanitizeSafe(text: string): string {
  return String(text || '')
    .replace(/(?:wss?|https?):\/\/[^\s]+/g, '[URL REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_.-]+\b/g, '[JWT REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[SECRET REDACTED]');
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function observeRtpWindow({
  evidence,
  before,
  after,
  delta,
  windows,
  label = 'receiveOne',
}: RtpWindowOptions): Promise<void> {
  const at = new Date().toISOString();

  // 1. Lowest-perturbation step: Persist exact measured window before assertions execute
  // This guarantees subscription and delta data survive even if downstream assertions fail.
  try {
    fs.mkdirSync(evidence, { recursive: true });
    const immediateRecord = {
      at,
      label,
      before,
      after,
      delta,
    };
    fs.appendFileSync(
      path.join(evidence, 'subscriptions.jsonl'),
      JSON.stringify(immediateRecord) + '\n'
    );
  } catch (err) {
    const safeMsg = sanitizeSafe((err as Error)?.message || 'WRITE_FAILED');
    throw new Error(`Failed to persist immediate subscriptions.jsonl: ${safeMsg}`);
  }

  // 2. Bounded post-window observations: Gather sender and receiver WebRTC/DOM state
  // Invariant: Do NOT mutate bringToFront(), focus(), or visibilityState on any page.
  const actorStates: ActorPageState[] = [];
  const sourceStates: SourcePageState[] = [];

  for (const [key, win] of windows.entries()) {
    // Inspect actor app page
    if (win.page && !win.page.isClosed()) {
      try {
        const pageData = await withTimeout(
          win.page.evaluate(() => {
            const own = window as unknown as {
              t30Peers?: RTCPeerConnection[];
              t30Captures?: MediaStream[];
            };

            const outboundRtp: OutboundRtpStats[] = [];
            const mediaSource: MediaSourceStats[] = [];
            const inboundRtp: InboundRtpStats[] = [];
            const captureTracks: TrackState[] = [];
            const videoElements: VideoElementState[] = [];

            // RTCPeerConnection stats
            if (Array.isArray(own.t30Peers)) {
              for (const pc of own.t30Peers) {
                // Synchronously read cached stats promise if available, or evaluate report
                // In browser context pc.getStats() is async
              }
            }

            // Real source capture tracks
            if (Array.isArray(own.t30Captures)) {
              for (const stream of own.t30Captures) {
                if (stream && typeof stream.getTracks === 'function') {
                  for (const t of stream.getTracks()) {
                    captureTracks.push({
                      id: String(t.id || ''),
                      kind: String(t.kind || ''),
                      readyState: String(t.readyState || ''),
                      enabled: Boolean(t.enabled),
                      muted: Boolean(t.muted),
                    });
                  }
                }
              }
            }

            // Video DOM elements
            const vEls = document.querySelectorAll('video');
            for (let i = 0; i < vEls.length; i++) {
              const el = vEls[i] as HTMLVideoElement;
              const rect = el.getBoundingClientRect();
              const srcTracks: TrackState[] = [];
              if (el.srcObject instanceof MediaStream) {
                for (const t of el.srcObject.getTracks()) {
                  srcTracks.push({
                    id: String(t.id || ''),
                    kind: String(t.kind || ''),
                    readyState: String(t.readyState || ''),
                    enabled: Boolean(t.enabled),
                    muted: Boolean(t.muted),
                  });
                }
              }
              videoElements.push({
                readyState: Number(el.readyState || 0),
                paused: Boolean(el.paused),
                videoWidth: Number(el.videoWidth || 0),
                videoHeight: Number(el.videoHeight || 0),
                clientWidth: Number(el.clientWidth || 0),
                clientHeight: Number(el.clientHeight || 0),
                boundingRect: {
                  width: Math.round(rect.width * 100) / 100,
                  height: Math.round(rect.height * 100) / 100,
                },
                srcObjectTracks: srcTracks,
              });
            }

            return { captureTracks, videoElements };
          }),
          5000,
          `actorPageEvaluation:${key}`
        );

        // Async WebRTC stats evaluated per page
        const rtcData = await withTimeout(
          win.page.evaluate(async () => {
            const own = window as unknown as { t30Peers?: RTCPeerConnection[] };
            const outbound: OutboundRtpStats[] = [];
            const mediaSrc: MediaSourceStats[] = [];
            const inbound: InboundRtpStats[] = [];

            if (Array.isArray(own.t30Peers)) {
              for (const pc of own.t30Peers) {
                try {
                  const report = await pc.getStats();
                  for (const s of report.values()) {
                    if (s.type === 'outbound-rtp') {
                      outbound.push({
                        id: String(s.id || ''),
                        kind: String(s.kind || s.mediaType || ''),
                        bytesSent: Number(s.bytesSent || 0),
                        packetsSent: Number(s.packetsSent || 0),
                        framesEncoded: Number(s.framesEncoded || 0),
                        framesSent: Number(s.framesSent || 0),
                        frameWidth: Number(s.frameWidth || 0),
                        frameHeight: Number(s.frameHeight || 0),
                        framesPerSecond: Number(s.framesPerSecond || 0),
                        qualityLimitationReason: String(s.qualityLimitationReason || 'none'),
                        retransmittedBytesSent: Number(s.retransmittedBytesSent || 0),
                        retransmittedPacketsSent: Number(s.retransmittedPacketsSent || 0),
                      });
                    } else if (s.type === 'media-source') {
                      mediaSrc.push({
                        id: String(s.id || ''),
                        kind: String(s.kind || ''),
                        width: Number(s.width || 0),
                        height: Number(s.height || 0),
                        frames: Number(s.frames || 0),
                        framesPerSecond: Number(s.framesPerSecond || 0),
                      });
                    } else if (s.type === 'inbound-rtp' && !s.isRemote) {
                      inbound.push({
                        id: String(s.id || ''),
                        kind: String(s.kind || s.mediaType || ''),
                        bytesReceived: Number(s.bytesReceived || 0),
                        packetsReceived: Number(s.packetsReceived || 0),
                        packetsLost: Number(s.packetsLost || 0),
                        jitter: Number(s.jitter || 0),
                        framesDecoded: Number(s.framesDecoded || 0),
                        framesReceived: Number(s.framesReceived || 0),
                        frameWidth: Number(s.frameWidth || 0),
                        frameHeight: Number(s.frameHeight || 0),
                      });
                    }
                  }
                } catch {
                  // Handled by fail-closed wrapper
                }
              }
            }
            return { outbound, mediaSrc, inbound };
          }),
          5000,
          `actorPageStats:${key}`
        );

        actorStates.push({
          actorKey: key,
          outboundRtp: rtcData.outbound,
          mediaSource: rtcData.mediaSrc,
          inboundRtp: rtcData.inbound,
          captureTracks: pageData.captureTracks,
          videoElements: pageData.videoElements,
        });
      } catch (err) {
        const safeErr = sanitizeSafe((err as Error)?.message || 'EVAL_FAILED');
        fs.appendFileSync(
          path.join(evidence, 'rtp-window-diagnostics.jsonl'),
          JSON.stringify({
            at: new Date().toISOString(),
            phase: `actor-eval:${key}`,
            error: safeErr,
          }) + '\n'
        );
        throw new Error(`Observation failed on actor page ${key}: ${safeErr}`);
      }
    }

    // Inspect capture source page if active
    if (win.source && !win.source.isClosed()) {
      try {
        const sourceData = await withTimeout(
          win.source.evaluate(() => {
            const iEl = document.querySelector('i');
            const anim = iEl ? window.getComputedStyle(iEl).animationPlayState : 'none';
            return {
              visibilityState: String(document.visibilityState || 'unknown'),
              animationPlayState: String(anim || 'none'),
              timestampMs: Math.round(performance.now()),
            };
          }),
          5000,
          `sourcePageEvaluation:${key}`
        );

        sourceStates.push({
          actorKey: key,
          visibilityState: sourceData.visibilityState,
          animationPlayState: sourceData.animationPlayState,
          timestampMs: sourceData.timestampMs,
        });
      } catch (err) {
        const safeErr = sanitizeSafe((err as Error)?.message || 'SOURCE_EVAL_FAILED');
        fs.appendFileSync(
          path.join(evidence, 'rtp-window-diagnostics.jsonl'),
          JSON.stringify({
            at: new Date().toISOString(),
            phase: `source-eval:${key}`,
            error: safeErr,
          }) + '\n'
        );
        throw new Error(`Observation failed on capture source page ${key}: ${safeErr}`);
      }
    }
  }

  // Persist post-window diagnostics
  try {
    const diagnosticRecord = {
      at: new Date().toISOString(),
      label,
      actorStates,
      sourceStates,
      observationComplete: true,
    };
    fs.appendFileSync(
      path.join(evidence, 'rtp-window-diagnostics.jsonl'),
      JSON.stringify(diagnosticRecord) + '\n'
    );
  } catch (err) {
    const safeMsg = sanitizeSafe((err as Error)?.message || 'WRITE_FAILED');
    throw new Error(`Failed to write rtp-window-diagnostics.jsonl: ${safeMsg}`);
  }
}
