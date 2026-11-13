import { html, LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  CAMERA_CONTROLS_TAG,
  CAMERA_GROUP_VIEW_TAG,
  CAMERA_OVERLAY_VISIBILITY_EVENT,
  CAMERA_STAGE_SIZE_CHANGE_EVENT,
  CAMERA_SUSPEND_DIALOG_TAG,
  CAMERA_VIEW_TAG,
} from "../../../core/constants";
import { DeviceProfileController } from "../../../core/device-profile";
import {
  isMediaFullscreenActive,
  mediaFullscreenSupported,
  toggleMediaFullscreen,
} from "../../../core/fullscreen";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { pictureInPictureMethod } from "../../../core/picture-in-picture";
import { renderIcon } from "../../../ui/icons";
import type { CameraSessionContext } from "../../camera-session-context";
import type {
  FrigateFallbackTransport,
  LiveConnectionType,
} from "../../../core/config";
import type { CameraControlEventDetail } from "./controls-overlay";
import "./controls-overlay";
import type { CameraView } from "./camera-view";
import "./camera-view";
import { downloadSnapshot } from "./live/frame-capture";
import type { CameraToastRequestDetail } from "./live/presentation";
import type { CameraSuspendConfirmDetail } from "./suspend-dialog";
import "./suspend-dialog";
import { cameraGroupViewStyles } from "./camera-group-view.styles";
import { stageResizeHandleStyles } from "./stage-resize-handle.styles";
import {
  CameraStageResizeController,
  DEFAULT_CAMERA_STAGE_HEIGHT_RATIO,
  type CameraStageSize,
} from "./stage-resize.controller";

export type CameraGroupMode = "combined" | "main" | "secondary";

export interface GroupCameraItem {
  readonly available: boolean;
  readonly connection: LiveConnectionType;
  readonly entityId: string;
  readonly frigateFallback?: FrigateFallbackTransport;
  readonly lowLatencyHls: boolean;
  readonly posterUrl?: string;
  readonly startUnmutedPcTablet: boolean;
  readonly startUnmutedPhone: boolean;
}

const controlsTag = unsafeStatic(CAMERA_CONTROLS_TAG);
const suspendDialogTag = unsafeStatic(CAMERA_SUSPEND_DIALOG_TAG);

export class CameraGroupView extends LitElement {
  public static properties = {
    active: { attribute: false, type: Boolean },
    api: { attribute: false },
    cameraSession: { attribute: false },
    cameras: { attribute: false },
    classifications: { attribute: false },
    layout: { attribute: false },
    localize: { attribute: false },
    mode: { attribute: false },
    overlayVisible: { attribute: false, type: Boolean },
    stageHeightRatio: { attribute: false, type: Number },
    stageResized: { attribute: false, type: Boolean },
  };

  private _audioFocus: 0 | 1 = 0;
  private readonly _deviceProfile = new DeviceProfileController(this);
  private _fullscreenActive = false;
  private _overlayVisible = false;
  private _snapshotPending = false;
  private _suspendDialogActive = false;
  private readonly _stageResize = new CameraStageResizeController(
    this,
    undefined,
    undefined,
    (size) => this._handleStageSizeChange(size),
  );

  public active = false;
  public api?: HomeAssistantApi;
  public cameraSession?: CameraSessionContext;
  public cameras: readonly [GroupCameraItem, GroupCameraItem] | readonly [] =
    [];
  public classifications: ReadonlyMap<string, "alert" | "detection"> =
    new Map();
  public layout: "side_by_side" | "stacked" = "side_by_side";
  public localize: LocalizeFunction = englishLocalize;
  public mode: CameraGroupMode = "combined";
  public overlayVisible = false;
  public stageHeightRatio = DEFAULT_CAMERA_STAGE_HEIGHT_RATIO;
  public stageResized = false;

