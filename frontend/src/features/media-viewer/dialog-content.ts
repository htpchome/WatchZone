import { html, type LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  RECORDED_MEDIA_INFORMATION_TAG,
  RECORDED_SNAPSHOT_PLAYER_TAG,
  RECORDED_VIDEO_PLAYER_TAG,
  RECORDING_SEGMENT_STATE_EVENT,
} from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import type { LocalizeFunction } from "../../core/localization";
import type { RecordedMediaRequest } from "../../core/recorded-media";
import type { ToastNotice } from "../../ui/toast/manager";
import type { RecordedVideoPlayer } from "./recorded-video-player";
import {
  recordedMediaHeading,
  type RecordedMediaInformation,
} from "./media-information";
import "./media-information";
import { renderRecordedMediaActions } from "./media-actions";
import "./recorded-snapshot-player";
import "./recorded-video-player";

const snapshotPlayerTag = unsafeStatic(RECORDED_SNAPSHOT_PLAYER_TAG);
const playerTag = unsafeStatic(RECORDED_VIDEO_PLAYER_TAG);
const informationTag = unsafeStatic(RECORDED_MEDIA_INFORMATION_TAG);
const recordingSegmentStateEvent = unsafeStatic(RECORDING_SEGMENT_STATE_EVENT);

interface DialogContentOptions {
  readonly active: boolean;
  readonly api?: HomeAssistantApi;
  readonly close: () => void;
  readonly localize: LocalizeFunction;
  readonly mediaResizeControl?: unknown;
  readonly notices: readonly ToastNotice[];
  readonly onHeaderDoubleClick?: (event: MouseEvent) => void;
  readonly onHeaderPointerCancel?: (event: PointerEvent) => void;
  readonly onHeaderPointerDown?: (event: PointerEvent) => void;
  readonly onHeaderPointerMove?: (event: PointerEvent) => void;
  readonly onHeaderPointerUp?: (event: PointerEvent) => void;
  readonly request?: RecordedMediaRequest;
}

/** Owns presentation-independent recorded-media dialog content and state. */
export class RecordedMediaDialogContent {
  private _segmentSelectionActive = false;

  public constructor(private readonly _host: LitElement) {}

  public reset(): void {
    this._segmentSelectionActive = false;
  }

  public render(options: DialogContentOptions): unknown {
    const { request } = options;
    return staticHtml`
      <div
        class="header"
        @pointerdown=${options.onHeaderPointerDown}
        @pointermove=${options.onHeaderPointerMove}
        @pointerup=${options.onHeaderPointerUp}
        @pointercancel=${options.onHeaderPointerCancel}
        @dblclick=${options.onHeaderDoubleClick}
      >
        <button
          class="close"
          type="button"
          title=${options.localize("media_player.close")}
          aria-label=${options.localize("media_player.close")}
          @pointerdown=${(event: Event) => event.stopPropagation()}
          @dblclick=${(event: Event) => event.stopPropagation()}
          @click=${options.close}
        >
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
        <span class="title"
          >${recordedMediaHeading(
            request,
            options.localize,
            options.api?.locale,
          )}</span
        >
      </div>
      <div class="body">
        <div class="media-container">
          ${this._renderMedia(options)}
        </div>
        <${informationTag}
          class="media-information"
          .locale=${options.api?.locale}
          .localize=${options.localize}
          .request=${request}
        ></${informationTag}>
        <wzc-toast-region
          mode="overlay"
          .notices=${options.notices}
        ></wzc-toast-region>
      </div>
      <div class="footer-actions">
        ${
          request?.timeline
            ? html`<button
                class=${`wzc-icon-button wzc-activity-action segment-action ${
                  this._segmentSelectionActive ? "active" : ""
                }`}
                type="button"
                title=${options.localize("recording_segments.activate")}
                aria-label=${options.localize("recording_segments.activate")}
                aria-pressed=${this._segmentSelectionActive ? "true" : "false"}
                @click=${this._toggleSegmentSelection}
              >
                <ha-icon icon="mdi:filmstrip"></ha-icon>
              </button>`
            : null
        }
        ${renderRecordedMediaActions(request, options.localize, this._host)}
      </div>
    `;
  }

  public get mediaSurface(): HTMLElement | null {
    return this._host.renderRoot.querySelector<HTMLElement>(".media-surface");
  }

  public get mediaPresentationSurface(): HTMLElement | null {
    const surface = this.mediaSurface;
    return surface instanceof HTMLElement && "presentationSurface" in surface
      ? ((surface as HTMLElement & { presentationSurface?: HTMLElement })
          .presentationSurface ?? surface)
      : surface;
  }

  public get information(): RecordedMediaInformation | null {
    return this._host.renderRoot.querySelector<RecordedMediaInformation>(
      RECORDED_MEDIA_INFORMATION_TAG,
    );
  }

  private _renderMedia(options: DialogContentOptions): unknown {
    const { request } = options;
    if (!options.active || !request) return null;
    if (request.kind === "snapshot") {
      const path = request.sources[0]?.url ?? "";
      return staticHtml`<${snapshotPlayerTag}
        class="media-surface"
        .alt=${request.title}
        .localize=${options.localize}
        .source=${options.api?.resolveUrl(path) ?? path}
        >${options.mediaResizeControl}</${snapshotPlayerTag}>
      `;
    }
    return request.timeline
      ? staticHtml`<${playerTag}
          class="media-surface"
          .api=${options.api}
          .localize=${options.localize}
          .request=${request}
          @${recordingSegmentStateEvent}=${this._handleSegmentState}
          >${options.mediaResizeControl}</${playerTag}
        >`
      : staticHtml`<${playerTag}
          class="media-surface"
          .api=${options.api}
          .localize=${options.localize}
          .request=${request}
          @${recordingSegmentStateEvent}=${this._handleSegmentState}
        ></${playerTag}>${options.mediaResizeControl}`;
  }

  private readonly _toggleSegmentSelection = (): void => {
    const player = this._host.renderRoot.querySelector<RecordedVideoPlayer>(
      RECORDED_VIDEO_PLAYER_TAG,
    );
    void player?.toggleSegmentSelection();
  };

  private readonly _handleSegmentState = (
    event: CustomEvent<{ readonly active: boolean }>,
  ): void => {
    event.stopPropagation();
    this._segmentSelectionActive = event.detail.active;
    this._host.requestUpdate();
  };
}
