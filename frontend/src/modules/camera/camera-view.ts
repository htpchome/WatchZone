import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  CAMERA_LIVE_PRESENTATION_TAG,
  CAMERA_STAGE_SIZE_CHANGE_EVENT,
  CAMERA_SUSPEND_DIALOG_TAG,
  CAMERA_VIEW_TAG,
} from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import type { CameraSessionContext } from "../../core/camera-session-context";
import type { LiveConnectionType } from "../../core/config";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { ToastManager } from "../../ui/toast-manager";
import { renderIcon } from "../../ui/icons";
import { cameraViewStyles } from "./camera-view.styles";
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
  DEFAULT_CAMERA_STAGE_HEIGHT_RATIO,
  type CameraStageSize,
  type CameraStageResizeInteraction,
} from "./stage-resize.controller";
import type { CameraSuspendConfirmDetail } from "./suspend-dialog";
import "./suspend-dialog";

const presentationTag = unsafeStatic(CAMERA_LIVE_PRESENTATION_TAG);
const suspendDialogTag = unsafeStatic(CAMERA_SUSPEND_DIALOG_TAG);

/** Owns one camera view's live, runtime, audio, and stage presentation. */
export class CameraView extends LitElement {
  public static properties = {
    active: { attribute: false, type: Boolean },
    connect: { attribute: false, type: Boolean },
    api: { attribute: false },
    cameraSession: { attribute: false },
    available: { attribute: false, type: Boolean },
    connection: { attribute: false },
    entityId: { attribute: false },
    lowLatencyHls: { attribute: false, type: Boolean },
    localize: { attribute: false },
    overlayVisible: { attribute: false, type: Boolean },
    posterUrl: { attribute: false },
    stageHeightRatio: { attribute: false, type: Number },
    stageResized: { attribute: false, type: Boolean },
    startUnmutedPcTablet: { attribute: false, type: Boolean },
    startUnmutedPhone: { attribute: false, type: Boolean },
  };

  private readonly _toasts = new ToastManager(this);
  private readonly _audio: CameraAudioController = new CameraAudioController(
    this,
    {
      dismissToast: (key) => this._toasts.dismiss(key),
      getMediaState: (): {
        fallback?: HTMLVideoElement;
        selected?: "fallback" | "webrtc";
        webRtc?: HTMLVideoElement;
      } => ({
        fallback: this._session.fallbackVideo,
        selected: this._session.selected,
        webRtc: this._presentation?.webRtcVideo,
      }),
      getAutoplayWarning: () => this.localize("camera.autoplay_blocked"),
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
    (size) => this._handleStageSizeChange(size),
  );
  private _suspendDialogActive = false;

  public active = false;
  public connect = false;
  public api?: HomeAssistantApi;
  public cameraSession?: CameraSessionContext;
  public available = false;
  public connection: LiveConnectionType = "home_assistant";
  public entityId?: string;
  public lowLatencyHls = true;
  public localize: LocalizeFunction = englishLocalize;
  public overlayVisible = false;
  public posterUrl?: string;
  public stageHeightRatio = DEFAULT_CAMERA_STAGE_HEIGHT_RATIO;
  public stageResized = false;
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
    this._stageResize.setSize({
      heightRatio: this.stageHeightRatio,
      resized: this.stageResized,
    });
    this._runtime.configure(
      this.connect ? this.api : undefined,
      this.connect ? this.entityId : undefined,
    );
    const runtime = this._runtime.snapshot;
    const suspended = runtime?.suspended === true;
    this._audio.configure(
      this.entityId,
      this.startUnmutedPcTablet,
      this.startUnmutedPhone,
      false,
      this.active,
    );
    this._session.configure(
      this.api,
      this.entityId,
      this.connect &&
        this.available &&
        runtime?.available !== false &&
        !suspended,
      this.connection,
      this.lowLatencyHls,
      !suspended,
    );
  }

  protected render() {
    const runtime = this._runtime.snapshot;
    const suspended = runtime?.suspended === true;
    return staticHtml`
      <div
        class="camera"
      >
        <${presentationTag}
                class="live-presentation"
                .available=${this.connect && this.available}
                .failed=${this._session.failed}
                .fallbackVideo=${this._session.fallbackVideo}
                .lowLatencyHls=${this.lowLatencyHls}
                .localize=${this.localize}
                .muted=${this._audio.muted}
                .notices=${this._toasts.notices}
                .posterUrl=${this.posterUrl}
                .posterPriority=${this.active}
                .selected=${this._session.selected}
                .sessionRevision=${this._session.revision}
                .suspendPending=${this._runtime.pending}
                .suspendSupported=${runtime?.supported === true}
                .suspended=${suspended}
                .transport=${this._session.transport}
                .webRtcMedia=${this._session.webRtcVideo}
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
        <button
          class="stage-resize-handle"
          type="button"
          role="slider"
          title=${this.localize("camera.stage_resize_title")}
          aria-label=${this.localize("camera.stage_height")}
          aria-orientation="vertical"
          aria-valuemin="56"
          aria-valuemax="100"
          aria-valuenow=${String(this._stageResize.heightPercentage)}
          aria-valuetext=${this.localize("camera.stage_height_value", {
            percent: this._stageResize.heightPercentage,
          })}
          ?hidden=${!this.active || suspended || !this.entityId}
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
          .localize=${this.localize}
          @camera-suspend-cancel=${this._handleSuspendCancel}
          @camera-suspend-confirm=${this._handleSuspendConfirm}
        ></${suspendDialogTag}>
      </div>
    `;
  }

  protected updated(): void {
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
    this._publishCameraSession();
  }

  public disconnectedCallback(): void {
    this.cameraSession?.clear(this);
    super.disconnectedCallback();
  }

  private _publishCameraSession(): void {
    if (!this.active || !this.entityId) {
      this.cameraSession?.clear(this);
      return;
    }
    this.cameraSession?.publish(this, {
      available:
        this.available &&
        this._runtime.snapshot?.available !== false &&
        this._runtime.snapshot?.suspended !== true,
      entityId: this.entityId,
      connection: this.connection,
      incomingStream: this._session.webRtcStream,
      muted: this._audio.muted,
      overlayVisible: this.overlayVisible,
      holdOverlay: () => this._presentation?.holdOverlay() ?? (() => undefined),
      revealOverlay: () => this._presentation?.revealOverlay(),
      setMuted: (muted) => this._audio.setUserMuted(muted),
      setTalkAudioActive: (active) => this._audio.setTalkAudioActive(active),
    });
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

  private _handleStageSizeChange(size: CameraStageSize): void {
    this.dispatchEvent(
      new CustomEvent(CAMERA_STAGE_SIZE_CHANGE_EVENT, {
        bubbles: true,
        composed: true,
        detail: size,
      }),
    );
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
        detail.suspended
          ? this.localize("camera.suspended_success")
          : this.localize("camera.resumed_success"),
        { key: "camera-runtime" },
      );
    } catch (error) {
      this._toasts.error(
        error instanceof Error
          ? error.message
          : detail.suspended
            ? this.localize("camera.suspend_failed")
            : this.localize("camera.resume_failed"),
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

  static styles = cameraViewStyles;
}

if (!customElements.get(CAMERA_VIEW_TAG)) {
  customElements.define(CAMERA_VIEW_TAG, CameraView);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_VIEW_TAG]: CameraView;
  }
}
