import type { ReactiveController, ReactiveControllerHost } from "lit";

import { NATIVE_FULLSCREEN_EXIT_RECOVERY_MS } from "./constants";

interface WebKitFullscreenVideo extends HTMLVideoElement {
  readonly webkitPresentationMode?: string;
}

interface FullscreenLifecycleOptions {
  readonly getCurrentVideo: () => HTMLVideoElement | undefined;
  readonly onExit: () => void;
  readonly resumePlayback: (video: HTMLVideoElement) => Promise<void> | void;
}

/** Restores the retained media element after document or native fullscreen. */
export class FullscreenLifecycleController implements ReactiveController {
  private _documentFullscreen = false;
  private _documentFullscreenEntered = false;
  private _exitRecoveryTimer?: number;
  private _exitRecoveryVideo?: HTMLVideoElement;
  private _nativeVideo?: WebKitFullscreenVideo;
  private _pauseRecoveryTimer?: number;
  private readonly _resumeFrames = new Set<number>();
  private _sessionVideo?: HTMLVideoElement;

  public constructor(
    host: ReactiveControllerHost,
    private readonly _options: FullscreenLifecycleOptions,
  ) {
    host.addController(this);
  }

  public hostDisconnected(): void {
    this.cancel();
  }

  public beginDocumentFullscreen(video?: HTMLVideoElement): void {
    this.cancel();
    this._documentFullscreen = true;
    this._sessionVideo = video;
  }

  public beginNativeFullscreen(video: HTMLVideoElement): void {
    this.cancel();
    this._sessionVideo = video;
    this._nativeVideo = video;
    this._resume(video);
    video.addEventListener("webkitendfullscreen", this._handleNativeExit, {
      once: true,
    });
    video.addEventListener(
      "webkitpresentationmodechanged",
      this._handlePresentationModeChange,
    );
  }

  public handleDocumentFullscreenChange(
    fullscreenElement: Element | null,
  ): void {
    if (!this._documentFullscreen) return;
    if (fullscreenElement) {
      this._documentFullscreenEntered = true;
      return;
    }
    if (this._documentFullscreenEntered) this._recoverAfterExit(false);
  }

  public cancel(): void {
    this._cancelFrames();
    this._removeNativeListeners();
    this._stopExitRecovery();
    this._documentFullscreen = false;
    this._documentFullscreenEntered = false;
    this._sessionVideo = undefined;
  }

  private readonly _handleNativeExit = (): void => {
    this._recoverAfterExit(true);
  };

  private readonly _handlePresentationModeChange = (): void => {
    if (this._nativeVideo?.webkitPresentationMode === "fullscreen") return;
    this._recoverAfterExit(true);
  };

  private readonly _handleExitPause = (): void => {
    const video = this._exitRecoveryVideo;
    if (!video || this._pauseRecoveryTimer !== undefined) return;
    this._pauseRecoveryTimer = window.setTimeout(() => {
      this._pauseRecoveryTimer = undefined;
      if (video === this._exitRecoveryVideo) this._resume(video);
    }, 0);
  };

  private _recoverAfterExit(nativeFullscreen: boolean): void {
    const sessionVideo = this._sessionVideo;
    this._cancelFrames();
    this._removeNativeListeners();
    this._stopExitRecovery();
    this._documentFullscreen = false;
    this._documentFullscreenEntered = false;
    this._sessionVideo = undefined;
    this._options.onExit();

    const video =
      sessionVideo?.isConnected !== false
        ? sessionVideo
        : this._options.getCurrentVideo();
    if (!video) return;

    if (nativeFullscreen) {
      this._exitRecoveryVideo = video;
      video.addEventListener("pause", this._handleExitPause);
      this._exitRecoveryTimer = window.setTimeout(
        () => this._stopExitRecovery(),
        NATIVE_FULLSCREEN_EXIT_RECOVERY_MS,
      );
    }

    const firstFrame = requestAnimationFrame(() => {
      this._resumeFrames.delete(firstFrame);
      const secondFrame = requestAnimationFrame(() => {
        this._resumeFrames.delete(secondFrame);
        if (video.isConnected !== false) this._resume(video);
      });
      this._resumeFrames.add(secondFrame);
    });
    this._resumeFrames.add(firstFrame);
  }

  private _resume(video: HTMLVideoElement): void {
    try {
      void Promise.resolve(this._options.resumePlayback(video)).catch(
        () => undefined,
      );
    } catch {
      // The owning presentation translates playback failures when actionable.
    }
  }

  private _removeNativeListeners(): void {
    this._nativeVideo?.removeEventListener(
      "webkitendfullscreen",
      this._handleNativeExit,
    );
    this._nativeVideo?.removeEventListener(
      "webkitpresentationmodechanged",
      this._handlePresentationModeChange,
    );
    this._nativeVideo = undefined;
  }

  private _cancelFrames(): void {
    for (const frame of this._resumeFrames) cancelAnimationFrame(frame);
    this._resumeFrames.clear();
  }

  private _stopExitRecovery(): void {
    if (this._exitRecoveryTimer !== undefined) {
      window.clearTimeout(this._exitRecoveryTimer);
    }
    if (this._pauseRecoveryTimer !== undefined) {
      window.clearTimeout(this._pauseRecoveryTimer);
    }
    this._exitRecoveryVideo?.removeEventListener(
      "pause",
      this._handleExitPause,
    );
    this._exitRecoveryTimer = undefined;
    this._pauseRecoveryTimer = undefined;
    this._exitRecoveryVideo = undefined;
  }
}
