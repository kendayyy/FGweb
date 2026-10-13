import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack,
  type LocalAudioTrack,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type RemoteTrack,
} from 'livekit-client';
import type { CallJoinDTO } from '@fg/contracts';

export type MediaState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ScreenPublisherInfo {
  identity: string;
  trackSid: string;
}

export interface MediaSession {
  connect(join: CallJoinDTO): Promise<void>;
  requestMicrophone(): Promise<void>;
  setMicrophone(enabled: boolean): Promise<void>;
  setVolume(identity: string, volume: number, muted: boolean): void;
  resumeAudio(): Promise<void>;
  disconnect(): Promise<void>;

  publishScreenTrack(track: MediaStreamTrack): Promise<void>;
  unpublishScreenTrack(): Promise<void>;
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
  let localScreenTrack: MediaStreamTrack | undefined;
  let closed = false;

  let screenStage: HTMLElement | null = null;
  let currentScreenTrack: RemoteTrack | null = null;
  let currentScreenPub: RemoteTrackPublication | null = null;
  let selectedTrackSid: string | null = null;

  const screenPublications = new Map<
    string,
    { identity: string; trackSid: string; publication: RemoteTrackPublication }
  >();
  const screenListeners = new Set<(publishers: ScreenPublisherInfo[]) => void>();
  const localUnpublishedListeners = new Set<() => void>();

  const getPublishersList = (): ScreenPublisherInfo[] => {
    return Array.from(screenPublications.values()).map((p) => ({
      identity: p.identity,
      trackSid: p.trackSid,
    }));
  };

  const notifyPublishers = () => {
    if (closed) return;
    const list = getPublishersList();
    for (const listener of screenListeners) {
      listener(list);
    }
  };

  const attachScreenVideo = (track: RemoteTrack) => {
    if (!screenStage) return;
    const element = track.attach();
    screenStage.append(element);
  };

  const detachScreenVideo = (track: RemoteTrack) => {
    for (const element of track.detach()) {
      element.remove();
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
    } else if (publication.kind === Track.Kind.Video || publication.source === Track.Source.ScreenShare) {
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
    } else if (track.kind === Track.Kind.Video || publication.source === Track.Source.ScreenShare) {
      if (publication.trackSid !== selectedTrackSid) {
        return;
      }
      if (currentScreenTrack && currentScreenTrack !== track) {
        detachScreenVideo(currentScreenTrack);
      }
      currentScreenTrack = track;
      attachScreenVideo(track);
    }
  };

  const handleTrackUnsubscribed = (track: RemoteTrack, publication: RemoteTrackPublication) => {
    if (track.kind === Track.Kind.Audio) {
      detach(track);
    } else if (track.kind === Track.Kind.Video || publication.source === Track.Source.ScreenShare) {
      if (currentScreenTrack === track) {
        detachScreenVideo(track);
        currentScreenTrack = null;
      }
    }
  };

  const handleTrackUnpublished = (publication: RemoteTrackPublication) => {
    if (screenPublications.has(publication.trackSid)) {
      screenPublications.delete(publication.trackSid);
      if (selectedTrackSid === publication.trackSid) {
        if (currentScreenTrack) {
          detachScreenVideo(currentScreenTrack);
          currentScreenTrack = null;
        }
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
          if (currentScreenTrack) {
            detachScreenVideo(currentScreenTrack);
            currentScreenTrack = null;
          }
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
    if (pubOrTrack.source === Track.Source.ScreenShare || pubOrTrack.track === localScreenTrack) {
      localScreenTrack = undefined;
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
          } else if (publication.kind === Track.Kind.Video || publication.source === Track.Source.ScreenShare) {
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

    async publishScreenTrack(track: MediaStreamTrack) {
      if (closed) throw Error('Media session closed');
      localScreenTrack = track;
      await room.localParticipant.publishTrack(track, { source: Track.Source.ScreenShare });
    },

    async unpublishScreenTrack() {
      if (closed || !localScreenTrack) return;
      const track = localScreenTrack;
      localScreenTrack = undefined;
      await room.localParticipant.unpublishTrack(track);
    },

    selectScreen(trackSid: string | null) {
      if (closed) return;
      if (selectedTrackSid === trackSid) return;

      if (currentScreenPub) {
        currentScreenPub.setSubscribed(false);
      }
      if (currentScreenTrack) {
        detachScreenVideo(currentScreenTrack);
        currentScreenTrack = null;
      }
      currentScreenPub = null;
      selectedTrackSid = trackSid;

      if (trackSid) {
        const info = screenPublications.get(trackSid);
        if (info) {
          currentScreenPub = info.publication;
          info.publication.setSubscribed(true);
          if (info.publication.track) {
            currentScreenTrack = info.publication.track;
            attachScreenVideo(info.publication.track);
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
      if (screenStage && currentScreenTrack) {
        detachScreenVideo(currentScreenTrack);
      }
      screenStage = container;
      if (screenStage && currentScreenTrack) {
        attachScreenVideo(currentScreenTrack);
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
      if (localScreenTrack) {
        localScreenTrack.stop();
        localScreenTrack = undefined;
      }
      for (const [track] of audio) detach(track);
      if (currentScreenTrack) {
        detachScreenVideo(currentScreenTrack);
        currentScreenTrack = null;
      }
      screenPublications.clear();
      screenListeners.clear();
      localUnpublishedListeners.clear();
      room.removeAllListeners();
      await room.disconnect();
      preferences.clear();
    },
  };
}
