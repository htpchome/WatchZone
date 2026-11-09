import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  RECORDED_MEDIA_ERROR_EVENT,
  RECORDED_VIDEO_CLOSE_EVENT,
  RECORDED_VIDEO_DIALOG_TAG,
  RECORDED_VIDEO_VIEWER_TAG,
} from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { getMediaSessionManager } from "../../core/media-session-manager";
import type {
  RecordedMediaInitialSize,
  RecordedMediaRequest,
} from "../../core/recorded-media";
import { ToastManager } from "../toast-manager";
import "./draggable-dialog";
import { recordedVideoViewerStyles } from "./recorded-video-viewer.styles";

const dialogTag = unsafeStatic(RECORDED_VIDEO_DIALOG_TAG);

/** Owns recorded-video viewing independently of any concrete presentation. */
export class RecordedVideoViewer extends LitElement {
  public static properties = {
    api: { attribute: false },
    initialSize: { attribute: false },
    localize: { attribute: false },
    request: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public initialSize?: RecordedMediaInitialSize;
  public localize: LocalizeFunction = englishLocalize;
  public request?: RecordedMediaRequest;

  private _muteLeaseActive = false;
  private readonly _toasts = new ToastManager(this);

  public connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener(RECORDED_MEDIA_ERROR_EVENT, this._handleError);
    this.addEventListener(RECORDED_VIDEO_CLOSE_EVENT, this._handleClose);
  }

  public disconnectedCallback(): void {
    this.removeEventListener(RECORDED_MEDIA_ERROR_EVENT, this._handleError);
    this.removeEventListener(RECORDED_VIDEO_CLOSE_EVENT, this._handleClose);
    this._releaseLiveMute();
    super.disconnectedCallback();
  }

  protected render() {
    return staticHtml`<${dialogTag}
      .api=${this.api}
      .initialSize=${this.initialSize}
      .localize=${this.localize}
      .notices=${this._toasts.notices}
      .request=${this.request}
    ></${dialogTag}>`;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request") && this.request) this._acquireLiveMute();
  }

  private _acquireLiveMute(): void {
    if (this._muteLeaseActive) return;
    this._muteLeaseActive = true;
    getMediaSessionManager().acquireForcedMute(this);
  }

  private _releaseLiveMute(): void {
    if (!this._muteLeaseActive) return;
    this._muteLeaseActive = false;
    getMediaSessionManager().releaseForcedMute(this);
  }

  private readonly _handleClose = (event: Event): void => {
    event.stopPropagation();
    this._releaseLiveMute();
  };

  private readonly _handleError = (event: Event): void => {
    event.stopPropagation();
    const message = (event as CustomEvent<{ readonly message?: string }>).detail
      ?.message;
    this._toasts.error(message ?? this.localize("media_player.load_failed"), {
      key: "recorded-media-load-failed",
    });
  };

  static styles = recordedVideoViewerStyles;
}

if (!customElements.get(RECORDED_VIDEO_VIEWER_TAG)) {
  customElements.define(RECORDED_VIDEO_VIEWER_TAG, RecordedVideoViewer);
}

declare global {
  interface HTMLElementTagNameMap {
    [RECORDED_VIDEO_VIEWER_TAG]: RecordedVideoViewer;
  }
}
