import { html, LitElement, nothing } from "lit";

import { MINIMAL_CAMERA_TAG } from "../../../core/constants";
import { CLIENT_PROFILE } from "../../../core/client-profile";
import type {
  CompanionRotateAction,
  FrigateFallbackTransport,
  HomeAssistantActionConfig,
  LiveConnectionType,
  MinimalCameraMenuPosition,
} from "../../../core/config";
import type {
  HomeAssistant,
  HomeAssistantApi,
} from "../../../core/home-assistant";
import { performHomeAssistantAction } from "../../../core/home-assistant-actions";
import {
  isMediaFullscreenActive,
  mediaFullscreenSupported,
  toggleMediaFullscreen,
} from "../../../core/fullscreen";
import {
  isPictureInPictureActive,
  pictureInPictureMethod,
  refreshNativePictureInPictureSuppression,
  suppressNativePictureInPicture,
  togglePictureInPicture,
} from "../../../core/picture-in-picture";
import {
  playMediaElement,
  setMediaElementMuted,
} from "../../../core/media-playback";
import { renderIcon } from "../../../ui/icons";
import "../../../ui/badge";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { CameraAudioController } from "../../camera-presentation/live/audio.controller";
import { CameraLiveSessionController } from "../../camera-presentation/live/session.controller";
import {
  captureVideoFrame,
  downloadSnapshot,
} from "../../camera-presentation/live/frame-capture";
import { mediaTransportLabel } from "../../camera-presentation/live/source-label";
import { CameraActivityHighlightController } from "../../camera-presentation/activity-highlight.controller";
import { CameraRuntimeController } from "../../camera-presentation/runtime.controller";
import { renderCameraSuspendedPresentation } from "../../camera-presentation/suspended-presentation";
import { minimalCameraStyles } from "./minimal-camera.styles";
import {
  motionDurations,
  motionEasings,
  OwnedMotion,
} from "../../../ui/motion";
import { MinimalLiveDialogController } from "./minimal-live-dialog.controller";

interface MinimalCameraConfig {
  readonly connection: LiveConnectionType;
  readonly entityId: string;
  readonly frigateFallback: FrigateFallbackTransport;
  readonly lowLatencyHls: boolean;
  readonly posterUrl?: string;
  readonly startUnmutedPcTablet: boolean;
  readonly startUnmutedPhone: boolean;
  readonly title: string;
}

const HOLD_DELAY_MS = 500;
const DOUBLE_TAP_DELAY_MS = 250;

