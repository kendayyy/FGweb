import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  ScreenSharePresets,
  AudioPresets,
  type LocalAudioTrack,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type RemoteTrack,
  type LocalTrackPublication,
  type LocalVideoTrack,
} from 'livekit-client';
import type { CallJoinDTO } from '@fg/contracts';

export type MediaState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ScreenPublisherInfo {
  identity: string;
  trackSid: string;
  isLocal?: boolean;
}

export interface MediaSession {
  connect(join: CallJoinDTO): Promise<void>;
  requestMicrophone(): Promise<void>;
  setMicrophone(enabled: boolean): Promise<void>;
  setVolume(identity: string, volume: number, muted: boolean): void;
  resumeAudio(): Promise<void>;
  disconnect(): Promise<void>;

  publishScreenTracks(videoTrack: MediaStreamTrack, audioTrack?: MediaStreamTrack, signal?: AbortSignal): Promise<void>;
  unpublishScreenTracks(): Promise<void>;
  selectScreen(trackSid: string | null): void;
  getSelectedScreenSid(): string | null;
  getScreenPublishers(): ScreenPublisherInfo[];
  setScreenStage(container: HTMLElement | null): void;
  onScreenPublishers(listener: (publishers: ScreenPublisherInfo[]) => void): () => void;
  onLocalScreenUnpublished(listener: () => void): () => void;
}

interface AttachedVideoRecord {
  track: RemoteTrack | LocalVideoTrack;
  element: HTMLMediaElement;
  sid: string;
  isLocal: boolean;
}

function isTrackEnded(track: MediaStreamTrack): boolean {
  return track.readyState === 'ended';
}

