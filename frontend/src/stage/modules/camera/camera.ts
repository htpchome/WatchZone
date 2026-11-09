import { LitElement } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  CAMERA_GESTURE_LOCK_EVENT,
  CAMERA_OVERLAY_VISIBILITY_EVENT,
  CAMERA_STAGE_SIZE_CHANGE_EVENT,
  CAMERA_TAG,
  CAMERA_VIEW_TAG,
} from "../../../core/constants";
import { DeviceProfileController } from "../../../core/device-profile";
import type { CameraSessionContext } from "../../camera-session-context";
import type { CameraSelectionContext } from "../../camera-selection-context";
import type {
  FrigateFallbackTransport,
  LiveConnectionType,
} from "../../../core/config";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { getMediaSessionManager } from "../../../core/media-session-manager";
import type { MediaRetentionPreference } from "../../../core/media-retention-policy";
import { renderIcon } from "../../../ui/icons";
import { releaseTouchFocus } from "../../../ui/control-interaction";
import type { CameraGestureLockDetail } from "./live/presentation";
import type { CameraOverlayVisibilityDetail } from "./live/presentation";
import "./camera-view";
import { cameraStyles } from "./camera.styles";
import { CameraCarouselController } from "./carousel.controller";
import {
  DEFAULT_CAMERA_STAGE_HEIGHT_RATIO,
  type CameraStageSize,
} from "./stage-resize.controller";

export type CameraShadowStyle = "medium" | "none" | "small";

export interface CameraItemConfig {
  readonly available: boolean;
  readonly connection: LiveConnectionType;
  readonly entityId: string;
  readonly frigateFallback?: FrigateFallbackTransport;
  readonly lowLatencyHls: boolean;
  readonly label: string;
  readonly posterUrl?: string;
  readonly startUnmutedPcTablet: boolean;
  readonly startUnmutedPhone: boolean;
}

const cameraViewTag = unsafeStatic(CAMERA_VIEW_TAG);