export class MinimalCameraModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    available: { attribute: false, type: Boolean },
    camera: { attribute: false },
    doubleTapAction: { attribute: false },
    hass: { attribute: false },
    holdAction: { attribute: false },
    highlightActivity: { attribute: false, type: Boolean },
    localize: { attribute: false },
    menuPosition: { attribute: false },
    rotateAction: { attribute: false },
    showFullscreenButton: { attribute: false, type: Boolean },
    showMuteButton: { attribute: false, type: Boolean },
    showPictureInPictureButton: { attribute: false, type: Boolean },
    showSourceLabel: { attribute: false, type: Boolean },
    tapAction: { attribute: false },
    _controlsExpanded: { state: true },
    _snapshotError: { state: true },
    _snapshotPending: { state: true },
  };

  private _activeVideo?: HTMLVideoElement;
  private _attachedWebRtcVideo?: HTMLVideoElement;
  private _holdFired = false;
  private _holdTimer?: ReturnType<typeof setTimeout>;
  private _controlsExpanded = false;
  private _snapshotError?: string;
  private _snapshotPending = false;
  private _automaticLandscapeFullscreen = false;
  private _rotateAction: CompanionRotateAction = "none";
  private _tapTimer?: ReturnType<typeof setTimeout>;
  private readonly _audioControlMotion = new OwnedMotion();
  private readonly _volumeMotion = new OwnedMotion();
  private _renderedAudioExpanded?: boolean;
  private readonly _activity = new CameraActivityHighlightController(this);
  private readonly _runtime = new CameraRuntimeController(this);
  private readonly _dialog = new MinimalLiveDialogController(this, {
    getAspectRatio: () => this._dialogMediaAspectRatio(),
    getChromeHeight: () =>
      [".live-dialog-header", ".live-dialog-footer"].reduce(
        (height, selector) =>
          height +
          (this.renderRoot.querySelector<HTMLElement>(selector)?.offsetHeight ??
            0),
        0,
      ),
    getDialog: () =>
      this.renderRoot.querySelector<HTMLDialogElement>(".live-dialog"),
  });
  private readonly _audio: CameraAudioController = new CameraAudioController(
    this,
    {
      dismissToast: () => undefined,
      getAutoplayWarning: () => this.localize("camera.autoplay_blocked"),
      getMediaState: (): {
        fallback?: HTMLVideoElement;
        selected?: "fallback" | "webrtc";
        webRtc?: HTMLVideoElement;
      } => ({
        fallback: this._session.fallbackVideo,
        selected: this._session.selected,
        webRtc: this._session.webRtcVideo,
      }),
      showWarning: () => undefined,
    },
  );
  private readonly _session: CameraLiveSessionController =
    new CameraLiveSessionController(this, {
      getInitialMuted: (): boolean => this._audio.muted,
      onActiveVideoChanged: (video) => {
        for (const event of [
          "enterpictureinpicture",
          "leavepictureinpicture",
        ]) {
          this._activeVideo?.removeEventListener(
            event,
            this._handleMediaModeChange,
          );
        }
        this._activeVideo = video;
        suppressNativePictureInPicture(video);
        for (const event of [
          "enterpictureinpicture",
          "leavepictureinpicture",
        ]) {
          video?.addEventListener(event, this._handleMediaModeChange);
        }
        this._audio.handleActiveVideoChanged(video);
      },
    });

  public api?: HomeAssistantApi;
  public available = false;
  public camera?: MinimalCameraConfig;
  public hass?: HomeAssistant;
  public highlightActivity = true;
  public localize: LocalizeFunction = englishLocalize;
  public menuPosition: MinimalCameraMenuPosition = "top_left";
  public showFullscreenButton = true;
  public showMuteButton = true;
  public showPictureInPictureButton = true;
  public showSourceLabel = true;
  public tapAction: HomeAssistantActionConfig = { action: "open-live-view" };
  public holdAction: HomeAssistantActionConfig = { action: "none" };
  public doubleTapAction: HomeAssistantActionConfig = { action: "none" };

  public get rotateAction(): CompanionRotateAction {
    return this._rotateAction;
  }

  public set rotateAction(value: CompanionRotateAction) {
    const previous = this._rotateAction;
    if (value === previous) return;
    this._rotateAction = value;
    this.requestUpdate("rotateAction", previous);
    this._syncCompanionRotateAction();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("fullscreenchange", this._handleFullscreenChange);
    document.addEventListener(
      "webkitfullscreenchange",
      this._handleFullscreenChange,
    );
    window.addEventListener("resize", this._syncCompanionRotateAction);
    this._syncCompanionRotateAction();
  }

  protected willUpdate(): void {
    const camera = this.camera;
    this._runtime.configure(this.api, camera?.entityId);
    const runtime = this._runtime.snapshot;
    const suspended = runtime?.suspended === true;
    this._audio.configure(
      camera?.entityId,
      camera?.startUnmutedPcTablet ?? false,
      camera?.startUnmutedPhone ?? false,
      false,
      true,
    );
    this._session.configure(
      this.api,
      camera?.entityId,
      this.available &&
        runtime !== undefined &&
        runtime.available !== false &&
        !suspended,
      camera?.connection,
      camera?.lowLatencyHls,
      camera?.frigateFallback,
      !suspended,
      false,
    );
    this._activity.configure(
      this.highlightActivity ? this.api : undefined,
      this.highlightActivity ? camera?.entityId : undefined,
    );
  }

  protected render() {
    const selected = this._session.selected;
    const suspended = this._runtime.snapshot?.suspended === true;
    const showFullscreen =
      !suspended &&
      this.showFullscreenButton &&
      mediaFullscreenSupported(this._viewport ?? this, this._activeVideo);
    const showPictureInPicture =
      !suspended &&
      this.showPictureInPictureButton &&
      pictureInPictureMethod(this._activeVideo) !== undefined;
    const controls = {
      fullscreen: showFullscreen,
      mute: !suspended && this.showMuteButton,
      pictureInPicture: showPictureInPicture,
      source:
        !suspended && this.showSourceLabel && this._session.transport
          ? mediaTransportLabel(
              this._session.transport,
              this._session.effectiveLowLatencyHls,
            )
          : undefined,
    };
    const videoAspectRatio =
      this._activeVideo?.videoWidth && this._activeVideo.videoHeight
        ? this._activeVideo.videoWidth / this._activeVideo.videoHeight
        : undefined;
    return html`<div
        class=${`viewport${this._activity.classification ? ` activity-${this._activity.classification}` : ""}`}
      >
        <div class="media">
          ${
            suspended
              ? renderCameraSuspendedPresentation(this.localize)
              : !selected
                ? this.camera?.posterUrl
                  ? html`<img src=${this.camera.posterUrl} alt="" />`
                  : html`<div class="placeholder" aria-hidden="true">
                      ${renderIcon("camera")}
                    </div>`
                : nothing
          }
          ${
            suspended
              ? nothing
              : html`<div
                    class="video-host fallback"
                    ?hidden=${selected !== "fallback"}
                  ></div>
                  <div
                    class=${`video-host webrtc${selected === "webrtc" ? " selected" : ""}`}
                  ></div>`
          }
        </div>
        ${
          suspended
            ? nothing
            : html`<button
                  class="interaction-surface"
                  type="button"
                  aria-label=${
                    this.camera?.title ||
                    this.camera?.entityId ||
                    this.localize("camera.live")
                  }
                  @pointerdown=${this._handlePointerDown}
                  @pointerup=${this._handlePointerUp}
                  @pointercancel=${this._cancelHold}
                  @dblclick=${this._handleDoubleTap}
                  @click=${this._handleClick}
                ></button>
                ${
                  !this._dialog.openState
                    ? this._renderControlMenu(controls)
                    : nothing
                }`
        }
      </div>
      <dialog
        class=${`live-dialog${this._automaticLandscapeFullscreen ? " companion-rotate-fullscreen" : ""}`}
        aria-label=${this.camera?.title || this.localize("camera.live")}
        @cancel=${this._dialog.close}
        @close=${this._dialog.handleClosed}
        @click=${this._dialog.handleBackdropClick}
      >
        <header
          class="live-dialog-header"
          @pointerdown=${this._dialog.startDrag}
          @pointermove=${this._dialog.moveDrag}
          @pointerup=${this._dialog.endDrag}
          @pointercancel=${this._dialog.endDrag}
        >
          <button
            class="dialog-close"
            type="button"
            aria-label=${this.localize("camera.close_live_view")}
            @pointerdown=${this._stopControlEvent}
            @click=${this._dialog.close}
          >
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
          <span>${this.camera?.title || this.camera?.entityId}</span>
        </header>
        <div
          class=${`live-dialog-media${this._activity.classification ? ` activity-${this._activity.classification}` : ""}`}
          style=${
            videoAspectRatio
              ? `--wzc-minimal-live-dialog-aspect-ratio: ${videoAspectRatio}`
              : nothing
          }
        >
          ${
            suspended
              ? renderCameraSuspendedPresentation(this.localize)
              : html`<div class="dialog-video-host fallback"></div>
                  <div
                    class=${`dialog-video-host webrtc${selected === "webrtc" ? " selected" : ""}`}
                  ></div>
                  ${this._renderControlMenu(controls)}`
          }
        </div>
        <footer class="live-dialog-footer">
          <span class="snapshot-status" role="status" aria-live="polite">
            ${
              this._snapshotError ??
              (this._snapshotPending
                ? this.localize("camera.saving_snapshot")
                : nothing)
            }
          </span>
          <ha-button
            appearance="accent"
            variant="brand"
            size="m"
            type="button"
            .disabled=${this._snapshotPending || !this._activeVideo}
            @click=${this._downloadLiveSnapshot}
          >
            ${this.localize("media_player.download_snapshot")}
          </ha-button>
        </footer>
        <button
          class="resize-handle"
          type="button"
          aria-label=${this.localize("media_player.resize")}
          @pointerdown=${this._dialog.startResize}
          @pointermove=${this._dialog.moveResize}
          @pointerup=${this._dialog.endResize}
          @pointercancel=${this._dialog.endResize}
          @lostpointercapture=${this._dialog.endResize}
          @keydown=${this._dialog.handleResizeKey}
        >
          ${renderIcon("resizeGrip")}
        </button>
      </dialog>`;
  }

  protected updated(): void {
    this._dialog.sync();
    this._attachMedia();
    this._audio.syncMediaState();
    const audioControl =
      this.renderRoot.querySelector<HTMLElement>(".audio-control") ?? undefined;
    const volume =
      this.renderRoot.querySelector<HTMLElement>(".volume-slider") ?? undefined;
    const expanded = audioControl?.classList.contains("expanded") ?? false;
    if (
      audioControl &&
      volume &&
      this._renderedAudioExpanded !== undefined &&
      this._renderedAudioExpanded !== expanded
    ) {
      this._audioControlMotion.start(
        audioControl,
        {
          inlineSize: expanded
            ? "calc(var(--wzc-control-size) + 5rem)"
            : "var(--wzc-control-size)",
        },
        { duration: motionDurations.overlay, ease: motionEasings.standard },
      );
      this._volumeMotion.start(
        volume,
        { opacity: expanded ? 1 : 0 },
        { duration: motionDurations.overlay, ease: motionEasings.standard },
      );
    }
    this._renderedAudioExpanded = expanded;
  }

  public disconnectedCallback(): void {
    this._audioControlMotion.cancel();
    this._volumeMotion.cancel();
    this._cancelHold();
    this._closeControlMenu();
    if (this._tapTimer !== undefined) clearTimeout(this._tapTimer);
    this._detachWebRtcVideo();
    document.removeEventListener(
      "fullscreenchange",
      this._handleFullscreenChange,
    );
    document.removeEventListener(
      "webkitfullscreenchange",
      this._handleFullscreenChange,
    );
    window.removeEventListener("resize", this._syncCompanionRotateAction);
    super.disconnectedCallback();
  }

  private get _viewport(): HTMLElement | undefined {
    return (
      this.renderRoot.querySelector<HTMLElement>(
        this._dialog.openState ? ".live-dialog-media" : ".viewport",
      ) ?? undefined
    );
  }

  private _attachMedia(): void {
    const fallback = this._session.fallbackVideo;
    const fallbackHost = this.renderRoot.querySelector<HTMLElement>(
      this._dialog.openState
        ? ".dialog-video-host.fallback"
        : ".video-host.fallback",
    );
    if (fallback && fallbackHost && fallback.parentElement !== fallbackHost) {
      fallback.autoplay = true;
      fallback.playsInline = true;
      setMediaElementMuted(fallback, this._audio.muted);
      fallbackHost.append(fallback);
      refreshNativePictureInPictureSuppression(fallback);
      void playMediaElement(fallback).catch(() => undefined);
    }

    const webRtc = this._session.webRtcVideo;
    if (this._attachedWebRtcVideo !== webRtc) {
      this._detachWebRtcVideo();
      this._attachedWebRtcVideo = webRtc;
      for (const event of ["canplay", "loadeddata", "playing"]) {
        webRtc?.addEventListener(event, this._handleWebRtcDecoded);
      }
    }
    const webRtcHost = this.renderRoot.querySelector<HTMLElement>(
      this._dialog.openState
        ? ".dialog-video-host.webrtc"
        : ".video-host.webrtc",
    );
    if (webRtc && webRtcHost && webRtc.parentElement !== webRtcHost) {
      webRtc.autoplay = true;
      webRtc.playsInline = true;
      setMediaElementMuted(webRtc, this._audio.muted);
      webRtcHost.append(webRtc);
      refreshNativePictureInPictureSuppression(webRtc);
      void playMediaElement(webRtc).catch(() => undefined);
    }
    if (this._session.selected === "webrtc") {
      this._session.handleWebRtcPresented();
    }
  }

  private _detachWebRtcVideo(): void {
    for (const event of ["canplay", "loadeddata", "playing"]) {
      this._attachedWebRtcVideo?.removeEventListener(
        event,
        this._handleWebRtcDecoded,
      );
    }
    this._attachedWebRtcVideo = undefined;
  }

  private readonly _handleWebRtcDecoded = (event: Event): void => {
    this._session.handleWebRtcDecoded(event.currentTarget as HTMLVideoElement);
  };

  private readonly _handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this._holdFired = false;
    this._cancelHold();
    this._holdTimer = setTimeout(() => {
      this._holdTimer = undefined;
      this._holdFired = true;
      void this._perform(this.holdAction);
    }, HOLD_DELAY_MS);
  };

  private readonly _handlePointerUp = (): void => this._cancelHold();

  private readonly _cancelHold = (): void => {
    if (this._holdTimer !== undefined) clearTimeout(this._holdTimer);
    this._holdTimer = undefined;
  };

  private readonly _handleClick = (): void => {
    if (this._holdFired) {
      this._holdFired = false;
      return;
    }
    if (this._tapTimer !== undefined) {
      clearTimeout(this._tapTimer);
      this._tapTimer = undefined;
      void this._perform(this.doubleTapAction);
      return;
    }
    this._tapTimer = setTimeout(() => {
      this._tapTimer = undefined;
      void this._perform(this.tapAction);
    }, DOUBLE_TAP_DELAY_MS);
  };

  private readonly _handleDoubleTap = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private _perform(config: HomeAssistantActionConfig): Promise<void> {
    if (!this.camera) return Promise.resolve();
    if (config.action === "open-live-view") {
      this._openLiveDialog();
      return Promise.resolve();
    }
    return performHomeAssistantAction(
      this,
      this.hass,
      config,
      this.camera.entityId,
    );
  }

  private readonly _stopControlEvent = (event: Event): void => {
    event.stopPropagation();
  };

  private readonly _toggleMute = (event: Event): void => {
    event.stopPropagation();
    this._audio.toggleUserMute();
  };

  private readonly _setVolume = (event: Event): void => {
    event.stopPropagation();
    const input = event.currentTarget as HTMLInputElement;
    const volume = Number(input.value);
    this._audio.setUserVolume(volume);
    input.style.setProperty(
      "--wzc-media-volume-progress",
      `${this._audio.volume * 100}%`,
    );
  };

  private readonly _downloadLiveSnapshot = async (
    event: Event,
  ): Promise<void> => {
    event.stopPropagation();
    if (!this._activeVideo || this._snapshotPending) return;
    this._snapshotPending = true;
    this._snapshotError = undefined;
    try {
      downloadSnapshot(
        await captureVideoFrame(this._activeVideo),
        this.camera?.entityId,
      );
    } catch {
      this._snapshotError = this.localize("camera.snapshot_failed");
    } finally {
      this._snapshotPending = false;
    }
  };

  private _renderControlMenu(controls: {
    readonly fullscreen: boolean;
    readonly mute: boolean;
    readonly pictureInPicture: boolean;
    readonly source?: string;
  }) {
    if (
      !controls.fullscreen &&
      !controls.mute &&
      !controls.pictureInPicture &&
      !controls.source
    ) {
      return nothing;
    }
    return html`<div
      class=${`control-menu ${this.menuPosition === "top_right" ? "right" : "left"}`}
    >
      <button
        class="control-button round menu-toggle"
        type="button"
        aria-label=${this.localize("camera.controls_menu")}
        aria-expanded=${String(this._controlsExpanded)}
        @pointerdown=${this._stopControlEvent}
        @click=${this._toggleControlMenu}
      >
        ${renderIcon("menu")}
      </button>
      <div class="controls" ?hidden=${!this._controlsExpanded}>
        ${
          controls.fullscreen
            ? html`<button
                class="control-button round"
                type="button"
                aria-label=${this.localize(
                  isMediaFullscreenActive(this._activeVideo)
                    ? "camera.exit_fullscreen"
                    : "camera.enter_fullscreen",
                )}
                @pointerdown=${this._stopControlEvent}
                @click=${this._toggleFullscreen}
              >
                ${renderIcon(
                  isMediaFullscreenActive(this._activeVideo)
                    ? "fullscreenExit"
                    : "fullscreen",
                )}
              </button>`
            : nothing
        }
        ${
          controls.pictureInPicture
            ? html`<button
                class="control-button round"
                type="button"
                aria-label=${this.localize(
                  isPictureInPictureActive(this._activeVideo)
                    ? "camera.exit_pip"
                    : "camera.enter_pip",
                )}
                @pointerdown=${this._stopControlEvent}
                @click=${this._togglePictureInPicture}
              >
                ${renderIcon("pipPopOut")}
              </button>`
            : nothing
        }
        ${
          controls.mute
            ? html`<div
                class=${`audio-control${this._audio.muted ? "" : " expanded"}`}
              >
                <button
                  class="control-button volume-toggle"
                  type="button"
                  aria-label=${
                    this._audio.muted
                      ? this.localize("camera.unmute")
                      : this.localize("camera.mute")
                  }
                  @pointerdown=${this._stopControlEvent}
                  @click=${this._toggleMute}
                >
                  ${renderIcon(this._audio.muted ? "volumeOff" : "volumeOn")}
                </button>
                <input
                  class="volume-slider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  .value=${String(this._audio.volume)}
                  style=${`--wzc-media-volume-progress: ${this._audio.volume * 100}%`}
                  aria-label=${this.localize("camera.volume")}
                  aria-hidden=${String(this._audio.muted)}
                  tabindex=${this._audio.muted ? "-1" : "0"}
                  @pointerdown=${this._stopControlEvent}
                  @click=${this._stopControlEvent}
                  @input=${this._setVolume}
                />
              </div>`
            : nothing
        }
        ${
          controls.source
            ? html`<wzc-badge
                class="source-control source-indicator"
                role="status"
                shape="pill"
                size="small"
                variant="neutral"
                >${controls.source}</wzc-badge
              >`
            : nothing
        }
      </div>
    </div>`;
  }

  private readonly _toggleControlMenu = (event: Event): void => {
    event.stopPropagation();
    if (this._controlsExpanded) {
      this._closeControlMenu();
      return;
    }
    this._controlsExpanded = true;
  };

  private _closeControlMenu(): void {
    this._controlsExpanded = false;
  }

  private _openLiveDialog(): void {
    if (this._runtime.snapshot?.suspended === true) return;
    this._dialog.open();
  }

  private readonly _syncCompanionRotateAction = (): void => {
    const active =
      CLIENT_PROFILE.isCompanionApp &&
      CLIENT_PROFILE.isPhone &&
      this.rotateAction === "fullscreen_live_video" &&
      window.innerWidth > window.innerHeight;
    if (active === this._automaticLandscapeFullscreen) return;
    this._automaticLandscapeFullscreen = active;
    if (active) this._openLiveDialog();
    else this._dialog.close();
    this.requestUpdate();
  };

  private _dialogMediaAspectRatio(): number {
    return this._activeVideo?.videoWidth && this._activeVideo.videoHeight
      ? this._activeVideo.videoWidth / this._activeVideo.videoHeight
      : 16 / 9;
  }

  private readonly _toggleFullscreen = (event: Event): void => {
    event.stopPropagation();
    void toggleMediaFullscreen(this._viewport, this._activeVideo).catch(
      () => undefined,
    );
  };

  private readonly _togglePictureInPicture = (event: Event): void => {
    event.stopPropagation();
    const video = this._activeVideo;
    if (!video) return;
    void togglePictureInPicture(video)
      .then(() => this.requestUpdate())
      .catch(() => undefined);
  };

  private readonly _handleMediaModeChange = (): void => {
    this.requestUpdate();
  };

  private readonly _handleFullscreenChange = (): void => {
    this.requestUpdate();
  };

  static styles = minimalCameraStyles;
}

if (!customElements.get(MINIMAL_CAMERA_TAG)) {
  customElements.define(MINIMAL_CAMERA_TAG, MinimalCameraModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [MINIMAL_CAMERA_TAG]: MinimalCameraModule;
  }
}