export function createMediaSession(
  audioRoot: HTMLElement,
  onState: (state: MediaState) => void,
  onAudioBlocked: (blocked: boolean) => void
): MediaSession {
  const room = new Room({ webAudioMix: false, adaptiveStream: true, dynacast: true });
  const audio = new Map<RemoteAudioTrack, { identity: string; element: HTMLMediaElement }>();
  const preferences = new Map<string, { volume: number; muted: boolean }>();
  let microphone: LocalAudioTrack | undefined;
  let localVideoTrack: MediaStreamTrack | undefined;
  let localAudioTrack: MediaStreamTrack | undefined;
  let localVideoPub: LocalTrackPublication | undefined;
  let localAudioPub: LocalTrackPublication | undefined;
  let closed = false;

  let screenStage: HTMLElement | null = null;
  let currentScreenPub: RemoteTrackPublication | null = null;
  let selectedTrackSid: string | null = null;
  let attachedRecord: AttachedVideoRecord | null = null;

  const pendingPermissionCleanups = new Set<() => void>();

  const screenPublications = new Map<
    string,
    { identity: string; trackSid: string; publication: RemoteTrackPublication }
  >();
  const screenListeners = new Set<(publishers: ScreenPublisherInfo[]) => void>();
  const localUnpublishedListeners = new Set<() => void>();

  const isScreenVideoPub = (pub: RemoteTrackPublication) => {
    return (
      pub.kind === Track.Kind.Video &&
      (pub.source === Track.Source.ScreenShare || (pub.source as string) === 'screen_share')
    );
  };

  const checkPermission = (source: Track.Source): boolean => {
    const perms = room.localParticipant?.permissions;
    if (!perms || perms.canPublish !== true) {
      return false;
    }
    // Empty canPublishSources denotes unrestricted publishing in protocol
    if (!perms.canPublishSources || perms.canPublishSources.length === 0) {
      return true;
    }
    const protoSource = Track.sourceToProto(source);
    return perms.canPublishSources.includes(protoSource);
  };

  const awaitScreenPublishPermission = async (signal?: AbortSignal, timeoutMs = 5000): Promise<void> => {
    if (closed) throw new Error('Media session closed');
    if (signal?.aborted) throw new Error('Screen share operation aborted');

    return new Promise<void>((resolve, reject) => {
      let isCleanedUp = false;
      let cleanupFn: () => void = () => {};

      const timer = setTimeout(() => {
        cleanupFn();
        reject(new Error('Timed out awaiting screen publish permission'));
      }, timeoutMs);

      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        clearTimeout(timer);
        room.off(RoomEvent.ParticipantPermissionsChanged, permHandler);
        room.off(RoomEvent.Disconnected, disconnectHandler);
        signal?.removeEventListener('abort', abortHandler);
        pendingPermissionCleanups.delete(closeHandler);
      };
      cleanupFn = cleanup;

      const closeHandler = () => {
        cleanup();
        reject(new Error('Media session closed'));
      };
      pendingPermissionCleanups.add(closeHandler);

      const permHandler = () => {
        if (checkPermission(Track.Source.ScreenShare)) {
          cleanup();
          resolve();
        }
      };

      const disconnectHandler = () => {
        cleanup();
        reject(new Error('Media session disconnected while awaiting screen permission'));
      };

      const abortHandler = () => {
        cleanup();
        reject(new Error('Screen share operation aborted'));
      };

      room.on(RoomEvent.ParticipantPermissionsChanged, permHandler);
      room.on(RoomEvent.Disconnected, disconnectHandler);
      signal?.addEventListener('abort', abortHandler);

      if (checkPermission(Track.Source.ScreenShare)) {
        cleanup();
        resolve();
      }
    });
  };

  const getPublishersList = (): ScreenPublisherInfo[] => {
    const list: ScreenPublisherInfo[] = [];
    if (localVideoPub && room.localParticipant) {
      list.push({
        identity: room.localParticipant.identity,
        trackSid: localVideoPub.trackSid,
        isLocal: true,
      });
    }
    for (const pub of screenPublications.values()) {
      list.push({
        identity: pub.identity,
        trackSid: pub.trackSid,
        isLocal: false,
      });
    }
    return list;
  };

  const notifyPublishers = () => {
    if (closed) return;
    const list = getPublishersList();
    for (const listener of screenListeners) {
      listener(list);
    }
  };

  const detachAttachedVideo = () => {
    if (!attachedRecord) return;
    const { track, element } = attachedRecord;
    element.remove();
    track.detach(element);
    attachedRecord = null;
  };

  const attachVideo = (track: RemoteTrack | LocalVideoTrack, sid: string, isLocal: boolean) => {
    if (!screenStage) return;
    if (
      attachedRecord &&
      attachedRecord.sid === sid &&
      attachedRecord.track === track &&
      screenStage.contains(attachedRecord.element)
    ) {
      return; // Idempotent attachment
    }

    detachAttachedVideo();

    const element = track.attach();
    element.dataset.trackSid = sid;
    if (isLocal) {
      element.muted = true;
      element.setAttribute('playsinline', 'true');
    }

    screenStage.append(element);
    attachedRecord = { track, element, sid, isLocal };
  };

  const volume = (track: RemoteAudioTrack, identity: string) => {
    const preference = preferences.get(identity);
    track.setVolume(preference?.muted ? 0 : preference?.volume ?? 1);
  };

  const attachAudio = (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (closed || track.kind !== Track.Kind.Audio) return;
    const remote = track as RemoteAudioTrack;
    if (audio.has(remote)) return;
    const element = remote.attach();
    element.dataset.mediaIdentity = participant.identity;
    audioRoot.append(element);
    audio.set(remote, { identity: participant.identity, element });
    volume(remote, participant.identity);
  };

  const detachAudio = (track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return;
    const remote = track as RemoteAudioTrack;
    for (const element of remote.detach()) element.remove();
    audio.delete(remote);
  };

  const subscribeAudio = (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (publication.kind !== Track.Kind.Audio) return;
    publication.setSubscribed(true);
    if (publication.track) attachAudio(publication.track, publication, participant);
  };

  const handleTrackPublished = (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (publication.kind === Track.Kind.Audio) {
      subscribeAudio(publication, participant);
    } else if (isScreenVideoPub(publication)) {
      screenPublications.set(publication.trackSid, {
        identity: participant.identity,
        trackSid: publication.trackSid,
        publication,
      });
      notifyPublishers();
    }
  };

  const handleTrackSubscribed = (track: RemoteTrack, publication: RemoteTrackPublication) => {
    if (track.kind === Track.Kind.Audio) {
      return;
    }
    if (isScreenVideoPub(publication)) {
      if (publication.trackSid !== selectedTrackSid) {
        // Obsolete late subscription arriving for unselected track
        publication.setSubscribed(false);
        return;
      }
      attachVideo(track, publication.trackSid, false);
    }
  };

  const handleTrackUnsubscribed = (track: RemoteTrack, publication: RemoteTrackPublication) => {
    if (track.kind === Track.Kind.Audio) {
      detachAudio(track);
    } else if (isScreenVideoPub(publication)) {
      if (attachedRecord && attachedRecord.sid === publication.trackSid) {
        detachAttachedVideo();
      }
    }
  };

  const handleTrackUnpublished = (publication: RemoteTrackPublication) => {
    if (screenPublications.has(publication.trackSid)) {
      screenPublications.delete(publication.trackSid);
      if (selectedTrackSid === publication.trackSid) {
        detachAttachedVideo();
        currentScreenPub = null;
        selectedTrackSid = null;
      }
      notifyPublishers();
    }
  };

  const handleParticipantDisconnected = (participant: RemoteParticipant) => {
    for (const [track, value] of audio) {
      if (value.identity === participant.identity) detachAudio(track);
    }
    let removed = false;
    for (const [sid, info] of Array.from(screenPublications.entries())) {
      if (info.identity === participant.identity) {
        screenPublications.delete(sid);
        removed = true;
        if (selectedTrackSid === sid) {
          detachAttachedVideo();
          currentScreenPub = null;
          selectedTrackSid = null;
        }
      }
    }
    if (removed) {
      notifyPublishers();
    }
  };

  const handleLocalTrackUnpublished = (pubOrTrack: { source?: string; track?: unknown; trackSid?: string }) => {
    const isCurrentVideo =
      Boolean(localVideoPub?.trackSid && pubOrTrack.trackSid && pubOrTrack.trackSid === localVideoPub.trackSid) ||
      Boolean(localVideoPub?.track && pubOrTrack.track && pubOrTrack.track === localVideoPub.track) ||
      Boolean(localVideoTrack && pubOrTrack.track && (pubOrTrack.track === localVideoTrack || (pubOrTrack.track as {mediaStreamTrack?: MediaStreamTrack}).mediaStreamTrack === localVideoTrack));

    if (isCurrentVideo) {
      if (localVideoTrack) {
        try {
          localVideoTrack.stop();
        } catch {
          // Best effort
        }
        localVideoTrack = undefined;
      }
      if (localAudioTrack) {
        try {
          localAudioTrack.stop();
        } catch {
          // Best effort
        }
      }
      localVideoPub = undefined;

      if (attachedRecord?.isLocal) {
        detachAttachedVideo();
      }
      notifyPublishers();
      for (const listener of localUnpublishedListeners) {
        listener();
      }
    }
  };

  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    if (!closed) onState(state as MediaState);
  });
  room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
    if (!closed) onAudioBlocked(!room.canPlaybackAudio);
  });
  room.on(RoomEvent.TrackPublished, handleTrackPublished);
  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    if (track.kind === Track.Kind.Audio) {
      attachAudio(track, publication, participant);
    } else {
      handleTrackSubscribed(track, publication);
    }
  });
  room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
  room.on(RoomEvent.TrackUnpublished, handleTrackUnpublished);
  room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
  room.on(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);
  room.on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant) => {
    if (participant === room.localParticipant) {
      if (localVideoPub && !checkPermission(Track.Source.ScreenShare)) {
        for (const listener of localUnpublishedListeners) {
          listener();
        }
      } else if (localAudioPub && !checkPermission(Track.Source.ScreenShareAudio)) {
        const aPub = localAudioPub;
        const aTrack = localAudioTrack;
        localAudioPub = undefined;
        localAudioTrack = undefined;
        if (aTrack) {
          try {
            aTrack.stop();
          } catch {
            // Best effort
          }
        }
        const target = aPub?.track ?? aTrack;
        if (target) {
          void room.localParticipant.unpublishTrack(target).catch(() => {
            // Best effort
          });
        }
      }
    }
  });

  return {
    async connect(join) {
      if (closed) throw Error('Media session closed');
      onState('connecting');
      await room.connect(join.sfuUrl, join.token, { autoSubscribe: false });
      if (closed) {
        await room.disconnect();
        throw Error('Media session closed');
      }
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (publication.kind === Track.Kind.Audio) {
            subscribeAudio(publication, participant);
          } else if (isScreenVideoPub(publication)) {
            screenPublications.set(publication.trackSid, {
              identity: participant.identity,
              trackSid: publication.trackSid,
              publication,
            });
          }
        }
      }
      notifyPublishers();
      onState('connected');
      onAudioBlocked(!room.canPlaybackAudio);
    },

    async requestMicrophone() {
      if (microphone) return;
      if (closed) throw Error('Media session closed');
      const track = await createLocalAudioTrack();
      if (closed) {
        track.stop();
        throw Error('Media session closed');
      }
      try {
        await track.mute();
        microphone = track;
        await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone });
        if (closed) {
          track.stop();
          throw Error('Media session closed');
        }
      } catch (error) {
        track.stop();
        microphone = undefined;
        throw error;
      }
    },

    async setMicrophone(enabled) {
      if (closed) throw Error('Media session closed');
      if (enabled && !microphone) await this.requestMicrophone();
      await room.localParticipant.setMicrophoneEnabled(enabled);
    },

    setVolume(identity, gain, muted) {
      const value = Math.min(1, Math.max(0, gain));
      preferences.set(identity, { volume: value, muted });
      for (const [track, data] of audio) {
        if (data.identity === identity) volume(track, identity);
      }
    },

    async resumeAudio() {
      if (closed) throw Error('Media session closed');
      await room.startAudio();
      if (!closed) onAudioBlocked(!room.canPlaybackAudio);
    },

    async publishScreenTracks(videoTrack: MediaStreamTrack, audioTrack?: MediaStreamTrack, signal?: AbortSignal) {
      if (closed) throw new Error('Media session closed');
      if (signal?.aborted) throw new Error('Screen share operation aborted');

      await awaitScreenPublishPermission(signal);

      if (closed || signal?.aborted || isTrackEnded(videoTrack)) {
        throw new Error('Screen share operation cancelled before publish');
      }

      localVideoTrack = videoTrack;
      let videoPub: LocalTrackPublication;
      try {
        videoPub = await room.localParticipant.publishTrack(videoTrack, {
          source: Track.Source.ScreenShare,
          screenShareEncoding: { ...ScreenSharePresets.h720fps30.encoding, priority: 'low' },
        });
      } catch (err) {
        localVideoTrack = undefined;
        throw err;
      }

      if (!videoPub || !videoPub.trackSid || !videoPub.track) {
        localVideoTrack = undefined;
        if (videoPub) {
          const rollbackTarget = videoPub.track ?? videoTrack;
          if (rollbackTarget) {
            try {
              await room.localParticipant.unpublishTrack(rollbackTarget);
            } catch {
              // Best effort
            }
          }
        }
        throw new Error('Invalid native publication returned from publishTrack');
      }

      if (closed || signal?.aborted || isTrackEnded(videoTrack)) {
        localVideoTrack = undefined;
        const rollbackTarget = videoPub.track ?? videoTrack;
        if (rollbackTarget) {
          try {
            await room.localParticipant.unpublishTrack(rollbackTarget);
          } catch {
            // Best effort
          }
        }
        throw new Error('Screen share operation cancelled after video publish');
      }

      localVideoPub = videoPub;

      // Optional system audio
      if (audioTrack && !isTrackEnded(audioTrack)) {
        if (checkPermission(Track.Source.ScreenShareAudio)) {
          localAudioTrack = audioTrack;
          let audioPub: LocalTrackPublication | undefined;
          try {
            audioPub = await room.localParticipant.publishTrack(audioTrack, {
              source: Track.Source.ScreenShareAudio,
              audioPreset: AudioPresets.music,
            });
          } catch (err) {
            const vTarget = videoPub.track ?? videoTrack;
            if (vTarget) {
              try {
                await room.localParticipant.unpublishTrack(vTarget);
              } catch {
                // Best effort
              }
            }
            localVideoTrack = undefined;
            localVideoPub = undefined;
            localAudioTrack = undefined;
            localAudioPub = undefined;
            throw err;
          }

          if (closed || signal?.aborted || isTrackEnded(audioTrack)) {
            const aTarget = audioPub?.track ?? audioTrack;
            const vTarget = videoPub.track ?? videoTrack;
            if (aTarget) {
              try {
                await room.localParticipant.unpublishTrack(aTarget);
              } catch {
                // Best effort
              }
            }
            if (vTarget) {
              try {
                await room.localParticipant.unpublishTrack(vTarget);
              } catch {
                // Best effort
              }
            }
            localVideoTrack = undefined;
            localVideoPub = undefined;
            localAudioTrack = undefined;
            localAudioPub = undefined;
            throw new Error('Screen share operation cancelled after audio publish');
          }

          localAudioPub = audioPub;
        } else {
          try {
            audioTrack.stop();
          } catch {
            // Best effort
          }
        }
      }

      notifyPublishers();
    },

    async unpublishScreenTracks() {
      if (closed) return;
      const vTrack = localVideoTrack;
      const vPub = localVideoPub;
      const aTrack = localAudioTrack;
      const aPub = localAudioPub;

      localVideoTrack = undefined;
      localVideoPub = undefined;
      localAudioTrack = undefined;
      localAudioPub = undefined;

      if (vTrack) {
        try {
          vTrack.stop();
        } catch {
          // Best effort
        }
      }
      if (aTrack) {
        try {
          aTrack.stop();
        } catch {
          // Best effort
        }
      }

      const aTarget = aPub?.track ?? aTrack;
      if (aTarget) {
        try {
          await room.localParticipant.unpublishTrack(aTarget);
        } catch {
          // Best effort
        }
      }

      const vTarget = vPub?.track ?? vTrack;
      if (vTarget) {
        try {
          await room.localParticipant.unpublishTrack(vTarget);
        } catch {
          // Best effort
        }
      }

      if (attachedRecord?.isLocal) {
        detachAttachedVideo();
      }
      notifyPublishers();
    },

    selectScreen(trackSid: string | null) {
      if (closed) return;
      if (selectedTrackSid === trackSid) return;

      if (currentScreenPub) {
        currentScreenPub.setSubscribed(false);
        currentScreenPub = null;
      }

      detachAttachedVideo();
      selectedTrackSid = trackSid;

      if (trackSid) {
        if (localVideoPub && trackSid === localVideoPub.trackSid) {
          const localTrack = localVideoPub.track as LocalVideoTrack;
          if (localTrack) {
            attachVideo(localTrack, trackSid, true);
          }
          return;
        }

        const info = screenPublications.get(trackSid);
        if (info) {
          currentScreenPub = info.publication;
          info.publication.setSubscribed(true);
          if (info.publication.track) {
            attachVideo(info.publication.track, trackSid, false);
          }
        }
      }
    },

    getSelectedScreenSid() {
      return selectedTrackSid;
    },

    getScreenPublishers() {
      return getPublishersList();
    },

    setScreenStage(container: HTMLElement | null) {
      if (screenStage && attachedRecord) {
        detachAttachedVideo();
      }
      screenStage = container;
      if (screenStage && selectedTrackSid) {
        if (localVideoPub && selectedTrackSid === localVideoPub.trackSid) {
          const localTrack = localVideoPub.track as LocalVideoTrack;
          if (localTrack) attachVideo(localTrack, selectedTrackSid, true);
        } else if (currentScreenPub?.track) {
          attachVideo(currentScreenPub.track, selectedTrackSid, false);
        }
      }
    },

    onScreenPublishers(listener: (publishers: ScreenPublisherInfo[]) => void) {
      screenListeners.add(listener);
      return () => {
        screenListeners.delete(listener);
      };
    },

    onLocalScreenUnpublished(listener: () => void) {
      localUnpublishedListeners.add(listener);
      return () => {
        localUnpublishedListeners.delete(listener);
      };
    },

    async disconnect() {
      closed = true;
      for (const closeHandler of pendingPermissionCleanups) {
        closeHandler();
      }
      pendingPermissionCleanups.clear();

      microphone?.stop();
      microphone = undefined;

      if (localVideoTrack) {
        try {
          localVideoTrack.stop();
        } catch {
          // Best effort
        }
        localVideoTrack = undefined;
      }
      if (localAudioTrack) {
        try {
          localAudioTrack.stop();
        } catch {
          // Best effort
        }
        localAudioTrack = undefined;
      }
      localVideoPub = undefined;
      localAudioPub = undefined;

      for (const [track] of audio) detachAudio(track);
      detachAttachedVideo();
      screenPublications.clear();
      screenListeners.clear();
      localUnpublishedListeners.clear();
      room.removeAllListeners();
      await room.disconnect();
      preferences.clear();
    },
  };
}
