import { html, LitElement } from "lit";

import {
  MEDIA_PLAYER_CONTAINER_TAG,
  RECORDED_MEDIA_ERROR_EVENT,
} from "../core/constants";
import type { HomeAssistantApi } from "../core/home-assistant";
import { englishLocalize, type LocalizeFunction } from "../core/localization";
import { getMediaSessionManager } from "../core/media-session-manager";
import type {
  RecordedMediaInitialSize,
  RecordedMediaRequest,
} from "../core/recorded-media";
import { ToastManager } from "../ui/toast-manager";
import "../ui/toast-region";
import "./media-player";
import { mediaPlayerContainerStyles } from "./media-player-container.styles";

/** Draggable modal shell for ephemeral recorded-media playback. */
export class MediaPlayerContainer extends LitElement {
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

  private _active = false;
  private _drag?: {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly pointerId: number;
  };
  private _muteLeaseActive = false;
  private _resize?: {
    readonly height: number;
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly width: number;
  };
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
    this._removeDocumentListeners();
    this._releaseLiveMute();
    super.disconnectedCallback();
  }

  protected render() {
    return html`${
        this._active ? html`<div class="scrim" aria-hidden="true"></div>` : null
      }
      <dialog
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
                  .localize=${this.localize}
                  .request=${this.request}
                ></wzc-media-player>`
              : null
          }
          <wzc-toast-region
            mode="overlay"
            .notices=${this._toasts.notices}
          ></wzc-toast-region>
        </div>
        <button
          class="resize-handle"
          type="button"
          title=${this.localize("media_player.resize")}
          aria-label=${this.localize("media_player.resize")}
          @pointerdown=${this._startResize}
          @pointermove=${this._moveResize}
          @pointerup=${this._endResize}
          @pointercancel=${this._endResize}
          @keydown=${this._handleResizeKey}
        >
          <span class="diagonal-grip" aria-hidden="true">
            <span></span><span></span><span></span>
          </span>
        </button>
      </dialog>`;
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request") && this.request) this._active = true;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request") && this.request) this._open();
  }

  public close = (): void => {
    this._removeDocumentListeners();
    this._dialog()?.close();
  };

  private _open(): void {
    const dialog = this._dialog();
    if (!dialog) return;
    if (!dialog.open) {
      dialog.classList.remove("dragged");
      dialog.style.removeProperty("left");
      dialog.style.removeProperty("top");
      dialog.style.removeProperty("width");
      dialog.style.removeProperty("height");
      dialog.show();
      this._applyInitialSize();
    }
    this._acquireLiveMute();
    window.addEventListener("resize", this._clampDialog);
    document.addEventListener("click", this._handleDocumentClick, true);
    document.addEventListener("keydown", this._handleDocumentKeyDown);
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
    this._removeDocumentListeners();
    this._active = false;
    this.requestUpdate();
    this._releaseLiveMute();
  };

  private readonly _handleBackdropClick = (): void => undefined;

  private readonly _handlePlaybackError = (event: Event): void => {
    event.stopPropagation();
    const message = (event as CustomEvent<{ readonly message?: string }>).detail
      ?.message;
    this._toasts.error(message ?? this.localize("media_player.load_failed"), {
      key: "recorded-media-load-failed",
    });
  };

  private readonly _handleDocumentClick = (event: MouseEvent): void => {
    const dialog = this._dialog();
    if (!dialog?.open) return;
    const path = event.composedPath();
    if (path.includes(dialog) || isRecordedMediaOpener(path)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.close();
  };

  private readonly _handleDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    this.close();
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

  private readonly _startResize = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const dialog = this._dialog();
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    this._prepareManualBounds(rect);
    this._resize = {
      height: rect.height,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  private readonly _moveResize = (event: PointerEvent): void => {
    if (!this._resize || event.pointerId !== this._resize.pointerId) return;
    this._resizeDialog(
      this._resize.width + event.clientX - this._resize.startX,
      this._resize.height + event.clientY - this._resize.startY,
    );
  };

  private readonly _endResize = (event: PointerEvent): void => {
    if (!this._resize || event.pointerId !== this._resize.pointerId) return;
    this._resize = undefined;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  };

  private readonly _handleResizeKey = (event: KeyboardEvent): void => {
    const horizontal =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const vertical =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (horizontal === 0 && vertical === 0) return;
    event.preventDefault();
    const dialog = this._dialog();
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    this._prepareManualBounds(rect);
    const step = event.shiftKey ? 32 : 16;
    this._resizeDialog(
      rect.width + horizontal * step,
      rect.height + vertical * step,
    );
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
    if (!dialog?.open) return;
    const rect = dialog.getBoundingClientRect();
    if (dialog.classList.contains("dragged")) {
      this._resizeDialog(rect.width, rect.height);
      this._positionDialog(rect.left, rect.top);
      return;
    }
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    dialog.style.width = `${Math.min(rect.width, viewportWidth - 16)}px`;
    dialog.style.height = `${Math.min(rect.height, viewportHeight - 16)}px`;
  };

  private _applyInitialSize(): void {
    const dialog = this._dialog();
    const size = this.initialSize;
    if (!dialog || !size) return;
    const headerHeight =
      this.renderRoot
        .querySelector<HTMLElement>(".header")
        ?.getBoundingClientRect().height ?? 0;
    const body = this.renderRoot.querySelector<HTMLElement>(".body");
    const bodyStyle = body ? getComputedStyle(body) : undefined;
    const verticalPadding =
      Number.parseFloat(bodyStyle?.paddingTop ?? "0") +
      Number.parseFloat(bodyStyle?.paddingBottom ?? "0");
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    dialog.style.width = `${Math.min(size.width, viewportWidth - 16)}px`;
    dialog.style.height = `${Math.min(
      size.height + headerHeight + verticalPadding,
      viewportHeight - 16,
    )}px`;
  }

  private _removeDocumentListeners(): void {
    document.removeEventListener("click", this._handleDocumentClick, true);
    document.removeEventListener("keydown", this._handleDocumentKeyDown);
  }

  private _prepareManualBounds(rect: DOMRect): void {
    const dialog = this._dialog();
    if (!dialog) return;
    dialog.classList.add("dragged");
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    dialog.style.width = `${rect.width}px`;
    dialog.style.height = `${rect.height}px`;
  }

  private _resizeDialog(width: number, height: number): void {
    const dialog = this._dialog();
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const maxWidth = Math.max(1, viewportWidth - Math.max(0, rect.left));
    const maxHeight = Math.max(1, viewportHeight - Math.max(0, rect.top));
    const minWidth = Math.min(256, maxWidth);
    const minHeight = Math.min(160, maxHeight);
    dialog.style.width = `${Math.min(Math.max(minWidth, width), maxWidth)}px`;
    dialog.style.height = `${Math.min(Math.max(minHeight, height), maxHeight)}px`;
  }

  private _positionDialog(left: number, top: number): void {
    const dialog = this._dialog();
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const maxLeft = Math.max(0, viewportWidth - rect.width);
    const maxTop = Math.max(0, viewportHeight - rect.height);
    dialog.style.left = `${Math.min(Math.max(0, left), maxLeft)}px`;
    dialog.style.top = `${Math.min(Math.max(0, top), maxTop)}px`;
  }

  static styles = mediaPlayerContainerStyles;
}

function isRecordedMediaOpener(path: readonly EventTarget[]): boolean {
  return path.some(
    (target) =>
      target instanceof HTMLElement &&
      target.dataset.recordedMediaOpener === "true",
  );
}

if (!customElements.get(MEDIA_PLAYER_CONTAINER_TAG)) {
  customElements.define(MEDIA_PLAYER_CONTAINER_TAG, MediaPlayerContainer);
}

declare global {
  interface HTMLElementTagNameMap {
    [MEDIA_PLAYER_CONTAINER_TAG]: MediaPlayerContainer;
  }
}
