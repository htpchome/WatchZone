import { html, LitElement } from "lit";

import {
  MEDIA_PLAYER_CONTAINER_TAG,
  RECORDED_MEDIA_ERROR_EVENT,
} from "../core/constants";
import type { HomeAssistantApi } from "../core/home-assistant";
import { englishLocalize, type LocalizeFunction } from "../core/localization";
import { getMediaSessionManager } from "../core/media-session-manager";
import type { RecordedMediaRequest } from "../core/recorded-media";
import { ToastManager } from "../ui/toast-manager";
import "../ui/toast-region";
import "./media-player";
import { mediaPlayerContainerStyles } from "./media-player-container.styles";

/** Draggable modal shell for ephemeral recorded-media playback. */
export class MediaPlayerContainer extends LitElement {
  public static properties = {
    api: { attribute: false },
    localize: { attribute: false },
    request: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public localize: LocalizeFunction = englishLocalize;
  public request?: RecordedMediaRequest;

  private _active = false;
  private _drag?: {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly pointerId: number;
  };
  private _muteLeaseActive = false;
  private readonly _toasts = new ToastManager(this);

  public connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener(
      RECORDED_MEDIA_ERROR_EVENT,
      this._handlePlaybackError,
    );
  }

  public disconnectedCallback(): void {
    this.removeEventListener(
      RECORDED_MEDIA_ERROR_EVENT,
      this._handlePlaybackError,
    );
    window.removeEventListener("resize", this._clampDialog);
    this._releaseLiveMute();
    super.disconnectedCallback();
  }

  protected render() {
    return html`<dialog
      aria-label=${this.request?.title ?? this.localize("alerts.activity")}
      @cancel=${this._handleCancel}
      @close=${this._handleClose}
      @click=${this._handleBackdropClick}
    >
      <div
        class="header"
        @pointerdown=${this._startDrag}
        @pointermove=${this._moveDrag}
        @pointerup=${this._endDrag}
        @pointercancel=${this._endDrag}
      >
        <span class="title">${this.request?.title ?? ""}</span>
        <button
          class="close"
          type="button"
          title=${this.localize("media_player.close")}
          aria-label=${this.localize("media_player.close")}
          @pointerdown=${(event: Event) => event.stopPropagation()}
          @click=${this.close}
        >
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="body">
        ${
          this._active
            ? html`<wzc-media-player
                .api=${this.api}
                .request=${this.request}
              ></wzc-media-player>`
            : null
        }
        <wzc-toast-region
          mode="overlay"
          .notices=${this._toasts.notices}
        ></wzc-toast-region>
      </div>
    </dialog>`;
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request") && this.request) this._active = true;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request") && this.request) this._open();
  }

  public close = (): void => {
    this._dialog()?.close();
  };

  private _open(): void {
    const dialog = this._dialog();
    if (!dialog) return;
    dialog.classList.remove("dragged");
    dialog.style.removeProperty("left");
    dialog.style.removeProperty("top");
    if (!dialog.open) dialog.showModal();
    this._acquireLiveMute();
    window.addEventListener("resize", this._clampDialog);
  }

  private _dialog(): HTMLDialogElement | null {
    return this.renderRoot.querySelector("dialog");
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

  private readonly _handleCancel = (): void => {
    this._releaseLiveMute();
  };

  private readonly _handleClose = (): void => {
    window.removeEventListener("resize", this._clampDialog);
    this._active = false;
    this.requestUpdate();
    this._releaseLiveMute();
  };

  private readonly _handleBackdropClick = (event: MouseEvent): void => {
    if (event.target === this._dialog()) this.close();
  };

  private readonly _handlePlaybackError = (event: Event): void => {
    event.stopPropagation();
    this._toasts.error(this.localize("media_player.load_failed"), {
      key: "recorded-media-load-failed",
    });
  };

  private readonly _startDrag = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const dialog = this._dialog();
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    dialog.classList.add("dragged");
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    this._drag = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      pointerId: event.pointerId,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  private readonly _moveDrag = (event: PointerEvent): void => {
    if (!this._drag || event.pointerId !== this._drag.pointerId) return;
    this._positionDialog(
      event.clientX - this._drag.offsetX,
      event.clientY - this._drag.offsetY,
    );
  };

  private readonly _endDrag = (event: PointerEvent): void => {
    if (!this._drag || event.pointerId !== this._drag.pointerId) return;
    this._drag = undefined;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  };

  private readonly _clampDialog = (): void => {
    const dialog = this._dialog();
    if (!dialog?.classList.contains("dragged")) return;
    const rect = dialog.getBoundingClientRect();
    this._positionDialog(rect.left, rect.top);
  };

  private _positionDialog(left: number, top: number): void {
    const dialog = this._dialog();
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    dialog.style.left = `${Math.min(Math.max(0, left), maxLeft)}px`;
    dialog.style.top = `${Math.min(Math.max(0, top), maxTop)}px`;
  }

  static styles = mediaPlayerContainerStyles;
}

if (!customElements.get(MEDIA_PLAYER_CONTAINER_TAG)) {
  customElements.define(MEDIA_PLAYER_CONTAINER_TAG, MediaPlayerContainer);
}

declare global {
  interface HTMLElementTagNameMap {
    [MEDIA_PLAYER_CONTAINER_TAG]: MediaPlayerContainer;
  }
}
