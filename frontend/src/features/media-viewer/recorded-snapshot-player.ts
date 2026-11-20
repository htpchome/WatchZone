import { LitElement, html } from "lit";

import {
  RECORDED_MEDIA_ERROR_EVENT,
  RECORDED_SNAPSHOT_PLAYER_TAG,
} from "../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { ZoomController } from "../../ui/zoom";
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
    this._zoom.setPresentationHeightRatio(this._presentationHeightRatio);
  }

  private _presentationHeightRatio = DEFAULT_PRESENTATION_HEIGHT_RATIO;
  private readonly _zoom = new ZoomController(this);

  protected render() {
    return html`<div
        class="viewport"
        tabindex="0"
        aria-label=${this.localize("media_player.zoom_view", {
          percent: Math.round(this._zoom.scale * 100),
        })}
      >
        <div class="media-surface">
          <img
            class="snapshot"
            src=${this.source}
            alt=${this.alt}
            draggable="false"
            @load=${this._handleLoad}
            @error=${this._handleError}
          />
        </div>
      </div>
      <slot name="media-resize-handle"></slot>`;
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (!changed.has("source")) return;
    this._zoom.configure(this.source);
    this._zoom.setMediaDimensions(0, 0);
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
    this._zoom.attach(
      this._viewport(),
      this.renderRoot.querySelector<HTMLElement>(".media-surface") ?? undefined,
    );
  }

  private readonly _handleLoad = (): void => {
    const image = this._image();
    const width = image?.naturalWidth ?? 0;
    const height = image?.naturalHeight ?? 0;
    if (width <= 0 || height <= 0) return;
    this._zoom.setMediaDimensions(width, height);
  };

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
