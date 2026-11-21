import type { ReactiveController, ReactiveControllerHost } from "lit";

import {
  dispatchCameraNativeFullscreenChange,
  isMediaFullscreenActive,
  mediaFullscreenSupported,
  toggleMediaFullscreen,
} from "../../../core/fullscreen";
import type { LocalizeFunction } from "../../../core/localization";
import {
  isPictureInPictureActive,
  pictureInPictureMethod,
  suppressNativePictureInPicture,
  togglePictureInPicture,
} from "../../../core/picture-in-picture";
import type { ToastSeverity } from "../../../ui/toast/manager";
import type { CameraControlAction } from "../controls-overlay";
import { downloadSnapshot } from "./frame-capture";

interface CameraLiveControlOptions {
  readonly captureFrame: () => Promise<Blob>;
  readonly getFullscreenTarget: () => HTMLElement | undefined;
  readonly getLocalize: () => LocalizeFunction;
  readonly getSnapshotKey: () => string | undefined;
  readonly onMuteToggle: () => void;
  readonly onFullscreenExit?: () => void;
  readonly onSuspendToggle: () => void;
  readonly requestToast: (
    severity: ToastSeverity,
    message: string,
    key: string,
  ) => void;
}

const VIDEO_CONTROL_STATE_EVENTS = [
  "enterpictureinpicture",
  "leavepictureinpicture",
  "webkitpresentationmodechanged",
  "webkitbeginfullscreen",
  "webkitendfullscreen",
] as const;

/** Owns browser control state and commands for one live presentation. */
export class CameraLiveControlController implements ReactiveController {
  public fullscreenActive = false;
  public pictureInPictureActive = false;
  public snapshotPending = false;

  private _activeVideo?: HTMLVideoElement;

  public constructor(
    private readonly _host: ReactiveControllerHost & EventTarget,
    private readonly _options: CameraLiveControlOptions,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    document.addEventListener(
      "fullscreenchange",
      this._handleDocumentFullscreenChange,
    );
    document.addEventListener(
      "webkitfullscreenchange",
      this._handleDocumentFullscreenChange,
    );
  }

  public hostDisconnected(): void {
    document.removeEventListener(
      "fullscreenchange",
      this._handleDocumentFullscreenChange,
    );
    document.removeEventListener(
      "webkitfullscreenchange",
      this._handleDocumentFullscreenChange,
    );
    this.setActiveVideo(undefined);
  }

  public setActiveVideo(video: HTMLVideoElement | undefined): void {
    if (this._activeVideo === video) return;
    for (const eventName of VIDEO_CONTROL_STATE_EVENTS) {
      this._activeVideo?.removeEventListener(
        eventName,
        this._handleVideoControlState,
      );
      video?.addEventListener(eventName, this._handleVideoControlState);
    }
    this._activeVideo = video;
    suppressNativePictureInPicture(video);
    this._syncControlState();
  }

  public pictureInPictureSupported(video = this._activeVideo): boolean {
    return Boolean(pictureInPictureMethod(video));
  }

  public fullscreenSupported(): boolean {
    return mediaFullscreenSupported(
      this._options.getFullscreenTarget(),
      this._activeVideo,
    );
  }

  public perform(action: CameraControlAction): void {
    if (action === "mute") {
      this._options.onMuteToggle();
    } else if (action === "picture_in_picture") {
      void this._togglePictureInPicture();
    } else if (action === "fullscreen") {
      void this._toggleFullscreen();
    } else if (action === "snapshot") {
      void this._takeSnapshot();
    } else if (action === "suspend") {
      this._options.onSuspendToggle();
    }
  }

  private async _takeSnapshot(): Promise<void> {
    if (!this._activeVideo || this.snapshotPending) return;
    this.snapshotPending = true;
    this._host.requestUpdate();
    try {
      downloadSnapshot(
        await this._options.captureFrame(),
        this._options.getSnapshotKey(),
      );
      this._options.requestToast(
        "success",
        this._options.getLocalize()("camera.snapshot_downloaded"),
        "camera-snapshot",
      );
    } catch (error) {
      this._options.requestToast(
        "error",
        error instanceof Error
          ? error.message
          : this._options.getLocalize()("camera.snapshot_failed"),
        "camera-snapshot",
      );
    } finally {
      this.snapshotPending = false;
      this._host.requestUpdate();
    }
  }

  private readonly _handleVideoControlState = (event: Event): void => {
    if (event.type === "webkitbeginfullscreen") {
      this._syncControlState(true);
      return;
    }
    if (event.type === "webkitendfullscreen") {
      this._syncControlState(false);
      return;
    }
    this._syncControlState();
  };

  private readonly _handleDocumentFullscreenChange = (): void => {
    this._syncControlState();
  };

  private readonly _syncControlState = (forcedFullscreen?: boolean): void => {
    const pictureInPictureActive = isPictureInPictureActive(this._activeVideo);
    const fullscreenActive =
      forcedFullscreen ?? isMediaFullscreenActive(this._activeVideo);
    const fullscreenChanged = this.fullscreenActive !== fullscreenActive;
    if (
      this.pictureInPictureActive === pictureInPictureActive &&
      this.fullscreenActive === fullscreenActive
    ) {
      return;
    }
    this.pictureInPictureActive = pictureInPictureActive;
    this.fullscreenActive = fullscreenActive;
    if (fullscreenChanged) {
      if (!fullscreenActive) this._options.onFullscreenExit?.();
      dispatchCameraNativeFullscreenChange(this._host, fullscreenActive);
    }
    this._host.requestUpdate();
  };

  private async _togglePictureInPicture(): Promise<void> {
    if (!this._activeVideo) return;
    try {
      await togglePictureInPicture(this._activeVideo);
    } catch (error) {
      this._options.requestToast(
        "error",
        error instanceof Error
          ? error.message
          : this._options.getLocalize()("camera.pip_failed"),
        "camera-picture-in-picture",
      );
    }
    this._syncControlState();
  }

  private async _toggleFullscreen(): Promise<void> {
    try {
      await toggleMediaFullscreen(
        this._options.getFullscreenTarget(),
        this._activeVideo,
      );
    } catch (error) {
      this._options.requestToast(
        "error",
        error instanceof Error
          ? error.message
          : this._options.getLocalize()("camera.fullscreen_failed"),
        "camera-fullscreen",
      );
    }
    this._syncControlState();
  }
}
