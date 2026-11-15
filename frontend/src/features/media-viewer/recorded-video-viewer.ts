import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  RECORDED_MEDIA_ERROR_EVENT,
  RECORDED_MEDIA_ACTION_EVENT,
  RECORDED_VIDEO_CLOSE_EVENT,
  RECORDED_VIDEO_VIEWER_TAG,
} from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { getMediaSessionManager } from "../../core/media-session-manager";
import {
  recordedMediaVariantRequest,
  type RecordedMediaInitialGeometry,
  type RecordedMediaRequest,
} from "../../core/recorded-media";
import { ToastManager } from "../../ui/toast-manager";
import { mediaViewerPresentation } from "./presentation";
import { recordedVideoViewerStyles } from "./recorded-video-viewer.styles";
import type { RecordedMediaActionDetail } from "./media-actions";
import { preloadRecordedMediaPlayback } from "./recorded-media-playback.controller";

const OBJECT_URL_REVOKE_DELAY_MS = 1_000;

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
  private _activeRequest?: RecordedMediaRequest;
  private _downloadAbort?: AbortController;
  private _presentationGeneration = 0;
  private _presentationTag = mediaViewerPresentation("review").tagName;
  private readonly _toasts = new ToastManager(this);

  public connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener(
      RECORDED_MEDIA_ACTION_EVENT,
      this._handleMediaAction as EventListener,
    );
    this.addEventListener(RECORDED_MEDIA_ERROR_EVENT, this._handleError);
    this.addEventListener(RECORDED_VIDEO_CLOSE_EVENT, this._handleClose);
  }

  public disconnectedCallback(): void {
    this.removeEventListener(RECORDED_MEDIA_ERROR_EVENT, this._handleError);
    this.removeEventListener(
      RECORDED_MEDIA_ACTION_EVENT,
      this._handleMediaAction as EventListener,
    );
    this.removeEventListener(RECORDED_VIDEO_CLOSE_EVENT, this._handleClose);
    this._releaseLiveMute();
    this._downloadAbort?.abort();
    this._downloadAbort = undefined;
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
      .request=${this._activeRequest}
    ></${presentationTag}>`;
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request")) this._activeRequest = this.request;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (!changed.has("request")) return;
    void this._loadPresentation();
    this._syncLiveMute();
  }

  private async _loadPresentation(): Promise<void> {
    const request = this._activeRequest;
    const generation = ++this._presentationGeneration;
    if (!request) {
      this._presentationTag = mediaViewerPresentation("review").tagName;
      this.requestUpdate();
      return;
    }
    const presentation = mediaViewerPresentation(request.presentation);
    await Promise.all([
      presentation.load(),
      preloadRecordedMediaPlayback(request),
    ]);
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

  private _syncLiveMute(): void {
    if (this._activeRequest?.kind === "video") this._acquireLiveMute();
    else this._releaseLiveMute();
  }

  private _releaseLiveMute(): void {
    if (!this._muteLeaseActive) return;
    this._muteLeaseActive = false;
    getMediaSessionManager().releaseForcedMute(this);
  }

  private readonly _handleClose = (): void => {
    this._releaseLiveMute();
    this._downloadAbort?.abort();
    this._downloadAbort = undefined;
  };

  private readonly _handleMediaAction = (
    event: CustomEvent<RecordedMediaActionDetail>,
  ): void => {
    event.stopPropagation();
    const request = this._activeRequest;
    if (!request) return;
    if (event.detail.kind === "view") {
      const next = recordedMediaVariantRequest(request, event.detail.media);
      if (!next) return;
      if (next.kind === "video") request.actions?.viewReview?.();
      this._activeRequest = next;
      void preloadRecordedMediaPlayback(next);
      this._syncLiveMute();
      this.requestUpdate();
      return;
    }
    if (event.detail.kind === "export_review") {
      request.actions?.exportReview?.();
      const presentation = this.renderRoot.firstElementChild as
        (HTMLElement & { close?: () => void }) | null;
      presentation?.close?.();
      return;
    }
    void this._download(request);
  };

  private async _download(request: RecordedMediaRequest): Promise<void> {
    const api = this.api;
    const download = request.actions?.variants?.[request.kind]?.download;
    if (!api || !download) return;
    this._downloadAbort?.abort();
    const abort = new AbortController();
    this._downloadAbort = abort;
    let objectUrl: string | undefined;
    try {
      const signed = await api.callWS<{ readonly path?: string }>({
        type: "auth/sign_path",
        path: download.path,
        expires: 3600,
      });
      const response = await fetch(
        api.resolveUrl(signed.path ?? download.path),
        {
          signal: abort.signal,
        },
      );
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = download.filename;
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }
    } catch {
      if (!abort.signal.aborted) {
        this._toasts.error(this.localize("media_player.download_failed"), {
          key: `recorded-media-download-${request.id}`,
        });
      }
    } finally {
      if (this._downloadAbort === abort) this._downloadAbort = undefined;
      if (objectUrl) {
        const completedUrl = objectUrl;
        window.setTimeout(
          () => URL.revokeObjectURL(completedUrl),
          OBJECT_URL_REVOKE_DELAY_MS,
        );
      }
    }
  }

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