  protected render() {
    const [main, secondary] = this.cameras;
    if (!main || !secondary) return html``;
    const phone = this._deviceProfile.profile.deviceClass === "phone";
    const visibleIndex = this.mode === "secondary" ? 1 : 0;
    const combined = !phone && this.mode === "combined";
    const focus = this._audioFocus === 1 ? this._secondaryView : this._mainView;
    const visible = this._overlayVisible || this.overlayVisible;
    return staticHtml`<div
      class="group"
      @camera-view-session-changed=${this._handleSessionChanged}
    >
      <div class=${`feeds ${
        combined
          ? this.layout === "stacked"
            ? "stacked"
            : "side-by-side"
          : "solo"
      }`}>
        ${[main, secondary].map((camera, index) => {
          const shown = combined || index === visibleIndex;
          const classification = this.classifications.get(camera.entityId);
          return staticHtml`<div class=${[
            "feed",
            shown ? "visible-mobile" : "hidden",
            classification ? `activity-${classification}` : "",
          ]
            .filter(Boolean)
            .join(" ")}>
            <wzc-camera-view
              .active=${this.active && this._audioFocus === index}
              .connect=${this.active && shown}
              .controlsEnabled=${false}
              .publishSession=${false}
              .resizeEnabled=${false}
              .api=${this.api}
              .available=${camera.available}
              .connection=${camera.connection}
              .entityId=${camera.entityId}
              .frigateFallback=${camera.frigateFallback}
              .lowLatencyHls=${camera.lowLatencyHls}
              .localize=${this.localize}
              .overlayVisible=${visible}
              .posterUrl=${camera.posterUrl}
              .startUnmutedPcTablet=${camera.startUnmutedPcTablet}
              .startUnmutedPhone=${camera.startUnmutedPhone}
            ></wzc-camera-view>
            ${
              !phone && shown
                ? staticHtml`<div class=${
                    visible ? "feed-actions visible" : "feed-actions"
                  }>
                    <button
                      class=${
                        this._audioFocus === index
                          ? "feed-action audio-target selected"
                          : "feed-action audio-target"
                      }
                      type="button"
                      title=${this.localize("camera.group_audio_target", {
                        position: index === 0 ? "A" : "B",
                      })}
                      aria-label=${this.localize("camera.group_audio_target", {
                        position: index === 0 ? "A" : "B",
                      })}
                      @pointerdown=${this._stopControlPointerPropagation}
                      @click=${(event: Event) =>
                        this._selectAudioFocus(event, index)}
                    >
                      ${renderIcon(
                        this._audioFocus === index &&
                          !cameraViewMuted(this._views[index])
                          ? "volumeOn"
                          : "volumeOff",
                      )}
                      <span>${index === 0 ? "A" : "B"}</span>
                    </button>
                    <button
                      class="feed-action solo-target"
                      type="button"
                      title=${this.localize("camera.group_solo_target", {
                        position: index === 0 ? "A" : "B",
                      })}
                      aria-label=${this.localize("camera.group_solo_target", {
                        position: index === 0 ? "A" : "B",
                      })}
                      @pointerdown=${this._stopControlPointerPropagation}
                      @click=${(event: Event) =>
                        this._selectSoloFeed(event, index)}
                    >
                      ${renderIcon("fullscreen")}
                    </button>
                  </div>`
                : html``
            }
          </div>`;
        })}
      </div>
      <button
        class=${visible ? "feed-selector visible" : "feed-selector"}
        type="button"
        title=${this.localize("camera.switch_group_feed")}
        aria-label=${this.localize("camera.switch_group_feed")}
        @click=${this._toggleFeed}
        ?hidden=${!phone}
      >
        <span>${visibleIndex === 0 ? "A" : "B"}</span>
        ${renderIcon(
          this.layout === "stacked"
            ? visibleIndex === 0
              ? "chevronDown"
              : "chevronUp"
            : visibleIndex === 0
              ? "chevronRight"
              : "chevronLeft",
        )}
      </button>
      <${controlsTag}
        class="group-controls"
        .visible=${visible}
        .fullscreenActive=${this._fullscreenActive}
        .fullscreenSupported=${this._fullscreenSupported(focus?.activeVideo)}
        .muted=${focus?.getSession()?.muted ?? true}
        .localize=${this.localize}
        .pictureInPictureSupported=${Boolean(
          pictureInPictureMethod(focus?.activeVideo),
        )}
        .snapshotPending=${this._snapshotPending}
        .suspendPending=${this._visibleViews.some((view) => view.suspendPending)}
        .suspendSupported=${
          this._visibleViews.length > 0 &&
          this._visibleViews.every((view) => view.suspendSupported)
        }
        .suspended=${
          this._visibleViews.length > 0 &&
          this._visibleViews.every((view) => view.suspended)
        }
        @camera-control=${this._handleControl}
      ></${controlsTag}>
      <${suspendDialogTag}
        .active=${this._suspendDialogActive}
        .currentSuspended=${this._visibleViews.every((view) => view.suspended)}
        .pending=${this._visibleViews.some((view) => view.suspendPending)}
        .localize=${this.localize}
        @camera-suspend-cancel=${this._cancelSuspend}
        @camera-suspend-confirm=${this._confirmSuspend}
      ></${suspendDialogTag}>
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
        ?hidden=${!this.active}
        @pointerdown=${this._stageResize.handlePointerDown}
        @pointermove=${this._stageResize.handlePointerMove}
        @pointerup=${this._stageResize.handlePointerUp}
        @pointercancel=${this._stageResize.handlePointerCancel}
        @keydown=${this._stageResize.handleKeyDown}
      >
        ${renderIcon("chevronDown")}
      </button>
    </div>`;
  }

