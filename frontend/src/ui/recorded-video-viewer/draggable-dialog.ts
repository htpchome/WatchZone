import { html, LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  RECORDED_MEDIA_ERROR_EVENT,
  RECORDED_VIDEO_CLOSE_EVENT,
  RECORDED_VIDEO_DIALOG_TAG,
  RECORDED_VIDEO_PLAYER_TAG,
} from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import type {
  RecordedMediaInitialGeometry,
  RecordedMediaRequest,
} from "../../core/recorded-media";
import type { ToastNotice } from "../toast-manager";
import "../toast-region";
import "./recorded-video-player";
import { draggableDialogStyles } from "./draggable-dialog.styles";

const playerTag = unsafeStatic(RECORDED_VIDEO_PLAYER_TAG);

/** Draggable modal shell for ephemeral recorded-media playback. */
export class DraggableRecordedVideoDialog extends LitElement {
  public static properties = {
    api: { attribute: false },
    initialSize: { attribute: false },
    localize: { attribute: false },
    notices: { attribute: false },
    request: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public initialSize?: RecordedMediaInitialGeometry;
  public localize: LocalizeFunction = englishLocalize;
  public notices: readonly ToastNotice[] = [];
  public request?: RecordedMediaRequest;

  private _active = false;
  private _pendingNativeCloses = 0;
  private _drag?: {
    readonly offsetX: number;
    readonly offsetY: number;
    readonly pointerId: number;
  };
  private _resize?: {
    readonly mediaWidth: number;
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
  };
  public disconnectedCallback(): void {
    window.removeEventListener("resize", this._clampDialog);
    this._removeDocumentListeners();
    this._clearPointerInteractions();
    super.disconnectedCallback();
  }

  protected render() {
    return html`<dialog
      aria-label=${this.request?.title ?? this.localize("reviews.activity")}
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
        <span class="title">${this.request?.title ?? ""}</span>
      </div>
      <div class="body">
        ${
          this._active
            ? this.request?.kind === "snapshot"
              ? html`<img
                  class="snapshot media-surface"
                  src=${this._snapshotUrl()}
                  alt=${this.request.title}
                  @error=${this._handleSnapshotError}
                />`
              : staticHtml`<${playerTag}
                  class="media-surface"
                  .api=${this.api}
                  .localize=${this.localize}
                  .request=${this.request}
                ></${playerTag}>`
            : null
        }
        <wzc-toast-region
          mode="overlay"
          .notices=${this.notices}
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
        <ha-icon icon="mdi:resize-bottom-right" aria-hidden="true"></ha-icon>
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
    this._clearPointerInteractions();
    const dialog = this._dialog();
    if (!dialog?.open) return;
    this._pendingNativeCloses += 1;
    dialog.close();
    this._finishClose();
  };

  private _open(): void {
    const dialog = this._dialog();
    if (!dialog) return;
    if (!dialog.open) {
      dialog.classList.remove("dragged");
      dialog.style.removeProperty("left");
      dialog.style.removeProperty("top");
      dialog.style.removeProperty("width");
      dialog.show();
      this._applyInitialSize();
      const media = this._mediaSurface();
      if (this.request?.timeline && media instanceof LitElement) {
        void media.updateComplete.then(() => {
          if (dialog.open && media === this._mediaSurface()) {
            this._applyInitialSize();
          }
        });
      }
    }
    window.addEventListener("resize", this._clampDialog);
    document.addEventListener("click", this._handleDocumentClick, true);
    document.addEventListener("keydown", this._handleDocumentKeyDown);
  }

  private _dialog(): HTMLDialogElement | null {
    return this.renderRoot.querySelector("dialog");
  }

  private readonly _handleCancel = (): void => undefined;

  private readonly _handleClose = (): void => {
    if (this._pendingNativeCloses > 0) {
      this._pendingNativeCloses -= 1;
      return;
    }
    this._finishClose();
  };

  private _finishClose(): void {
    window.removeEventListener("resize", this._clampDialog);
    this._removeDocumentListeners();
    this._active = false;
    this.requestUpdate();
    this.dispatchEvent(
      new CustomEvent(RECORDED_VIDEO_CLOSE_EVENT, {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private readonly _handleBackdropClick = (): void => undefined;

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
    const player = this._mediaSurface();
    this._resize = {
      mediaWidth: player?.getBoundingClientRect().width ?? rect.width,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  private readonly _moveResize = (event: PointerEvent): void => {
    if (!this._resize || event.pointerId !== this._resize.pointerId) return;
    const deltaX = event.clientX - this._resize.startX;
    const deltaY = event.clientY - this._resize.startY;
    this._setMediaWidth(
      this._resize.mediaWidth + (deltaX + deltaY * (16 / 9)) / 2,
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
    const player = this._mediaSurface();
    const mediaWidth = player?.getBoundingClientRect().width ?? rect.width;
    this._setMediaWidth(
      mediaWidth + (horizontal !== 0 ? horizontal : vertical) * step,
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
      const player = this._mediaSurface();
      this._setMediaWidth(player?.getBoundingClientRect().width ?? rect.width);
      this._positionDialog(rect.left, rect.top);
      return;
    }
    const player = this._mediaSurface();
    this._setMediaWidth(player?.getBoundingClientRect().width ?? rect.width);
  };

  private _applyInitialSize(): void {
    const dialog = this._dialog();
    const size = this.initialSize;
    if (!dialog || !size) return;
    this._setMediaWidth(size.width);
    dialog.classList.add("dragged");
    const rect = dialog.getBoundingClientRect();
    this._positionDialog(
      size.centerX - rect.width / 2,
      size.centerY - rect.height / 2,
    );
  }

  private _mediaSurface(): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>(".media-surface");
  }

  private _snapshotUrl(): string {
    const path = this.request?.sources[0]?.url ?? "";
    return this.api?.resolveUrl(path) ?? path;
  }

  private readonly _handleSnapshotError = (): void => {
    this.dispatchEvent(
      new CustomEvent(RECORDED_MEDIA_ERROR_EVENT, {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private _removeDocumentListeners(): void {
    document.removeEventListener("click", this._handleDocumentClick, true);
    document.removeEventListener("keydown", this._handleDocumentKeyDown);
  }

  private _clearPointerInteractions(): void {
    if (this._drag) {
      const header = this.renderRoot.querySelector<HTMLElement>(".header");
      if (header?.hasPointerCapture(this._drag.pointerId)) {
        header.releasePointerCapture(this._drag.pointerId);
      }
      this._drag = undefined;
    }
    if (this._resize) {
      const handle =
        this.renderRoot.querySelector<HTMLElement>(".resize-handle");
      if (handle?.hasPointerCapture(this._resize.pointerId)) {
        handle.releasePointerCapture(this._resize.pointerId);
      }
      this._resize = undefined;
    }
  }

  private _prepareManualBounds(rect: DOMRect): void {
    const dialog = this._dialog();
    if (!dialog) return;
    dialog.classList.add("dragged");
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    dialog.style.width = `${rect.width}px`;
  }

  private _setMediaWidth(mediaWidth: number): void {
    const dialog = this._dialog();
    if (!dialog) return;
    const rect = dialog.getBoundingClientRect();
    const body = this.renderRoot.querySelector<HTMLElement>(".body");
    const header = this.renderRoot.querySelector<HTMLElement>(".header");
    if (!body || !header) return;
    const bodyStyle = getComputedStyle(body);
    const dialogStyle = getComputedStyle(dialog);
    const horizontalChrome =
      px(bodyStyle.paddingLeft) +
      px(bodyStyle.paddingRight) +
      px(dialogStyle.borderLeftWidth) +
      px(dialogStyle.borderRightWidth);
    const mediaRect = this._mediaSurface()?.getBoundingClientRect();
    const mediaExtraHeight = mediaRect
      ? Math.max(0, mediaRect.height - mediaRect.width * (9 / 16))
      : 0;
    const verticalChrome =
      header.getBoundingClientRect().height +
      px(bodyStyle.paddingTop) +
      px(bodyStyle.paddingBottom) +
      px(dialogStyle.borderTopWidth) +
      px(dialogStyle.borderBottomWidth) +
      mediaExtraHeight;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const manuallyPositioned = dialog.classList.contains("dragged");
    const availableWidth = manuallyPositioned
      ? viewportWidth - Math.max(8, rect.left) - 8
      : viewportWidth - 16;
    const availableHeight = manuallyPositioned
      ? viewportHeight - Math.max(8, rect.top) - 8
      : viewportHeight - 16;
    const maxMediaWidth = Math.max(
      1,
      Math.min(
        availableWidth - horizontalChrome,
        (availableHeight - verticalChrome) * (16 / 9),
      ),
    );
    const minMediaWidth = Math.min(240, maxMediaWidth);
    const constrainedMediaWidth = Math.min(
      Math.max(minMediaWidth, mediaWidth),
      maxMediaWidth,
    );
    dialog.style.width = `${constrainedMediaWidth + horizontalChrome}px`;
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

  static styles = draggableDialogStyles;
}

function px(value: string): number {
  return Number.parseFloat(value) || 0;
}

function isRecordedMediaOpener(path: readonly EventTarget[]): boolean {
  return path.some(
    (target) =>
      target instanceof HTMLElement &&
      target.dataset.recordedMediaOpener === "true",
  );
}

if (!customElements.get(RECORDED_VIDEO_DIALOG_TAG)) {
  customElements.define(
    RECORDED_VIDEO_DIALOG_TAG,
    DraggableRecordedVideoDialog,
  );
}

declare global {
  interface HTMLElementTagNameMap {
    [RECORDED_VIDEO_DIALOG_TAG]: DraggableRecordedVideoDialog;
  }
}