/** Camera module root: owns ordered views and carousel selection only. */
export class CameraModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    cameraSession: { attribute: false },
    cameraSelection: { attribute: false },
    cameras: { attribute: false },
    localize: { attribute: false },
    retentionPreference: { attribute: false },
    roundedCorners: { attribute: false, type: Boolean },
    shadowStyle: { attribute: false },
    selectionId: { attribute: false },
  };

  private _activeIndex = 0;
  private _navigationVisible = false;
  private readonly _overlayVisibilityByCamera = new Map<string, boolean>();
  private _stageSize: CameraStageSize = {
    heightRatio: DEFAULT_CAMERA_STAGE_HEIGHT_RATIO,
    resized: false,
  };
  private readonly _carousel = new CameraCarouselController(this, (index) =>
    this._select(index),
  );
  private readonly _deviceProfile = new DeviceProfileController(this);

  public api?: HomeAssistantApi;
  public cameraSession?: CameraSessionContext;
  public cameraSelection?: CameraSelectionContext;
  public cameras: readonly CameraItemConfig[] = [];
  public localize: LocalizeFunction = englishLocalize;
  public retentionPreference: MediaRetentionPreference = "automatic";
  public roundedCorners = true;
  public shadowStyle: CameraShadowStyle = "medium";
  public selectionId = "";

  public connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener(
      CAMERA_GESTURE_LOCK_EVENT,
      this._handleGestureLock as EventListener,
    );
    this.addEventListener(
      CAMERA_STAGE_SIZE_CHANGE_EVENT,
      this._handleStageSizeChange as EventListener,
    );
    this.addEventListener(
      CAMERA_OVERLAY_VISIBILITY_EVENT,
      this._handleOverlayVisibility as EventListener,
    );
    this._publishSelection();
    this.requestUpdate();
  }

  /** Returns the visible live-stage bounds without exposing camera internals. */
  public getActiveStageRect(): DOMRectReadOnly | undefined {
    return this.renderRoot
      .querySelectorAll<HTMLElement & { getStageRect?(): DOMRectReadOnly }>(
        CAMERA_VIEW_TAG,
      )
      .item(this._activeIndex)
      ?.getStageRect?.();
  }

  public disconnectedCallback(): void {
    this.removeEventListener(
      CAMERA_GESTURE_LOCK_EVENT,
      this._handleGestureLock as EventListener,
    );
    this.removeEventListener(
      CAMERA_STAGE_SIZE_CHANGE_EVENT,
      this._handleStageSizeChange as EventListener,
    );
    this.removeEventListener(
      CAMERA_OVERLAY_VISIBILITY_EVENT,
      this._handleOverlayVisibility as EventListener,
    );
    getMediaSessionManager().clearCameraActivity(this);
    if (this.selectionId) this.cameraSelection?.clear(this.selectionId, this);
    super.disconnectedCallback();
  }

  protected willUpdate(): void {
    this._activeIndex = Math.max(
      0,
      Math.min(this.cameras.length - 1, this._activeIndex),
    );
    const cameraIds = new Set(this.cameras.map(({ entityId }) => entityId));
    for (const entityId of this._overlayVisibilityByCamera.keys()) {
      if (!cameraIds.has(entityId))
        this._overlayVisibilityByCamera.delete(entityId);
    }
    this._navigationVisible =
      this._overlayVisibilityByCamera.get(
        this.cameras[this._activeIndex]?.entityId ?? "",
      ) ?? false;
    this._syncCameraActivity();
    this._publishSelection();
  }

  protected render() {
    return staticHtml`<div
            class=${[
              "camera-carousel",
              "swiper",
              this.roundedCorners ? "" : "square-camera-corners",
              this.shadowStyle === "small" ? "camera-shadow-small" : "",
              this.shadowStyle === "none" ? "camera-shadow-none" : "",
            ]
              .filter(Boolean)
              .join(" ")}
      role="region"
      aria-label=${this.localize("camera.views")}
      aria-roledescription="carousel"
    >
      <div class="swiper-wrapper">
        ${repeat(
          this.cameras,
          ({ entityId }) => entityId,
          (camera, index) => staticHtml`<div
            class="swiper-slide"
            role="group"
            aria-label=${this.localize("camera.position", {
              position: index + 1,
              total: this.cameras.length,
            })}
            aria-roledescription="slide"
          >
            <${cameraViewTag}
              class="camera-view"
              .active=${index === this._activeIndex}
              .connect=${index === this._activeIndex}
              .api=${this.api}
              .cameraSession=${this.cameraSession}
              .available=${camera.available}
              .connection=${camera.connection}
              .entityId=${camera.entityId}
              .frigateFallback=${camera.frigateFallback}
              .lowLatencyHls=${camera.lowLatencyHls}
              .localize=${this.localize}
              .overlayVisible=${
                this._overlayVisibilityByCamera.get(camera.entityId) ?? false
              }
              .posterUrl=${camera.posterUrl}
              .stageHeightRatio=${this._stageSize.heightRatio}
              .stageResized=${this._stageSize.resized}
              .startUnmutedPcTablet=${camera.startUnmutedPcTablet}
              .startUnmutedPhone=${camera.startUnmutedPhone}
            ></${cameraViewTag}>
          </div>`,
        )}
      </div>
      <button
        class=${
          this._navigationVisible
            ? "carousel-navigation previous visible"
            : "carousel-navigation previous"
        }
        type="button"
        aria-label=${this.localize("camera.previous")}
        aria-hidden=${this._navigationVisible ? "false" : "true"}
        tabindex=${this._navigationVisible ? "0" : "-1"}
        ?disabled=${this.cameras.length < 2 || this._activeIndex === 0}
        @pointerup=${releaseTouchFocus}
        @click=${this._previous}
      >
        ${renderIcon("chevronLeft")}
      </button>
      <button
        class=${
          this._navigationVisible
            ? "carousel-navigation next visible"
            : "carousel-navigation next"
        }
        type="button"
        aria-label=${this.localize("camera.next")}
        aria-hidden=${this._navigationVisible ? "false" : "true"}
        tabindex=${this._navigationVisible ? "0" : "-1"}
        ?disabled=${
          this.cameras.length < 2 ||
          this._activeIndex === this.cameras.length - 1
        }
        @pointerup=${releaseTouchFocus}
        @click=${this._next}
      >
        ${renderIcon("chevronRight")}
      </button>
    </div>`;
  }

  protected updated(): void {
    this._carousel.observe(
      this.renderRoot.querySelector<HTMLElement>(".camera-carousel") ??
        undefined,
      this.cameras.length,
      this._activeIndex,
    );
  }

  private _select(index: number): void {
    const next = Math.max(0, Math.min(this.cameras.length - 1, index));
    if (next === this._activeIndex) return;
    this._activeIndex = next;
    this._syncCameraActivity();
    this._navigationVisible =
      this._overlayVisibilityByCamera.get(this.cameras[next]?.entityId ?? "") ??
      false;
    this._carousel.setInteractionLocked(false);
    this.requestUpdate();
    this._publishSelection();
  }

  private _selectEntity = (entityId: string): void => {
    const index = this.cameras.findIndex(
      (camera) => camera.entityId === entityId,
    );
    if (index >= 0) this._select(index);
  };

  private _publishSelection(): void {
    if (!this.cameraSelection || !this.selectionId) return;
    this.cameraSelection.publish(
      this.selectionId,
      this,
      {
        activeEntityId: this.cameras[this._activeIndex]?.entityId,
        items: this.cameras.map(({ entityId, label }) => ({ entityId, label })),
      },
      this._selectEntity,
    );
  }

  private readonly _previous = (): void => {
    this._carousel.previous();
  };

  private readonly _next = (): void => {
    this._carousel.next();
  };

  private readonly _handleGestureLock = (
    event: CustomEvent<CameraGestureLockDetail>,
  ): void => {
    if (event.detail.key !== this.cameras[this._activeIndex]?.entityId) return;
    this._carousel.setInteractionLocked(event.detail.locked);
  };

  private readonly _handleStageSizeChange = (
    event: CustomEvent<CameraStageSize>,
  ): void => {
    event.stopPropagation();
    this._stageSize = event.detail;
    this.requestUpdate();
  };

  private readonly _handleOverlayVisibility = (
    event: CustomEvent<CameraOverlayVisibilityDetail>,
  ): void => {
    event.stopPropagation();
    this._overlayVisibilityByCamera.set(event.detail.key, event.detail.visible);
    if (event.detail.key !== this.cameras[this._activeIndex]?.entityId) return;
    this._navigationVisible = event.detail.visible;
    this.requestUpdate();
  };

  private _syncCameraActivity(): void {
    const manager = getMediaSessionManager();
    manager.setCameraActivity(this, this.cameras[this._activeIndex]?.entityId);
    manager.setCameraRetentionPreference(
      this,
      this.cameras.map(({ entityId }) => entityId),
      this.retentionPreference,
    );
  }

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