  protected updated(): void {
    this._stageResize.observe(
      this.renderRoot.querySelector<HTMLElement>(".group") ?? undefined,
      this.renderRoot.querySelector<HTMLButtonElement>(
        ".stage-resize-handle",
      ) ?? undefined,
    );
    this._publishSession();
  }

  protected willUpdate(): void {
    this._stageResize.configure(this.cameras[0]?.entityId);
    this._stageResize.setSize({
      heightRatio: this.stageHeightRatio,
      resized: this.stageResized,
    });
    if (this.mode === "main") this._audioFocus = 0;
    else if (this.mode === "secondary") this._audioFocus = 1;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener(
      CAMERA_OVERLAY_VISIBILITY_EVENT,
      this._handleOverlayVisibility as EventListener,
    );
    document.addEventListener("fullscreenchange", this._syncFullscreenState);
    document.addEventListener(
      "webkitfullscreenchange",
      this._syncFullscreenState,
    );
  }

  public disconnectedCallback(): void {
    this.removeEventListener(
      CAMERA_OVERLAY_VISIBILITY_EVENT,
      this._handleOverlayVisibility as EventListener,
    );
    document.removeEventListener("fullscreenchange", this._syncFullscreenState);
    document.removeEventListener(
      "webkitfullscreenchange",
      this._syncFullscreenState,
    );
    this.cameraSession?.clear(this);
    super.disconnectedCallback();
  }

  public getStageRect(): DOMRectReadOnly | undefined {
    return this.renderRoot
      .querySelector<HTMLElement>(".group")
      ?.getBoundingClientRect();
  }

  private get _views(): readonly CameraView[] {
    return [...this.renderRoot.querySelectorAll<CameraView>(CAMERA_VIEW_TAG)];
  }

  private get _mainView(): CameraView | undefined {
    return this._views[0];
  }

  private get _secondaryView(): CameraView | undefined {
    return this._views[1];
  }

  private get _visibleViews(): readonly CameraView[] {
    const phone = this._deviceProfile.profile.deviceClass === "phone";
    if (!phone && this.mode === "combined") return this._views;
    return [
      this.mode === "secondary" ? this._secondaryView : this._mainView,
    ].filter((view): view is CameraView => Boolean(view));
  }

