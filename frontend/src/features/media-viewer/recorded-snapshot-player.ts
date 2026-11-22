import { LitElement, html } from "lit";

import {
  RECORDED_MEDIA_DIMENSIONS_EVENT,
  RECORDED_MEDIA_ERROR_EVENT,
  RECORDED_SNAPSHOT_PLAYER_TAG,
} from "../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import type { RecordedMediaDimensions } from "../../core/recorded-media";
import { ZoomController } from "../../ui/zoom";
import { recordedSnapshotPlayerStyles } from "./recorded-snapshot-player.styles";

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

  /** The stable viewport whose height is controlled by a presentation shell. */
  public get presentationSurface(): HTMLElement | undefined {
    return this._viewport();
  }

  public setBasePresentationScale(scale: number): void {
    this._zoom.setBasePresentationScale(scale);
  }

  public beginStageResizeReturn(): void {
    this._zoom.beginStageResizeReturn();
  }

  public updateStageResizeReturn(progress: number): void {
    this._zoom.updateStageResizeReturn(progress);
  }

  public endStageResizeReturn(): void {
    this._zoom.endStageResizeReturn();
  }

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
          <div class="media-host">
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
    this._zoom.attach(this._viewport(), this._image());
  }

  private readonly _handleLoad = (): void => {
    const image = this._image();
    const width = image?.naturalWidth ?? 0;
    const height = image?.naturalHeight ?? 0;
    if (width <= 0 || height <= 0) return;
    this._zoom.setMediaDimensions(width, height);
    this.dispatchEvent(
      new CustomEvent<RecordedMediaDimensions>(
        RECORDED_MEDIA_DIMENSIONS_EVENT,
        {
          bubbles: true,
          composed: true,
          detail: { height, width },
        },
      ),
    );
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
