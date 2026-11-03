import { LitElement } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  CAMERA_CONNECTION_SETTLED_EVENT,
  CAMERA_GESTURE_LOCK_EVENT,
  CAMERA_TAG,
  CAMERA_VIEW_TAG,
} from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import { renderIcon } from "../../ui/icons";
import type { CameraGestureLockDetail } from "./live/presentation";
import "./camera-view";
import { cameraStyles } from "./camera.styles";
import { CameraCarouselController } from "./carousel.controller";
import { CameraConnectionQueueController } from "./connection-queue.controller";

export type CameraShadowStyle = "medium" | "none" | "small";

export interface CameraItemConfig {
  readonly available: boolean;
  readonly entityId: string;
  readonly lowLatencyHls: boolean;
  readonly posterUrl?: string;
  readonly roundedCorners: boolean;
  readonly shadowStyle: CameraShadowStyle;
  readonly startUnmutedPcTablet: boolean;
  readonly startUnmutedPhone: boolean;
}

const cameraViewTag = unsafeStatic(CAMERA_VIEW_TAG);

/** Camera module root: owns ordered views and carousel selection only. */
export class CameraModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    cameras: { attribute: false },
  };

  private _activeIndex = 0;
  private readonly _carousel = new CameraCarouselController(this, (index) =>
    this._select(index),
  );
  private readonly _connections = new CameraConnectionQueueController(this);

  public api?: HomeAssistantApi;
  public cameras: readonly CameraItemConfig[] = [];

  public connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener(
      CAMERA_GESTURE_LOCK_EVENT,
      this._handleGestureLock as EventListener,
    );
    this.addEventListener(
      CAMERA_CONNECTION_SETTLED_EVENT,
      this._handleConnectionSettled as EventListener,
    );
  }

  public disconnectedCallback(): void {
    this.removeEventListener(
      CAMERA_GESTURE_LOCK_EVENT,
      this._handleGestureLock as EventListener,
    );
    this.removeEventListener(
      CAMERA_CONNECTION_SETTLED_EVENT,
      this._handleConnectionSettled as EventListener,
    );
    super.disconnectedCallback();
  }

  protected willUpdate(): void {
    this._activeIndex = Math.max(
      0,
      Math.min(this.cameras.length - 1, this._activeIndex),
    );
    this._connections.configure(
      this.cameras.map(({ available, entityId }) => ({
        available,
        key: entityId,
      })),
      this.api?.identity.connected !== false,
    );
  }

  protected render() {
    return staticHtml`<div
      class="camera-carousel swiper"
      role="region"
      aria-label="Camera views"
      aria-roledescription="carousel"
    >
      <div class="swiper-wrapper">
        ${repeat(
          this.cameras,
          ({ entityId }) => entityId,
          (camera, index) => staticHtml`<div
            class="swiper-slide"
            role="group"
            aria-label=${`Camera ${index + 1} of ${this.cameras.length}`}
            aria-roledescription="slide"
          >
            <${cameraViewTag}
              class="camera-view"
              .active=${index === this._activeIndex}
              .connect=${this._connections.isEnabled(camera.entityId)}
              .api=${this.api}
              .available=${camera.available}
              .entityId=${camera.entityId}
              .lowLatencyHls=${camera.lowLatencyHls}
              .posterUrl=${camera.posterUrl}
              .roundedCorners=${camera.roundedCorners}
              .shadowStyle=${camera.shadowStyle}
              .startUnmutedPcTablet=${camera.startUnmutedPcTablet}
              .startUnmutedPhone=${camera.startUnmutedPhone}
            ></${cameraViewTag}>
          </div>`,
        )}
      </div>
      <button
        class="carousel-navigation previous"
        type="button"
        aria-label="Previous camera"
        ?disabled=${this.cameras.length < 2 || this._activeIndex === 0}
        @click=${this._previous}
      >
        ${renderIcon("chevronLeft")}
      </button>
      <button
        class="carousel-navigation next"
        type="button"
        aria-label="Next camera"
        ?disabled=${
          this.cameras.length < 2 ||
          this._activeIndex === this.cameras.length - 1
        }
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
    this._carousel.setInteractionLocked(false);
    this.requestUpdate();
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

  private readonly _handleConnectionSettled = (
    event: CustomEvent<{ readonly entityId: string }>,
  ): void => {
    this._connections.settle(event.detail.entityId);
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
