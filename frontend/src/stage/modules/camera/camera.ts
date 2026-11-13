import { LitElement } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  CAMERA_GESTURE_LOCK_EVENT,
  CAMERA_GROUP_VIEW_TAG,
  CAMERA_OVERLAY_VISIBILITY_EVENT,
  CAMERA_STAGE_SIZE_CHANGE_EVENT,
  CAMERA_TAG,
  CAMERA_VIEW_TAG,
} from "../../../core/constants";
import { DeviceProfileController } from "../../../core/device-profile";
import type { CameraSessionContext } from "../../camera-session-context";
import type { CameraSelectionContext } from "../../camera-selection-context";
import type {
  AlertTakeoverMode,
  FrigateFallbackTransport,
  LiveConnectionType,
  SlideAdvanceSeconds,
  SlideTransition,
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
import "./camera-group-view";
import type { CameraGroupMode } from "./camera-group-view";
import { cameraStyles } from "./camera.styles";
import { CameraCarouselController } from "./carousel.controller";
import type { DeepLinkController } from "../../../features/deep-links";
import type { ReviewItem } from "../../../api/reviews";
import { LiveActivityHighlightController } from "./activity-highlight.controller";
import {
  DEFAULT_CAMERA_STAGE_HEIGHT_RATIO,
  type CameraStageSizeChangeDetail,
  type CameraStageSize,
} from "./stage-resize.controller";
import { CameraSlideshowController } from "./slideshow.controller";

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

export interface CameraGroupConfig {
  readonly id: string;
  readonly label: string;
  readonly layout: "side_by_side" | "stacked";
  readonly mainEntityId: string;
  readonly secondaryEntityId: string;
}

interface CameraPresentationItem {
  readonly cameras:
    readonly [CameraItemConfig] | readonly [CameraItemConfig, CameraItemConfig];
  readonly id: string;
  readonly label: string;
  readonly layout?: "side_by_side" | "stacked";
}

const cameraViewTag = unsafeStatic(CAMERA_VIEW_TAG);
const cameraGroupViewTag = unsafeStatic(CAMERA_GROUP_VIEW_TAG);

/** Camera module root: owns ordered views and carousel selection only. */
export class CameraModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    alertTakeoverMode: { attribute: false },
    cameraSession: { attribute: false },
    cameraSelection: { attribute: false },
    cameras: { attribute: false },
    groups: { attribute: false },
    highlightActivity: { attribute: false, type: Boolean },
    localize: { attribute: false },
    retentionPreference: { attribute: false },
    preview: { attribute: false, type: Boolean },
    roundedCorners: { attribute: false, type: Boolean },
    shadowStyle: { attribute: false },
    slideAdvanceSeconds: { attribute: false },
    transition: { attribute: false },
    startAlertTakeoverOn: { attribute: false, type: Boolean },
    selectionId: { attribute: false },
  };

  private _activeIndex = 0;
  private readonly _groupModes = new Map<string, CameraGroupMode>();
  private _deepLinkLoad?: Promise<void>;
  private _deepLink?: DeepLinkController;
  private _navigationVisible = false;
  private _selectionSettled = true;
  private readonly _overlayVisibilityByCamera = new Map<string, boolean>();
  private _stageSize: CameraStageSize = {
    heightRatio: DEFAULT_CAMERA_STAGE_HEIGHT_RATIO,
    resized: false,
  };
  private _takeoverSelectionIndex?: number;
  private _slideshowAdvancing = false;
  private readonly _carousel = new CameraCarouselController(
    this,
    (index, settled) => this._select(index, settled),
  );
  private readonly _activityHighlight = new LiveActivityHighlightController(
    this,
    () => ({
      activeEntityId: this._activeEntityId,
      api: this.api,
      entityIds: this.cameras.map(({ entityId }) => entityId),
      highlightEnabled: this.highlightActivity,
      onTakeover: this._takeoverEntity,
      onTakeoverEnd: () => this._slideshow.resumeAfterTakeover(),
      startTakeoverEnabled: this.startAlertTakeoverOn,
      takeoverMode: this.alertTakeoverMode,
    }),
  );
  private readonly _deviceProfile = new DeviceProfileController(this);
  private readonly _slideshow = new CameraSlideshowController(this, () => ({
    advance: this._advanceSlideshow,
    intervalSeconds: this.slideAdvanceSeconds,
    itemCount: this._presentationItems.length,
  }));

  public api?: HomeAssistantApi;
  public alertTakeoverMode: AlertTakeoverMode = "both";
  public cameraSession?: CameraSessionContext;
  public cameraSelection?: CameraSelectionContext;
  public cameras: readonly CameraItemConfig[] = [];
  public groups: readonly CameraGroupConfig[] = [];
  public highlightActivity = true;
  public localize: LocalizeFunction = englishLocalize;
  public retentionPreference: MediaRetentionPreference = "automatic";
  public preview = false;
  public roundedCorners = true;
  public shadowStyle: CameraShadowStyle = "medium";
  public slideAdvanceSeconds: SlideAdvanceSeconds = 10;
  public transition: SlideTransition = "slide";
  public startAlertTakeoverOn = false;
  public selectionId = "";

  public connectedCallback(): void {
    super.connectedCallback();
    this._deepLinkLoad ??= import("../../../features/deep-links").then(
      ({ DeepLinkController }) => {
        if (this._deepLink) return;
        const controller = new DeepLinkController(this, () => ({
          api: this.api,
          cameras: this.cameras.map(({ entityId, label }) => ({
            entityId,
            title: label,
          })),
          cameraSelection: {
            selectCamera: (entityId) => this._selectPhysicalEntity(entityId),
          },
          enabled: !(
            this.getRootNode() as ShadowRoot & {
              host?: { preview?: boolean };
            }
          ).host?.preview,
        }));
        this._deepLink = controller;
        // The controller is loaded lazily after Lit has already connected the
        // host, so it needs the lifecycle edge that addController cannot
        // retroactively deliver. Future reconnects are handled by Lit.
        if (this.isConnected) controller.hostConnected();
      },
    );
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
      .querySelector<HTMLElement & { getStageRect?(): DOMRectReadOnly }>(
        `.swiper-slide:nth-child(${this._activeIndex + 1}) .camera-view`,
      )
      ?.getStageRect?.();
  }

  private get _presentationItems(): readonly CameraPresentationItem[] {
    const groupsByMain = new Map(
      this.groups.map((group) => [group.mainEntityId, group]),
    );
    const secondaryIds = new Set(
      this.groups.map(({ secondaryEntityId }) => secondaryEntityId),
    );
    const camerasById = new Map(
      this.cameras.map((camera) => [camera.entityId, camera]),
    );
    const items: CameraPresentationItem[] = [];
    for (const camera of this.cameras) {
      if (secondaryIds.has(camera.entityId)) continue;
      const group = groupsByMain.get(camera.entityId);
      const secondary = group
        ? camerasById.get(group.secondaryEntityId)
        : undefined;
      if (group && secondary) {
        items.push({
          cameras: [camera, secondary],
          id: group.id,
          label: group.label,
          layout: group.layout,
        });
      } else {
        items.push({
          cameras: [camera],
          id: camera.entityId,
          label: camera.label,
        });
      }
    }
    return items;
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
      Math.min(this._presentationItems.length - 1, this._activeIndex),
    );
    const cameraIds = new Set([
      ...this.cameras.map(({ entityId }) => entityId),
      ...this._presentationItems.map(({ id }) => id),
    ]);
    for (const entityId of this._overlayVisibilityByCamera.keys()) {
      if (!cameraIds.has(entityId))
        this._overlayVisibilityByCamera.delete(entityId);
    }
    this._navigationVisible =
      this._overlayVisibilityByCamera.get(this._activePresentation?.id ?? "") ??
      false;
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
              this._activeClassification &&
              this._activePresentation?.cameras.length === 1
                ? `activity-${this._activeClassification}`
                : "",
              this._activePresentation?.cameras.length === 2
                ? "camera-group-active"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
      role="region"
      aria-label=${this.localize("camera.views")}
      aria-roledescription="carousel"
    >
      <div class="swiper-wrapper">
        ${repeat(
          this._presentationItems,
          ({ id }) => id,
          (item, index) => staticHtml`<div
            class="swiper-slide"
            role="group"
            aria-hidden=${index === this._activeIndex ? "false" : "true"}
            aria-label=${this.localize("camera.position", {
              position: index + 1,
              total: this._presentationItems.length,
            })}
            aria-roledescription="slide"
            ?inert=${index !== this._activeIndex}
          >
            ${
              item.cameras.length === 2
                ? staticHtml`<${cameraGroupViewTag}
                    class="camera-view"
                    .active=${index === this._activeIndex}
                    .api=${this.api}
                    .cameraSession=${this.cameraSession}
                    .cameras=${item.cameras}
                    .classifications=${this._activityHighlight.classifications}
                    .layout=${item.layout}
                    .localize=${this.localize}
                    .mode=${this._groupMode(item)}
                    .presentationId=${item.id}
                    .preview=${this.preview}
                    .stageHeightRatio=${this._stageSize.heightRatio}
                    .stageResized=${this._stageSize.resized}
                    @camera-group-cycle=${this._handleGroupCycle}
                    @camera-group-mode=${this._handleGroupMode}
                  ></${cameraGroupViewTag}>`
                : staticHtml`<${cameraViewTag}
              class="camera-view"
              .active=${index === this._activeIndex}
              .connect=${index === this._activeIndex}
              .api=${this.api}
              .cameraSession=${this.cameraSession}
              .available=${item.cameras[0].available}
              .connection=${item.cameras[0].connection}
              .entityId=${item.cameras[0].entityId}
              .frigateFallback=${item.cameras[0].frigateFallback}
              .interactionActive=${index === this._activeIndex}
              .lowLatencyHls=${item.cameras[0].lowLatencyHls}
              .localize=${this.localize}
              .overlayVisible=${
                this._overlayVisibilityByCamera.get(item.id) ?? false
              }
              .preview=${this.preview}
              .posterUrl=${item.cameras[0].posterUrl}
              .stageHeightRatio=${this._stageSize.heightRatio}
              .stageResized=${this._stageSize.resized}
              .startUnmutedPcTablet=${item.cameras[0].startUnmutedPcTablet}
              .startUnmutedPhone=${item.cameras[0].startUnmutedPhone}
            ></${cameraViewTag}>
            `
            }
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
        ?disabled=${this._presentationItems.length < 2 || this._activeIndex === 0}
        @pointerdown=${this._stopPointerPropagation}
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
          this._presentationItems.length < 2 ||
          this._activeIndex === this._presentationItems.length - 1
        }
        @pointerdown=${this._stopPointerPropagation}
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
      this._presentationItems.length,
      this._activeIndex,
      this.transition,
    );
  }

  private _select(index: number, settled = true): void {
    const next = Math.max(
      0,
      Math.min(this._presentationItems.length - 1, index),
    );
    const takeoverSelection = this._takeoverSelectionIndex === next;
    if (this._takeoverSelectionIndex !== undefined && !takeoverSelection) {
      this._takeoverSelectionIndex = undefined;
    }
    const selectionChanged = next !== this._activeIndex;
    const settlementChanged = settled !== this._selectionSettled;
    if (settled) this._takeoverSelectionIndex = undefined;
    if (!selectionChanged && !settlementChanged) return;
    this._selectionSettled = settled;
    if (!selectionChanged) {
      this._publishSelection();
      return;
    }
    if (!takeoverSelection) {
      const entityId = this._presentationItems[next]?.cameras[0].entityId;
      if (entityId) this._activityHighlight.userSelected(entityId);
      if (!this._slideshowAdvancing) this._slideshow.manualSelection();
    }
    this._activeIndex = next;
    this._syncCameraActivity();
    const nextPresentationId = this._presentationItems[next]?.id;
    if (nextPresentationId) {
      this._overlayVisibilityByCamera.set(nextPresentationId, false);
    }
    this._navigationVisible = false;
    this._carousel.setInteractionLocked(false);
    this.requestUpdate();
    this._publishSelection();
  }

  private _selectEntity = (entityId: string): void => {
    const index = this._presentationItems.findIndex(
      ({ id }) => id === entityId,
    );
    if (index < 0) return;
    this._slideshow.manualSelection();
    this._activityHighlight.userSelected(entityId);
    this._carousel.select(index);
  };

  private _selectPhysicalEntity(entityId: string): boolean {
    const index = this._presentationItems.findIndex(({ cameras }) =>
      cameras.some((camera) => camera.entityId === entityId),
    );
    const item = this._presentationItems[index];
    if (!item) return false;
    let groupModeChanged = false;
    if (item.cameras.length === 2) {
      const nextMode =
        item.cameras[1].entityId === entityId ? "secondary" : "main";
      groupModeChanged = this._groupMode(item) !== nextMode;
      this._groupModes.set(item.id, nextMode);
    }
    if (index === this._activeIndex) {
      if (groupModeChanged) {
        this._activityHighlight.userSelected(entityId);
        this.requestUpdate();
      }
      return true;
    }
    return this.cameraSelection?.select(this.selectionId, item.id) ?? false;
  }

  private readonly _activateEntity = (entityId: string): void => {
    const index = this._presentationItems.findIndex(
      ({ id }) => id === entityId,
    );
    if (index < 0) return;
    this._slideshow.manualSelection();
    if (index !== this._activeIndex) {
      this._selectEntity(entityId);
      return;
    }
    const item = this._presentationItems[index];
    if (item?.cameras.length !== 2) return;
    this._cycleGroup(item);
  };

  private readonly _takeoverEntity = (entityId: string): void => {
    const index = this._presentationItems.findIndex(({ cameras }) =>
      cameras.some((camera) => camera.entityId === entityId),
    );
    if (index < 0) return;
    this._slideshow.hold();
    const item = this._presentationItems[index];
    if (item?.cameras.length === 2) {
      this._groupModes.set(
        item.id,
        this._deviceProfile.profile.deviceClass === "phone"
          ? item.cameras[1].entityId === entityId
            ? "secondary"
            : "main"
          : "combined",
      );
    }
    if (index === this._activeIndex) {
      this.requestUpdate();
      this._publishSelection();
      return;
    }
    this._takeoverSelectionIndex = index;
    this._carousel.select(index);
  };

  private _publishSelection(): void {
    if (!this.cameraSelection || !this.selectionId) return;
    this.cameraSelection.publish(
      this.selectionId,
      this,
      {
        activeEntityId: this._activeEntityId,
        activeEntityIds: this._activeScopeEntityIds,
        activeSelectionId: this._activePresentation?.id,
        activeReviews: mergeActiveReviews(
          this._activeScopeEntityIds.flatMap((entityId) =>
            this._activityHighlight.reviewsFor(entityId),
          ),
        ),
        items: this._presentationItems.map((item) => ({
          activity: strongestClassification(
            item.cameras.map(({ entityId }) =>
              this._activityHighlight.classifications.get(entityId),
            ),
          ),
          entityId: item.id,
          entityIds: item.cameras.map(({ entityId }) => entityId),
          entityLabels: item.cameras.map(({ entityId, label }) => ({
            entityId,
            label,
          })),
          label: item.label,
          position:
            item.id === this._activePresentation?.id
              ? this._groupPosition(item)
              : undefined,
        })),
        settled: this._selectionSettled,
        slideshowAvailable: this._presentationItems.length > 1,
        slideshowEnabled: this._slideshow.enabled,
        slideshowHeld: this._slideshow.held,
        slideshowRemainingSeconds: this._slideshow.remainingSeconds,
        takeoverAvailable: this.alertTakeoverMode !== "off",
        takeoverEnabled: this._activityHighlight.takeoverEnabled,
      },
      this._selectEntity,
      () => this._activityHighlight.toggleTakeover(),
      this._activateEntity,
      () => this._slideshow.toggle(),
    );
  }

  private readonly _advanceSlideshow = (): void => {
    const count = this._presentationItems.length;
    if (count <= 1) return;
    this._slideshowAdvancing = true;
    try {
      this._carousel.select((this._activeIndex + 1) % count);
    } finally {
      this._slideshowAdvancing = false;
    }
  };

  private readonly _previous = (): void => {
    this._slideshow.manualSelection();
    this._carousel.previous();
  };

  private readonly _next = (): void => {
    this._slideshow.manualSelection();
    this._carousel.next();
  };

  private readonly _stopPointerPropagation = (event: PointerEvent): void => {
    event.stopPropagation();
  };

  private readonly _handleGestureLock = (
    event: CustomEvent<CameraGestureLockDetail>,
  ): void => {
    if (!this._activeScopeEntityIds.includes(event.detail.key ?? "")) return;
    this._carousel.setInteractionLocked(event.detail.locked);
  };

  private readonly _handleStageSizeChange = (
    event: CustomEvent<CameraStageSizeChangeDetail>,
  ): void => {
    event.stopPropagation();
    this._stageSize = event.detail;
    if (this._stageSize.resized) {
      this.style.blockSize = "auto";
      this.style.aspectRatio = String(1 / this._stageSize.heightRatio);
    } else {
      this.style.removeProperty("block-size");
      this.style.removeProperty("aspect-ratio");
    }
    if (event.detail.transient !== true) this.requestUpdate();
  };

  private readonly _handleOverlayVisibility = (
    event: CustomEvent<CameraOverlayVisibilityDetail>,
  ): void => {
    event.stopPropagation();
    this._overlayVisibilityByCamera.set(event.detail.key, event.detail.visible);
    const activeId = this._activePresentation?.id;
    if (event.detail.key !== activeId) return;
    this._navigationVisible = event.detail.visible;
    this.requestUpdate();
  };

  private _syncCameraActivity(): void {
    const manager = getMediaSessionManager();
    manager.setCameraActivity(this, this._activeEntityId);
    manager.setCameraRetentionPreference(
      this,
      this.cameras.map(({ entityId }) => entityId),
      this.retentionPreference,
    );
  }

  private get _activePresentation(): CameraPresentationItem | undefined {
    return this._presentationItems[this._activeIndex];
  }

  private _groupMode(item: CameraPresentationItem): CameraGroupMode {
    const mode = this._groupModes.get(item.id) ?? "combined";
    if (this._deviceProfile.profile.deviceClass !== "phone") return mode;
    return mode === "secondary" ? "secondary" : "main";
  }

  private get _activeScopeEntityIds(): readonly string[] {
    const item = this._activePresentation;
    if (!item) return [];
    if (item.cameras.length === 1) return [item.cameras[0].entityId];
    if (this._deviceProfile.profile.deviceClass === "phone") {
      return item.cameras.map(({ entityId }) => entityId);
    }
    const mode = this._groupMode(item);
    if (mode === "main") return [item.cameras[0].entityId];
    if (mode === "secondary") return [item.cameras[1].entityId];
    return item.cameras.map(({ entityId }) => entityId);
  }

  private get _activeEntityId(): string | undefined {
    const item = this._activePresentation;
    if (!item) return undefined;
    return this._groupMode(item) === "secondary" && item.cameras.length === 2
      ? item.cameras[1].entityId
      : item.cameras[0].entityId;
  }

  private get _activeClassification(): "alert" | "detection" | undefined {
    return strongestClassification(
      this._activeScopeEntityIds.map((entityId) =>
        this._activityHighlight.classifications.get(entityId),
      ),
    );
  }

  private _groupPosition(
    item: CameraPresentationItem,
  ): "down" | "left" | "right" | "up" | undefined {
    if (item.cameras.length !== 2) return undefined;
    const mode = this._groupMode(item);
    if (mode === "combined") return undefined;
    if (item.layout === "stacked") return mode === "main" ? "up" : "down";
    return mode === "main" ? "left" : "right";
  }

  private _cycleGroup(item: CameraPresentationItem): void {
    const current = this._groupMode(item);
    const phone = this._deviceProfile.profile.deviceClass === "phone";
    const next = phone
      ? current === "secondary"
        ? "main"
        : "secondary"
      : current === "combined"
        ? "main"
        : current === "main"
          ? "secondary"
          : "combined";
    this._groupModes.set(item.id, next);
    this.requestUpdate();
    this._publishSelection();
  }

  private readonly _handleGroupCycle = (): void => {
    const item = this._activePresentation;
    if (item?.cameras.length === 2) this._cycleGroup(item);
  };

  private readonly _handleGroupMode = (
    event: CustomEvent<{ mode: CameraGroupMode }>,
  ): void => {
    event.stopPropagation();
    const item = this._activePresentation;
    if (item?.cameras.length !== 2) return;
    this._groupModes.set(item.id, event.detail.mode);
    this.requestUpdate();
    this._publishSelection();
  };

  static styles = cameraStyles;
}

function strongestClassification(
  values: readonly ("alert" | "detection" | undefined)[],
): "alert" | "detection" | undefined {
  return values.includes("alert")
    ? "alert"
    : values.includes("detection")
      ? "detection"
      : undefined;
}

function mergeActiveReviews(
  reviews: readonly ReviewItem[],
): readonly ReviewItem[] {
  const byId = new Map(reviews.map((review) => [review.id, review]));
  return [...byId.values()].sort(
    (left, right) =>
      right.start_time - left.start_time || left.id.localeCompare(right.id),
  );
}

if (!customElements.get(CAMERA_TAG)) {
  customElements.define(CAMERA_TAG, CameraModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_TAG]: CameraModule;
  }
}
