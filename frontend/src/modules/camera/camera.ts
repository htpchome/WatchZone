import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  CAMERA_LIVE_PRESENTATION_TAG,
  CAMERA_SUSPEND_DIALOG_TAG,
  CAMERA_TAG,
} from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import { ToastManager } from "../../ui/toast-manager";
import { renderIcon } from "../../ui/icons";
import { CameraCarouselController } from "./carousel.controller";
import { cameraStyles } from "./camera.styles";
import { CameraAudioController } from "./live/audio.controller";
import type {
  CameraLivePresentation,
  CameraMediaDimensionsDetail,
  CameraToastRequestDetail,
} from "./live/presentation";
import "./live/presentation";
import { CameraLiveSessionController } from "./live/session.controller";
import { CameraRuntimeController } from "./runtime.controller";
import {
  CameraStageResizeController,
  type CameraStageResizeInteraction,
} from "./stage-resize.controller";
import type { CameraSuspendConfirmDetail } from "./suspend-dialog";
import "./suspend-dialog";

export type CameraShadowStyle = "medium" | "none" | "small";

const presentationTag = unsafeStatic(CAMERA_LIVE_PRESENTATION_TAG);
const suspendDialogTag = unsafeStatic(CAMERA_SUSPEND_DIALOG_TAG);

