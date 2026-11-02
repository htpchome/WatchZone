import type { ReactiveController, ReactiveControllerHost } from "lit";

import { getClientEnvironment } from "../../../core/client-environment";
import {
  playMediaElement,
  setMediaElementDefaultMuted,
  setMediaElementRuntimeMuted,
} from "../../../core/media-playback";
import { getMediaSessionManager } from "../../../core/media-session-manager";

interface AudioMediaState {
  readonly hls?: HTMLVideoElement;
  readonly selected?: "hls" | "webrtc";
  readonly webRtc?: HTMLVideoElement;
}

interface AudioControllerCallbacks {
  dismissMessage(): void;
  getMediaState(): AudioMediaState;
  showAutoplayWarning(): void;
}

function documentIsHidden(): boolean {
  return document.hidden === true || document.visibilityState === "hidden";
}

function isAutoplayDenied(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotAllowedError"
  );
}

/** Owns camera audio intent, forced mute, and autoplay recovery. */
export class CameraAudioController implements ReactiveController {
  private _activeVideo?: HTMLVideoElement;
  private _autoplayBlocked = false;
  private _desiredMuted = true;
  private _entityId?: string;
  private _explicitPreference = false;
  private _muted = true;
  private _startUnmutedPcTablet = false;
  private _startUnmutedPhone = false;
  private readonly _environment = getClientEnvironment();

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _callbacks: AudioControllerCallbacks,
  ) {
    _host.addController(this);
  }

  public get muted(): boolean {
    return this._muted;
  }

  public hostConnected(): void {
    document.addEventListener("visibilitychange", this._handleVisibilityChange);
    this._syncPreference();
  }

  public hostDisconnected(): void {
    document.removeEventListener(
      "visibilitychange",
      this._handleVisibilityChange,
    );
  }

  public configure(
    entityId: string | undefined,
    startUnmutedPcTablet: boolean,
    startUnmutedPhone: boolean,
    resetPreference: boolean,
  ): void {
    const sourceChanged = this._entityId !== entityId;
    this._entityId = entityId;
    this._startUnmutedPcTablet = startUnmutedPcTablet;
    this._startUnmutedPhone = startUnmutedPhone;
    if (sourceChanged || resetPreference) this._syncPreference();
  }

  public applyTo(video: HTMLVideoElement, muted = this._muted): void {
    setMediaElementRuntimeMuted(video, muted);
  }

  public captureAutoplayFallback(video: HTMLVideoElement | undefined): void {
    if (!video || this._desiredMuted || documentIsHidden() || !video.muted) {
      return;
    }
    this._autoplayBlocked = true;
    this._callbacks.showAutoplayWarning();
    this._syncEffectiveMute(false);
  }

  public handleActiveVideoChanged(video: HTMLVideoElement | undefined): void {
    const previous = this._activeVideo;
    if (previous && previous !== video) {
      setMediaElementRuntimeMuted(previous, true);
    }
    this._activeVideo = video;
    if (video && this._explicitPreference) {
      setMediaElementDefaultMuted(video, this._desiredMuted);
    }
    // Initial playback belongs to the presentation attachment path. Keeping
    // it there guarantees one autoplay attempt per attachment.
    this._syncEffectiveMute(false);
  }

  public async requestPlayback(video: HTMLVideoElement): Promise<void> {
    this.applyTo(video);
    try {
      await playMediaElement(video);
    } catch (error) {
      if (
        !this._owns(video) ||
        this._desiredMuted ||
        documentIsHidden() ||
        !isAutoplayDenied(error)
      ) {
        return;
      }
      this._autoplayBlocked = true;
      this._callbacks.showAutoplayWarning();
      this._syncEffectiveMute(false);
      if (this._owns(video) && video.muted) {
        try {
          await playMediaElement(video);
        } catch {
          // Audible denial must not leave otherwise usable video paused.
        }
      }
    }
  }

  public toggleUserMute(): void {
    this._callbacks.dismissMessage();
    this._desiredMuted = !this._muted;
    this._autoplayBlocked = false;
    this._explicitPreference = true;
    if (this._entityId) {
      getMediaSessionManager().setCameraMuted(
        this._entityId,
        this._desiredMuted,
      );
    }
    const active = this._activeVideo;
    if (active) setMediaElementDefaultMuted(active, this._desiredMuted);
    this._syncEffectiveMute(!this._desiredMuted);
  }

  public syncMediaState(): void {
    const { hls, selected, webRtc } = this._callbacks.getMediaState();
    if (webRtc) this.applyTo(webRtc, selected === "hls" || this._muted);
    if (hls) this.applyTo(hls, selected === "webrtc" || this._muted);
  }

  private _owns(video: HTMLVideoElement): boolean {
    const { hls, webRtc } = this._callbacks.getMediaState();
    return this._activeVideo === video || hls === video || webRtc === video;
  }

  private _syncPreference(): void {
    this._autoplayBlocked = false;
    this._callbacks.dismissMessage();
    this._explicitPreference = false;
    if (!this._entityId) {
      this._desiredMuted = true;
    } else {
      const startsUnmuted = this._environment.isPhone
        ? this._startUnmutedPhone
        : this._startUnmutedPcTablet;
      const manager = getMediaSessionManager();
      this._explicitPreference =
        manager.getCameraMutePreference(this._entityId) !== undefined;
      this._desiredMuted = manager.getCameraMuted(
        this._entityId,
        !startsUnmuted,
      );
    }
    this._syncEffectiveMute(false);
  }

  private _syncEffectiveMute(attemptPlayback: boolean): void {
    const next =
      this._desiredMuted || this._autoplayBlocked || documentIsHidden();
    const changed = next !== this._muted;
    this._muted = next;
    this.syncMediaState();
    if (changed) this._host.requestUpdate();
    const active = this._activeVideo;
    if (!next && attemptPlayback && active) void this.requestPlayback(active);
  }

  private readonly _handleVisibilityChange = (): void => {
    this._syncEffectiveMute(document.visibilityState === "visible");
  };
}
