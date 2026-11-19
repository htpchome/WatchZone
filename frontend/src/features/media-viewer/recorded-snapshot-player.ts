import { LitElement, html } from "lit";

import {
  RECORDED_MEDIA_ERROR_EVENT,
  RECORDED_SNAPSHOT_PLAYER_TAG,
} from "../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { MediaPresentationController } from "../../ui/media-presentation.controller";
import { recordedSnapshotPlayerStyles } from "./recorded-snapshot-player.styles";

const DEFAULT_PRESENTATION_HEIGHT_RATIO = 9 / 16;

/** Shared zoomable snapshot presentation for every recorded-media shell. */
export class RecordedSnapshotPlayer extends LitElement {
  public static properties = {
    alt: { type: String },
    localize: { attribute: false },
    source: { type: String },
  };

  public alt = "";
  public localize: LocalizeFunction = englishLocalize;
  public source = "";

  public static styles = recordedSnapshotPlayerStyles;

  /** The sole box whose height is controlled by a presentation shell. */
  public get presentationSurface(): HTMLElement | undefined {
    return this._viewport();
  }

  public setPresentationHeightRatio(heightRatio: number): void {
    this._presentationHeightRatio = Math.min(
      1,
      Math.max(DEFAULT_PRESENTATION_HEIGHT_RATIO, heightRatio),
    );
    this.style.setProperty(
      "--wzc-recorded-media-presentation-aspect-ratio",
      String(1 / this._presentationHeightRatio),
    );
    this._syncBasePresentationScale();
  }

  private _mediaHeightRatio?: number;
  private _presentationHeightRatio = DEFAULT_PRESENTATION_HEIGHT_RATIO;
  private readonly _media = new MediaPresentationController(this);

  protected render() {
    return html`<div
        class=${this._media.zoom.pannable ? "viewport pannable" : "viewport"}
        tabindex="0"
        aria-label=${this.localize("media_player.zoom_view", {
          percent: Math.round(this._media.zoom.scale * 100),
        })}
        @pointerenter=${this._media.overlay.handlePointerEnter}
        @pointerleave=${this._media.overlay.handlePointerLeave}
        @pointerdown=${this._media.handlePointerDown}
        @pointermove=${this._media.handlePointerMove}
        @pointerup=${this._media.handlePointerUp}
        @pointercancel=${this._media.handlePointerCancel}
        @lostpointercapture=${this._media.handleLostPointerCapture}
        @click=${this._media.handleClick}
        @wheel=${this._media.handleWheel}
        @keydown=${this._media.handleKeyDown}
        @focusin=${this._media.overlay.handleFocusIn}
        @focusout=${this._media.overlay.handleFocusOut}
      >
        <img
          class=${
            this._media.zoom.interacting ? "snapshot interacting" : "snapshot"
          }
          style=${`transform: ${this._media.zoom.transform}`}
          src=${this.source}
          alt=${this.alt}
          draggable="false"
          @load=${this._handleLoad}
          @error=${this._handleError}
        />
      </div>
      <slot name="media-resize-handle"></slot>`;
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (!changed.has("source")) return;
    this._mediaHeightRatio = undefined;
    this._media.configure(this.source);
    this._media.zoom.setBasePresentationScale(1);
    this._media.zoom.setMediaDimensions(0, 0);
  }

  protected firstUpdated(): void {
    this._observeMediaPresentation();
  }

  protected updated(): void {
    this._observeMediaPresentation();
  }

  private _image(): HTMLImageElement | undefined {
    return this.renderRoot.querySelector<HTMLImageElement>("img") ?? undefined;
  }

  private _viewport(): HTMLElement | undefined {
    return this.renderRoot.querySelector<HTMLElement>(".viewport") ?? undefined;
  }

  private _observeMediaPresentation(): void {
    this._media.observe(this._viewport(), this._image());
  }

  private readonly _handleLoad = (): void => {
    const image = this._image();
    const width = image?.naturalWidth ?? 0;
    const height = image?.naturalHeight ?? 0;
    if (width <= 0 || height <= 0) return;
    this._mediaHeightRatio = height / width;
    this._media.zoom.setMediaDimensions(width, height);
    this._syncBasePresentationScale();
  };

  private _syncBasePresentationScale(): void {
    const mediaHeightRatio = this._mediaHeightRatio;
    this._media.zoom.setBasePresentationScale(
      mediaHeightRatio !== undefined &&
        this._presentationHeightRatio > mediaHeightRatio
        ? this._presentationHeightRatio / mediaHeightRatio
        : 1,
    );
  }

  private readonly _handleError = (): void => {
    this.dispatchEvent(
      new CustomEvent(RECORDED_MEDIA_ERROR_EVENT, {
        bubbles: true,
        composed: true,
      }),
    );
  };
}

if (!customElements.get(RECORDED_SNAPSHOT_PLAYER_TAG)) {
  customElements.define(RECORDED_SNAPSHOT_PLAYER_TAG, RecordedSnapshotPlayer);
}

declare global {
  interface HTMLElementTagNameMap {
    [RECORDED_SNAPSHOT_PLAYER_TAG]: RecordedSnapshotPlayer;
  }
}