  private _publishSession(): void {
    if (!this.active) {
      this.cameraSession?.clear(this);
      return;
    }
    const main = this._mainView?.getSession();
    const focus = (
      this._audioFocus === 1 ? this._secondaryView : this._mainView
    )?.getSession();
    if (!main || !focus) return;
    this.cameraSession?.publish(this, {
      ...main,
      muted: focus.muted,
      overlayVisible: this._overlayVisible,
      holdOverlay: () => {
        const releases = this._visibleViews.map((view) =>
          view.getSession()?.holdOverlay(),
        );
        return () => releases.forEach((release) => release?.());
      },
      revealOverlay: () =>
        this._visibleViews.forEach((view) =>
          view.getSession()?.revealOverlay(),
        ),
      setMuted: (muted) =>
        (this._audioFocus === 1
          ? this._secondaryView
          : this._mainView
        )?.setMuted(muted),
    });
  }

  private readonly _handleSessionChanged = (event: Event): void => {
    event.stopPropagation();
    this._publishSession();
    this.requestUpdate();
  };

  private readonly _handleOverlayVisibility = (
    event: CustomEvent<{ visible: boolean }>,
  ): void => {
    if (this._overlayVisible === event.detail.visible) return;
    this._overlayVisible = event.detail.visible;
    if (event.detail.visible) {
      this._visibleViews.forEach((view) => view.getSession()?.revealOverlay());
    }
    this.requestUpdate();
  };