/** Camera module composition root. Provider, audio, and presentation stay separate. */
export class CameraModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    available: { attribute: false, type: Boolean },
    entityId: { attribute: false },
    lowLatencyHls: { attribute: false, type: Boolean },
    posterUrl: { attribute: false },
    roundedCorners: { attribute: false, type: Boolean },
    shadowStyle: { attribute: false },
    startUnmutedPcTablet: { attribute: false, type: Boolean },
    startUnmutedPhone: { attribute: false, type: Boolean },
  };

  private readonly _carousel = new CameraCarouselController(this);
  private readonly _toasts = new ToastManager(this);
  private readonly _audio: CameraAudioController = new CameraAudioController(
    this,
    {
      dismissToast: (key) => this._toasts.dismiss(key),
      getMediaState: (): {
        hls?: HTMLVideoElement;
        selected?: "hls" | "webrtc";
        webRtc?: HTMLVideoElement;
      } => ({
        hls: this._session.hlsVideo,
        selected: this._session.selected,
        webRtc: this._presentation?.webRtcVideo,
      }),
      showWarning: (message, key) => this._toasts.warning(message, { key }),
    },
  );
  private readonly _session: CameraLiveSessionController =
    new CameraLiveSessionController(this, {
      getInitialMuted: (): boolean => this._audio.muted,
      onActiveVideoChanged: (video) =>
        this._audio.handleActiveVideoChanged(video),
    });
  private readonly _runtime = new CameraRuntimeController(this);
  private readonly _stageResize = new CameraStageResizeController(
    this,
    (interaction) => this._handleStageResizeInteraction(interaction),
    (scale) => this._presentation?.setBasePresentationScale(scale),
  );
  private _suspendDialogActive = false;

  public api?: HomeAssistantApi;
  public available = false;
  public entityId?: string;
  public lowLatencyHls = true;
  public posterUrl?: string;
  public roundedCorners = true;
  public shadowStyle: CameraShadowStyle = "medium";
  public startUnmutedPcTablet = false;
  public startUnmutedPhone = false;

  private get _presentation(): CameraLivePresentation | undefined {
    return (
      this.renderRoot.querySelector<CameraLivePresentation>(
        CAMERA_LIVE_PRESENTATION_TAG,
      ) ?? undefined
    );
  }

  protected willUpdate(): void {
    this._stageResize.configure(this.entityId);
    this._runtime.configure(this.api, this.entityId);
    const runtime = this._runtime.snapshot;
    const suspended = runtime?.suspended === true;
    this._audio.configure(
      this.entityId,
      this.startUnmutedPcTablet,
      this.startUnmutedPhone,
      false,
    );
    this._session.configure(
      this.api,
      this.entityId,
      this.available && runtime?.available !== false && !suspended,
      this.lowLatencyHls,
      !suspended,
    );
  }

  protected render() {
    const runtime = this._runtime.snapshot;
    const suspended = runtime?.suspended === true;
    return staticHtml`
      <div
        class=${[
          "camera",
          this.roundedCorners ? "" : "square-camera-corners",
          this.shadowStyle === "small" ? "camera-shadow-small" : "",
          this.shadowStyle === "none" ? "camera-shadow-none" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div
          class="camera-carousel swiper"
          role="region"
          aria-label="Camera views"
          aria-roledescription="carousel"
        >
          <div class="swiper-wrapper">
            <div
              class="swiper-slide"
              role="group"
              aria-label="Camera 1 of 1"
              aria-roledescription="slide"
            >
              <${presentationTag}
                class="live-presentation"
                .available=${this.available}
                .failed=${this._session.failed}
                .hlsVideo=${this._session.hlsVideo}
                .muted=${this._audio.muted}
                .notices=${this._toasts.notices}
                .posterUrl=${this.posterUrl}
                .selected=${this._session.selected}
                .sessionRevision=${this._session.revision}
                .suspendPending=${this._runtime.pending}
                .suspendSupported=${runtime?.supported === true}
                .suspended=${suspended}
                .transport=${this._session.transport}
                .webRtcStream=${this._session.webRtcStream}
                .zoomKey=${this.entityId}
                @camera-media-attached=${this._handleMediaAttached}
                @camera-media-dimensions=${this._handleMediaDimensions}
                @camera-mute-toggle=${this._handleMuteToggle}
                @camera-suspend-toggle=${this._handleSuspendToggle}
                @camera-toast-request=${this._handleToastRequest}
                @camera-webrtc-decoded=${this._handleWebRtcDecoded}
                @camera-webrtc-presented=${this._handleWebRtcPresented}
              ></${presentationTag}>
            </div>
          </div>
        </div>
        <button
          class="stage-resize-handle"
          type="button"
          role="slider"
          title="Resize camera stage; double-activate to reset"
          aria-label="Camera stage height"
          aria-orientation="vertical"
          aria-valuemin="56"
          aria-valuemax="100"
          aria-valuenow=${String(this._stageResize.heightPercentage)}
          aria-valuetext=${`${this._stageResize.heightPercentage}% of stage width`}
          ?hidden=${suspended || !this.entityId}
          @pointerdown=${this._stageResize.handlePointerDown}
          @pointermove=${this._stageResize.handlePointerMove}
          @pointerup=${this._stageResize.handlePointerUp}
          @pointercancel=${this._stageResize.handlePointerCancel}
          @keydown=${this._stageResize.handleKeyDown}
        >
          ${renderIcon("chevronDown")}
        </button>
        <${suspendDialogTag}
          .active=${this._suspendDialogActive}
          .currentSuspended=${suspended}
          .pending=${this._runtime.pending}
          @camera-suspend-cancel=${this._handleSuspendCancel}
          @camera-suspend-confirm=${this._handleSuspendConfirm}
        ></${suspendDialogTag}>
      </div>
    `;
  }

  protected updated(): void {
    this._carousel.observe(
      this.renderRoot.querySelector<HTMLElement>(".camera-carousel") ??
        undefined,
      1,
    );
    this._stageResize.observe(
      this.renderRoot.querySelector<HTMLElement>(".camera") ?? undefined,
      this.renderRoot.querySelector<HTMLButtonElement>(
        ".stage-resize-handle",
      ) ?? undefined,
    );
    this._presentation?.setBasePresentationScale(
      this._stageResize.mediaPresentationScale,
    );
    this._audio.syncMediaState();
  }

  private readonly _handleMediaAttached = (): void => {
    this._audio.syncMediaState();
  };

  private readonly _handleMediaDimensions = (
    event: CustomEvent<CameraMediaDimensionsDetail>,
  ): void => {
    this._stageResize.setMediaDimensions(
      event.detail.width,
      event.detail.height,
    );
  };

  private _handleStageResizeInteraction(
    interaction: CameraStageResizeInteraction,
  ): void {
    const presentation = this._presentation;
    if (!presentation) return;
    if (interaction.phase === "start") presentation.beginStageResizeReturn();
    else if (interaction.phase === "update")
      presentation.updateStageResizeReturn(interaction.returnProgress);
    else presentation.endStageResizeReturn();
  }

  private readonly _handleMuteToggle = (): void => {
    this._audio.toggleUserMute();
  };

  private readonly _handleSuspendToggle = (): void => {
    if (this._runtime.snapshot?.supported !== true || this._runtime.pending)
      return;
    this._suspendDialogActive = true;
    this.requestUpdate();
  };

  private readonly _handleSuspendCancel = (): void => {
    if (this._runtime.pending) return;
    this._suspendDialogActive = false;
    this.requestUpdate();
  };

  private readonly _handleSuspendConfirm = (
    event: CustomEvent<CameraSuspendConfirmDetail>,
  ): void => {
    if (this._runtime.pending) return;
    this._suspendDialogActive = false;
    this.requestUpdate();
    void this._applySuspension(event.detail);
  };

  private async _applySuspension(
    detail: CameraSuspendConfirmDetail,
  ): Promise<void> {
    try {
      await this._runtime.setSuspended(
        detail.suspended,
        detail.resumeAfterSeconds,
      );
      this._toasts.success(
        detail.suspended ? "Camera suspended." : "Camera resumed.",
        { key: "camera-runtime" },
      );
    } catch (error) {
      this._toasts.error(
        error instanceof Error
          ? error.message
          : detail.suspended
            ? "Unable to suspend camera."
            : "Unable to resume camera.",
        { key: "camera-runtime" },
      );
    }
    this.requestUpdate();
  }

  private readonly _handleToastRequest = (
    event: CustomEvent<CameraToastRequestDetail>,
  ): void => {
    this._toasts.show(event.detail.severity, event.detail.message, {
      key: event.detail.key,
    });
  };

  private readonly _handleWebRtcDecoded = (
    event: CustomEvent<HTMLVideoElement>,
  ): void => {
    this._session.handleWebRtcDecoded(event.detail);
  };

  private readonly _handleWebRtcPresented = (): void => {
    this._session.handleWebRtcPresented();
  };

  static styles = cameraStyles;
}

if (!customElements.get(CAMERA_TAG)) {
  customElements.define(CAMERA_TAG, CameraModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_TAG]: CameraModule;
  }
}
