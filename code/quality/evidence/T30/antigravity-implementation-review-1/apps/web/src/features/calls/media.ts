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

  publishScreenTracks(videoTrack: MediaStreamTrack, audioTrack?: MediaStreamTrack): Promise<void>;
  unpublishScreenTracks(): Promise<void>;
  selectScreen(trackSid: string | null): void;
  getSelectedScreenSid(): string | null;
  getScreenPublishers(): ScreenPublisherInfo[];
  setScreenStage(container: HTMLElement | null): void;
  onScreenPublishers(listener: (publishers: ScreenPublisherInfo[]) => void): () => void;
  onLocalScreenUnpublished(listener: () => void): () => void;
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
  let currentScreenTrack: RemoteTrack | null = null;
  let currentScreenPub: RemoteTrackPublication | null = null;
  let selectedTrackSid: string | null = null;
  let attachedElement: HTMLMediaElement | null = null;
  let attachedTrackSid: string | null = null;

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

  const checkScreenPermission = (perms: unknown): boolean => {
    if (!perms || typeof perms !== 'object') return true;
    const p = perms as { canPublish?: boolean; canPublishSources?: unknown[] };
    if (p.canPublish === false) return false;
    if (Array.isArray(p.canPublishSources) && p.canPublishSources.length > 0) {
      const screenProto = Track.sourceToProto ? Track.sourceToProto(Track.Source.ScreenShare) : 3;
      return p.canPublishSources.some((s) => s === screenProto || s === Track.Source.ScreenShare || s === 'screen_share');
    }
    return true;
  };

  const checkScreenAudioPermission = (perms: unknown): boolean => {
    if (!perms || typeof perms !== 'object') return true;
    const p = perms as { canPublish?: boolean; canPublishSources?: unknown[] };
    if (p.canPublish === false) return false;
    if (Array.isArray(p.canPublishSources) && p.canPublishSources.length > 0) {
      const audioProto = Track.sourceToProto ? Track.sourceToProto(Track.Source.ScreenShareAudio) : 4;
      return p.canPublishSources.some((s) => s === audioProto || s === Track.Source.ScreenShareAudio || s === 'screen_share_audio');
    }
    return true;
  };

  const awaitScreenPublishPermission = async (timeoutMs = 5000): Promise<void> => {
    if (closed) throw new Error('Media session closed');
    if (checkScreenPermission(room.localParticipant?.permissions)) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        room.off(RoomEvent.ParticipantPermissionsChanged, handler);
        room.off(RoomEvent.Disconnected, disconnectHandler);
      };

      const handler = () => {
        if (checkScreenPermission(room.localParticipant?.permissions)) {
          cleanup();
          resolve();
        }
      };

      const disconnectHandler = () => {
        cleanup();
        reject(new Error('Media session disconnected while awaiting screen permission'));
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out awaiting screen publish permission'));
      }, timeoutMs);

      room.on(RoomEvent.ParticipantPermissionsChanged, handler);
      room.on(RoomEvent.Disconnected, disconnectHandler);
    });
  };

  const getPublishersList = (): ScreenPublisherInfo[] => {
    const list: ScreenPublisherInfo[] = [];
    if (localVideoPub && room.localParticipant) {
      list.push({
        identity: room.localParticipant.identity,
        trackSid: localVideoPub.trackSid || 'local-screen',
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

  const detachCurrentVideo = () => {
    if (attachedElement) {
      attachedElement.remove();
      attachedElement = null;
    }
    if (currentScreenTrack) {
      for (const el of currentScreenTrack.detach()) {
        el.remove();
      }
      currentScreenTrack = null;
    }
    attachedTrackSid = null;
  };

  const attachVideoTrack = (track: RemoteTrack | MediaStreamTrack, sid: string) => {
    if (!screenStage) return;
    if (attachedTrackSid === sid && attachedElement && screenStage.contains(attachedElement)) {
      return;
    }
    detachCurrentVideo();
    attachedTrackSid = sid;

    if ('attach' in track && typeof track.attach === 'function') {
      const el = track.attach();
      el.dataset.trackSid = sid;
      screenStage.append(el);
      attachedElement = el;
    } else {
      const el = document.createElement('video');
      el.srcObject = new MediaStream([track]);
      el.autoplay = true;
      el.muted = true;
      el.dataset.trackSid = sid;
      screenStage.append(el);
      attachedElement = el;
    }
  };

  const volume = (track: RemoteAudioTrack, identity: string) => {
    const preference = preferences.get(identity);
    track.setVolume(preference?.muted ? 0 : preference?.volume ?? 1);
  };

  const attach = (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (closed || track.kind !== Track.Kind.Audio) return;
    const remote = track as RemoteAudioTrack;
    if (audio.has(remote)) return;
    const element = remote.attach();
    element.dataset.mediaIdentity = participant.identity;
    audioRoot.append(element);
    audio.set(remote, { identity: participant.identity, element });
    volume(remote, participant.identity);
  };

  const detach = (track: RemoteTrack) => {
    if (track.kind !== Track.Kind.Audio) return;
    const remote = track as RemoteAudioTrack;
    for (const element of remote.detach()) element.remove();
    audio.delete(remote);
  };

  const subscribe = (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (publication.kind !== Track.Kind.Audio) return;
    publication.setSubscribed(true);
    if (publication.track) attach(publication.track, publication, participant);
  };

  const handleTrackPublished = (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (publication.kind === Track.Kind.Audio) {
      subscribe(publication, participant);
    } else if (isScreenVideoPub(publication)) {
      screenPublications.set(publication.trackSid, {
        identity: participant.identity,
        trackSid: publication.trackSid,
        publication,
      });
      notifyPublishers();
    }
  };

  const handleTrackSubscribed = (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    if (track.kind === Track.Kind.Audio) {
      attach(track, publication, participant);
    } else if (isScreenVideoPub(publication)) {
      if (publication.trackSid !== selectedTrackSid) {
        // Late obsolete subscription arriving for unselected track: unsubscribe and do not attach
        publication.setSubscribed(false);
        return;
      }
      currentScreenTrack = track;
      attachVideoTrack(track, publication.trackSid);
    }
  };

  const handleTrackUnsubscribed = (track: RemoteTrack, publication: RemoteTrackPublication) => {
    if (track.kind === Track.Kind.Audio) {
      detach(track);
    } else if (isScreenVideoPub(publication)) {
      if (attachedTrackSid === publication.trackSid) {
        detachCurrentVideo();
      }
    }
  };

  const handleTrackUnpublished = (publication: RemoteTrackPublication) => {
    if (screenPublications.has(publication.trackSid)) {
      screenPublications.delete(publication.trackSid);
      if (selectedTrackSid === publication.trackSid) {
        detachCurrentVideo();
        currentScreenPub = null;
        selectedTrackSid = null;
      }
      notifyPublishers();
    }
  };

  const handleParticipantDisconnected = (participant: RemoteParticipant) => {
    for (const [track, value] of audio) {
      if (value.identity === participant.identity) detach(track);
    }
    let removed = false;
    for (const [sid, info] of Array.from(screenPublications.entries())) {
      if (info.identity === participant.identity) {
        screenPublications.delete(sid);
        removed = true;
        if (selectedTrackSid === sid) {
          detachCurrentVideo();
          currentScreenPub = null;
          selectedTrackSid = null;
        }
      }
    }
    if (removed) {
      notifyPublishers();
    }
  };

  const handleLocalTrackUnpublished = (pubOrTrack: { source?: string; track?: unknown }) => {
    const isScreen =
      pubOrTrack.source === Track.Source.ScreenShare ||
      (pubOrTrack.source as string) === 'screen_share' ||
      pubOrTrack.track === localVideoTrack ||
      (pubOrTrack as LocalTrackPublication).trackSid === localVideoPub?.trackSid;

    if (isScreen) {
      localVideoTrack = undefined;
      localVideoPub = undefined;
      localAudioTrack = undefined;
      localAudioPub = undefined;
      if (selectedTrackSid && selectedTrackSid === 'local-screen') {
        detachCurrentVideo();
        selectedTrackSid = null;
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
  room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
  room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
  room.on(RoomEvent.TrackUnpublished, handleTrackUnpublished);
  room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
  room.on(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished);
  room.on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant) => {
    if (participant === room.localParticipant && localVideoTrack) {
      if (!checkScreenPermission(room.localParticipant.permissions)) {
        for (const listener of localUnpublishedListeners) {
          listener();
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
            subscribe(publication, participant);
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

    async publishScreenTracks(videoTrack: MediaStreamTrack, audioTrack?: MediaStreamTrack) {
      if (closed) throw Error('Media session closed');

      await awaitScreenPublishPermission();

      if (videoTrack.readyState === 'ended') {
        throw new Error('Video track ended before publication');
      }

      localVideoTrack = videoTrack;
      let videoPub: LocalTrackPublication;
      try {
        videoPub = await room.localParticipant.publishTrack(videoTrack, {
          source: Track.Source.ScreenShare,
          videoEncoding: ScreenSharePresets?.h720fps30?.encoding,
        });
        localVideoPub = videoPub;
      } catch (err) {
        localVideoTrack = undefined;
        throw err;
      }

      if (audioTrack && audioTrack.readyState !== 'ended' && checkScreenAudioPermission(room.localParticipant?.permissions)) {
        localAudioTrack = audioTrack;
        try {
          localAudioPub = await room.localParticipant.publishTrack(audioTrack, {
            source: Track.Source.ScreenShareAudio,
            audioPreset: AudioPresets?.music,
          });
        } catch (err) {
          try {
            await room.localParticipant.unpublishTrack(videoTrack);
          } catch {
            // Best effort rollback
          }
          localVideoTrack = undefined;
          localVideoPub = undefined;
          localAudioTrack = undefined;
          localAudioPub = undefined;
          throw err;
        }
      }

      notifyPublishers();
    },

    async unpublishScreenTracks() {
      if (closed) return;
      const vTrack = localVideoTrack;
      const aTrack = localAudioTrack;
      localVideoTrack = undefined;
      localAudioTrack = undefined;
      localVideoPub = undefined;
      localAudioPub = undefined;

      if (aTrack) {
        try {
          await room.localParticipant.unpublishTrack(aTrack);
        } catch {
          // Best effort
        }
      }
      if (vTrack) {
        try {
          await room.localParticipant.unpublishTrack(vTrack);
        } catch {
          // Best effort
        }
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
      detachCurrentVideo();
      selectedTrackSid = trackSid;

      if (trackSid) {
        if (localVideoPub && trackSid === (localVideoPub.trackSid || 'local-screen')) {
          if (localVideoTrack) {
            attachVideoTrack(localVideoTrack, trackSid);
          }
          return;
        }

        const info = screenPublications.get(trackSid);
        if (info) {
          currentScreenPub = info.publication;
          info.publication.setSubscribed(true);
          if (info.publication.track) {
            currentScreenTrack = info.publication.track;
            attachVideoTrack(info.publication.track, trackSid);
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
      if (screenStage && attachedElement) {
        detachCurrentVideo();
      }
      screenStage = container;
      if (screenStage && selectedTrackSid) {
        if (localVideoPub && selectedTrackSid === (localVideoPub.trackSid || 'local-screen')) {
          if (localVideoTrack) attachVideoTrack(localVideoTrack, selectedTrackSid);
        } else if (currentScreenTrack) {
          attachVideoTrack(currentScreenTrack, selectedTrackSid);
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
      microphone?.stop();
      microphone = undefined;
      if (localVideoTrack) {
        localVideoTrack.stop();
        localVideoTrack = undefined;
      }
      if (localAudioTrack) {
        localAudioTrack.stop();
        localAudioTrack = undefined;
      }
      localVideoPub = undefined;
      localAudioPub = undefined;
      for (const [track] of audio) detach(track);
      detachCurrentVideo();
      screenPublications.clear();
      screenListeners.clear();
      localUnpublishedListeners.clear();
      room.removeAllListeners();
      await room.disconnect();
      preferences.clear();
    },
  };
}
