import type { ReactiveController, ReactiveControllerHost } from "lit";

import { DeviceProfileController } from "../../../core/device-profile";
import {
  playMediaElement,
  setMediaElementMuted,
} from "../../../core/media-playback";
import { getMediaSessionManager } from "../../../core/media-session-manager";
import type { PresentedSource } from "./session.controller";

interface AudioMediaState {
  readonly hls?: HTMLVideoElement;
  readonly selected?: PresentedSource;
  readonly webRtc?: HTMLVideoElement;
}

interface AudioCallbacks {
  clearError(): void;
  getMediaState(): AudioMediaState;
  showError(message: string): void;
}

/** Owns configured audio defaults, user intent, and temporary forced mute. */
export class CameraAudioController implements ReactiveController {
  private _activeVideo?: HTMLVideoElement;
  private _autoplayBlocked = false;
  private _desiredMuted = true;
  private _entityId?: string;
  private _muted = true;
  private _startUnmutedPcTablet = false;
  private _startUnmutedPhone = false;
  private readonly _deviceProfile: DeviceProfileController;

  public constructor(
    private readonly _host: ReactiveControllerHost & HTMLElement,
    private readonly _callbacks: AudioCallbacks,
  ) {
    _host.addController(this);
    this._deviceProfile = new DeviceProfileController(_host);
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
    this.handleActiveVideoChanged(undefined);
  }

  public configure(
    entityId: string | undefined,
    startUnmutedPcTablet: boolean,
    startUnmutedPhone: boolean,
    reset: boolean,
  ): void {
    const sourceChanged = this._entityId !== entityId;
    this._entityId = entityId;
    this._startUnmutedPcTablet = startUnmutedPcTablet;
    this._startUnmutedPhone = startUnmutedPhone;
    if (sourceChanged || reset) this._syncPreference();
  }

  public handleActiveVideoChanged(video: HTMLVideoElement | undefined): void {
    if (this._activeVideo === video) return;
    if (this._activeVideo) setMediaElementMuted(this._activeVideo, true);
    this._activeVideo = video;
    this._syncEffectiveMute(Boolean(video));
  }

  public syncMediaState(): void {
    const { hls, selected, webRtc } = this._callbacks.getMediaState();
    if (webRtc) {
      setMediaElementMuted(
        webRtc,
        selected && selected !== "webrtc" ? true : this._muted,
      );
    }
    if (hls) {
      setMediaElementMuted(hls, selected === "webrtc" ? true : this._muted);
    }
  }

  public toggleUserMute(): void {
    this._callbacks.clearError();
    this._desiredMuted = !this._muted;
    this._autoplayBlocked = false;
    if (this._entityId) {
      getMediaSessionManager().setCameraMuted(
        this._entityId,
        this._desiredMuted,
      );
    }
    this._syncEffectiveMute(!this._desiredMuted);
  }

  private _syncPreference(): void {
    this._autoplayBlocked = false;
    this._callbacks.clearError();
    if (!this._entityId) {
      this._desiredMuted = true;
    } else {
      const startsUnmuted =
        this._deviceProfile.profile.deviceClass === "phone"
          ? this._startUnmutedPhone
          : this._startUnmutedPcTablet;
      this._desiredMuted = getMediaSessionManager().getCameraMuted(
        this._entityId,
        !startsUnmuted,
      );
    }
    this._syncEffectiveMute(false);
  }

  private _syncEffectiveMute(attemptPlayback: boolean): void {
    const muted =
      this._desiredMuted ||
      this._autoplayBlocked ||
      document.visibilityState !== "visible";
    const changed = muted !== this._muted;
    this._muted = muted;
    this.syncMediaState();
    if (changed) this._host.requestUpdate();
    if (!muted && attemptPlayback && this._activeVideo) {
      const video = this._activeVideo;
      void playMediaElement(video).catch(() => {
        if (
          this._activeVideo !== video ||
          this._desiredMuted ||
          document.visibilityState !== "visible"
        )
          return;
        this._autoplayBlocked = true;
        this._callbacks.showError(
          "The browser blocked unmuted playback. Tap mute again to retry.",
        );
        this._syncEffectiveMute(false);
      });
    }
  }

  private readonly _handleVisibilityChange = (): void => {
    this._syncEffectiveMute(document.visibilityState === "visible");
  };
}
