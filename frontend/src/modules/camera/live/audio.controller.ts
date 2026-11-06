import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { PresentedLiveSource } from "../../../core/camera-connection-source";
import { DeviceProfileController } from "../../../core/device-profile";
import {
  playMediaElement,
  setMediaElementMuted,
} from "../../../core/media-playback";
import { getMediaSessionManager } from "../../../core/media-session-manager";

interface AudioMediaState {
  readonly element?: HTMLVideoElement;
  readonly selected?: PresentedLiveSource;
  readonly webRtc?: HTMLVideoElement;
}

interface AudioCallbacks {
  dismissToast(key: string): void;
  getAutoplayWarning(): string;
  getMediaState(): AudioMediaState;
  showWarning(message: string, key: string): void;
}

const AUTOPLAY_WARNING_KEY = "camera-audio-autoplay";
type ForcedMuteReason =
  | "camera-inactive"
  | "document-frozen"
  | "document-hidden"
  | "page-hidden"
  | "presentation-detached";

/** Owns configured audio defaults, user intent, and temporary forced mute. */
export class CameraAudioController implements ReactiveController {
  private _activeVideo?: HTMLVideoElement;
  private _autoplayBlocked = false;
  private _desiredMuted = true;
  private _entityId?: string;
  private readonly _forcedMuteReasons = new Set<ForcedMuteReason>();
  private _muted = true;
  private _startUnmutedPcTablet = false;
  private _startUnmutedPhone = false;
  private _talkAudioActive = false;
  private _talkUnmuteOverride = false;
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
    document.addEventListener("freeze", this._handleFreeze);
    document.addEventListener("resume", this._handleResume);
    window.addEventListener("pagehide", this._handlePageHide);
    window.addEventListener("pageshow", this._handlePageShow);
    this._forcedMuteReasons.clear();
    this._setForcedMute(
      "document-hidden",
      document.visibilityState !== "visible",
      false,
    );
    this._syncPreference();
  }

  public hostDisconnected(): void {
    document.removeEventListener(
      "visibilitychange",
      this._handleVisibilityChange,
    );
    document.removeEventListener("freeze", this._handleFreeze);
    document.removeEventListener("resume", this._handleResume);
    window.removeEventListener("pagehide", this._handlePageHide);
    window.removeEventListener("pageshow", this._handlePageShow);
    this._talkAudioActive = false;
    this._talkUnmuteOverride = false;
    this.handleActiveVideoChanged(undefined);
  }

  public configure(
    entityId: string | undefined,
    startUnmutedPcTablet: boolean,
    startUnmutedPhone: boolean,
    reset: boolean,
    presentationActive = true,
  ): void {
    const sourceChanged = this._entityId !== entityId;
    if (sourceChanged) {
      this._talkAudioActive = false;
      this._talkUnmuteOverride = false;
    }
    this._entityId = entityId;
    this._startUnmutedPcTablet = startUnmutedPcTablet;
    this._startUnmutedPhone = startUnmutedPhone;
    this._setForcedMute("camera-inactive", !presentationActive, false);
    if (sourceChanged || reset) this._syncPreference();
  }

  public handleActiveVideoChanged(video: HTMLVideoElement | undefined): void {
    if (this._activeVideo === video) return;
    if (this._activeVideo) setMediaElementMuted(this._activeVideo, true);
    if (video) this._forcedMuteReasons.delete("presentation-detached");
    else if (this._activeVideo)
      this._forcedMuteReasons.add("presentation-detached");
    this._activeVideo = video;
    this._syncEffectiveMute(Boolean(video));
  }

  public syncMediaState(): void {
    const { element, selected, webRtc } = this._callbacks.getMediaState();
    if (webRtc) {
      setMediaElementMuted(
        webRtc,
        selected && selected !== "webrtc" ? true : this._muted,
      );
    }
    if (element) {
      setMediaElementMuted(element, selected === "webrtc" ? true : this._muted);
    }
  }

  public toggleUserMute(): void {
    // User intent is independent from temporary forced mute and talk state.
    // Toggling the effective value can never unmute while either is active.
    this.setUserMuted(!this._desiredMuted);
  }

  public setUserMuted(muted: boolean): void {
    this._callbacks.dismissToast(AUTOPLAY_WARNING_KEY);
    if (this._talkAudioActive) this._talkUnmuteOverride = false;
    this._desiredMuted = muted;
    this._autoplayBlocked = false;
    if (this._entityId) {
      getMediaSessionManager().setCameraMuted(
        this._entityId,
        this._desiredMuted,
      );
    }
    this._syncEffectiveMute(!this._desiredMuted);
  }

  public setTalkAudioActive(active: boolean): void {
    if (this._talkAudioActive === active) return;
    this._talkAudioActive = active;
    this._talkUnmuteOverride = active;
    if (active) {
      this._callbacks.dismissToast(AUTOPLAY_WARNING_KEY);
      this._autoplayBlocked = false;
    }
    this._syncEffectiveMute(active);
  }

  private _syncPreference(): void {
    this._autoplayBlocked = false;
    this._callbacks.dismissToast(AUTOPLAY_WARNING_KEY);
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
      (this._talkUnmuteOverride ? false : this._desiredMuted) ||
      this._autoplayBlocked ||
      this._forcedMuteReasons.size > 0;
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
          this._forcedMuteReasons.size > 0
        )
          return;
        this._autoplayBlocked = true;
        this._callbacks.showWarning(
          this._callbacks.getAutoplayWarning(),
          AUTOPLAY_WARNING_KEY,
        );
        this._syncEffectiveMute(false);
        // Audible autoplay rejection must not leave video paused. Preserve the
        // user's unmuted intent, apply the temporary forced mute above, then
        // retry the same retained element under the browser's muted-autoplay
        // policy.
        void playMediaElement(video).catch(() => undefined);
      });
    }
  }

  private readonly _handleVisibilityChange = (): void => {
    this._setForcedMute(
      "document-hidden",
      document.visibilityState !== "visible",
      document.visibilityState === "visible",
    );
  };

  private readonly _handleFreeze = (): void => {
    this._setForcedMute("document-frozen", true, false);
  };

  private readonly _handleResume = (): void => {
    this._setForcedMute("document-frozen", false, true);
  };

  private readonly _handlePageHide = (): void => {
    this._setForcedMute("page-hidden", true, false);
  };

  private readonly _handlePageShow = (): void => {
    this._setForcedMute("page-hidden", false, true);
  };

  private _setForcedMute(
    reason: ForcedMuteReason,
    active: boolean,
    attemptPlayback: boolean,
  ): void {
    if (active) this._forcedMuteReasons.add(reason);
    else this._forcedMuteReasons.delete(reason);
    this._syncEffectiveMute(attemptPlayback);
  }
}