  private readonly _toggleFeed = (): void => {
    this.dispatchEvent(
      new CustomEvent("camera-group-cycle", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private readonly _stopControlPointerPropagation = (
    event: PointerEvent,
  ): void => {
    event.stopPropagation();
  };

  private _selectAudioFocus(event: Event, index: number): void {
    event.stopPropagation();
    this._audioFocus = index === 1 ? 1 : 0;
    this._views.forEach((view, viewIndex) => {
      if (viewIndex !== this._audioFocus) view.setMuted(true);
    });
    this.requestUpdate();
  }

  private _selectSoloFeed(event: Event, index: number): void {
    event.stopPropagation();
    const target = index === 1 ? "secondary" : "main";
    this.dispatchEvent(
      new CustomEvent("camera-group-mode", {
        bubbles: true,
        composed: true,
        detail: { mode: this.mode === target ? "combined" : target },
      }),
    );
  }

  private readonly _handleControl = (
    event: CustomEvent<CameraControlEventDetail>,
  ): void => {
    event.stopPropagation();
    const focus = this._audioFocus === 1 ? this._secondaryView : this._mainView;
    if (event.detail.action === "mute") {
      const session = focus?.getSession();
      if (session) focus?.setMuted(!session.muted);
    } else if (event.detail.action === "snapshot") {
      void this._takeSnapshot();
    } else if (event.detail.action === "suspend") {
      this._suspendDialogActive = true;
      this.requestUpdate();
    } else if (event.detail.action === "fullscreen") {
      void this._toggleFullscreen(focus?.activeVideo);
    } else {
      focus?.performControl(event.detail.action);
    }
  };

  private async _takeSnapshot(): Promise<void> {
    if (this._snapshotPending || this._visibleViews.length === 0) return;
    this._snapshotPending = true;
    this.requestUpdate();
    try {
      const blobs = await Promise.all(
        this._visibleViews.map((view) => view.captureFrame()),
      );
      downloadSnapshot(
        blobs.length === 1
          ? blobs[0]!
          : await combineFrames(blobs, this.layout),
        this.cameras[0]?.entityId,
      );
      this._requestToast(
        "success",
        this.localize("camera.snapshot_downloaded"),
        "camera-snapshot",
      );
    } catch (error) {
      this._requestToast(
        "error",
        error instanceof Error
          ? error.message
          : this.localize("camera.snapshot_failed"),
        "camera-snapshot",
      );
    } finally {
      this._snapshotPending = false;
      this.requestUpdate();
    }
  }

  private readonly _cancelSuspend = (): void => {
    this._suspendDialogActive = false;
    this.requestUpdate();
  };

  private readonly _confirmSuspend = (
    event: CustomEvent<CameraSuspendConfirmDetail>,
  ): void => {
    this._suspendDialogActive = false;
    void Promise.all(
      this._visibleViews.map((view) =>
        view.setSuspended(
          event.detail.suspended,
          event.detail.resumeAfterSeconds,
        ),
      ),
    ).finally(() => this.requestUpdate());
  };

  private _handleStageSizeChange(size: CameraStageSize): void {
    this.dispatchEvent(
      new CustomEvent(CAMERA_STAGE_SIZE_CHANGE_EVENT, {
        bubbles: true,
        composed: true,
        detail: size,
      }),
    );
  }

  private _fullscreenSupported(video?: HTMLVideoElement): boolean {
    return mediaFullscreenSupported(
      this.renderRoot.querySelector<HTMLElement>(".group"),
      video,
    );
  }

  private async _toggleFullscreen(video?: HTMLVideoElement): Promise<void> {
    try {
      await toggleMediaFullscreen(
        this.renderRoot.querySelector<HTMLElement>(".group"),
        video,
      );
    } catch (error) {
      this._requestToast(
        "error",
        error instanceof Error
          ? error.message
          : this.localize("camera.fullscreen_failed"),
        "camera-fullscreen",
      );
    }
    this._syncFullscreenState();
  }

  private readonly _syncFullscreenState = (): void => {
    const active = isMediaFullscreenActive(
      this._audioFocus === 1
        ? this._secondaryView?.activeVideo
        : this._mainView?.activeVideo,
    );
    if (active === this._fullscreenActive) return;
    this._fullscreenActive = active;
    this.requestUpdate();
  };

  private _requestToast(
    severity: CameraToastRequestDetail["severity"],
    message: string,
    key: string,
  ): void {
    this.dispatchEvent(
      new CustomEvent<CameraToastRequestDetail>("camera-toast-request", {
        bubbles: true,
        composed: true,
        detail: { key, message, severity },
      }),
    );
  }

  static styles = [stageResizeHandleStyles, cameraGroupViewStyles];
}

async function combineFrames(
  blobs: readonly Blob[],
  layout: "side_by_side" | "stacked",
): Promise<Blob> {
  const images = await Promise.all(blobs.map(loadImage));
  const canvas = document.createElement("canvas");
  if (layout === "stacked") {
    canvas.width = Math.max(...images.map(({ naturalWidth }) => naturalWidth));
    canvas.height = images.reduce((sum, image) => sum + image.naturalHeight, 0);
  } else {
    canvas.width = images.reduce((sum, image) => sum + image.naturalWidth, 0);
    canvas.height = Math.max(
      ...images.map(({ naturalHeight }) => naturalHeight),
    );
  }
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Snapshot capture is not supported in this browser.");
  let offset = 0;
  for (const image of images) {
    context.drawImage(
      image,
      layout === "stacked" ? 0 : offset,
      layout === "stacked" ? offset : 0,
    );
    offset += layout === "stacked" ? image.naturalHeight : image.naturalWidth;
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Snapshot capture failed.")),
      "image/jpeg",
      0.92,
    ),
  );
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  return image.decode().then(
    () => {
      URL.revokeObjectURL(url);
      return image;
    },
    (error) => {
      URL.revokeObjectURL(url);
      throw error;
    },
  );
}

function cameraViewMuted(view: CameraView | undefined): boolean {
  return view?.getSession()?.muted ?? true;
}

if (!customElements.get(CAMERA_GROUP_VIEW_TAG)) {
  customElements.define(CAMERA_GROUP_VIEW_TAG, CameraGroupView);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_GROUP_VIEW_TAG]: CameraGroupView;
  }
}
