import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  RECORDED_MEDIA_ERROR_EVENT,
  RECORDED_VIDEO_CLOSE_EVENT,
  RECORDED_VIDEO_VIEWER_TAG,
} from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { getMediaSessionManager } from "../../core/media-session-manager";
import type {
  RecordedMediaInitialGeometry,
  RecordedMediaRequest,
} from "../../core/recorded-media";
import { ToastManager } from "../../ui/toast-manager";
import { mediaViewerPresentation } from "./presentation";
import { recordedVideoViewerStyles } from "./recorded-video-viewer.styles";

/** Owns recorded-video viewing independently of any concrete presentation. */
export class RecordedVideoViewer extends LitElement {
  public static properties = {
    api: { attribute: false },
    initialSize: { attribute: false },
    localize: { attribute: false },
    request: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public initialSize?: RecordedMediaInitialGeometry;
  public localize: LocalizeFunction = englishLocalize;
  public request?: RecordedMediaRequest;

  private _muteLeaseActive = false;
  private _presentationGeneration = 0;
  private _presentationTag = mediaViewerPresentation("review").tagName;
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
    if (!this._presentationTag) return null;
    const presentationTag = unsafeStatic(this._presentationTag);
    return staticHtml`<${presentationTag}
      .api=${this.api}
      .initialSize=${this.initialSize}
      .localize=${this.localize}
      .notices=${this._toasts.notices}
      .request=${this.request}
    ></${presentationTag}>`;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (!changed.has("request")) return;
    void this._loadPresentation();
    if (this.request?.kind === "video") this._acquireLiveMute();
    else this._releaseLiveMute();
  }

  private async _loadPresentation(): Promise<void> {
    const request = this.request;
    const generation = ++this._presentationGeneration;
    if (!request) {
      this._presentationTag = mediaViewerPresentation("review").tagName;
      this.requestUpdate();
      return;
    }
    const presentation = mediaViewerPresentation(request.presentation);
    await presentation.load();
    if (
      generation !== this._presentationGeneration ||
      request !== this.request
    ) {
      return;
    }
    this._presentationTag = presentation.tagName;
    this.requestUpdate();
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
