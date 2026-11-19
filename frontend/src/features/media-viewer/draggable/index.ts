import { html, LitElement } from "lit";

import { RECORDED_VIDEO_CLOSE_EVENT } from "../../../core/constants";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import type {
  RecordedMediaInitialGeometry,
  RecordedMediaRequest,
} from "../../../core/recorded-media";
import { activityActionStyles } from "../../../ui/activity-action.styles";
import { buttonBaseStyles } from "../../../ui/button.styles";
import type { ToastNotice } from "../../../ui/toast-manager";
import { renderIcon } from "../../../ui/icons";
import { RecordedMediaDialogContent } from "../dialog-content";
import { recordedMediaDialogContentStyles } from "../dialog-content.styles";
import { recordedMediaHeading } from "../media-information";
import { draggableDialogStyles } from "./draggable.styles";

/** Draggable non-modal shell for ephemeral recorded-media playback. */
export abstract class DraggableRecordedMediaDialog extends LitElement {
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

  protected _active = false;
  private _presentation?: "dialog" | "popover";
  private readonly _content = new RecordedMediaDialogContent(this);
  private _resizeFrame?: number;
  private _resizePendingMediaWidth?: number;
  private _userPositioned = false;
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
    this._presentation = undefined;
    super.disconnectedCallback();
  }

  protected render() {
    return html`<dialog
      popover="manual"
      aria-label=${
        recordedMediaHeading(this.request, this.localize, this.api?.locale) ||
        this.localize("reviews.activity")
      }
    >
      ${this._content.render({
        active: this._active,
        api: this.api,
        close: this.close,
        localize: this.localize,
        notices: this.notices,
        onHeaderPointerCancel: this._endDrag,
        onHeaderPointerDown: this._startDrag,
        onHeaderPointerMove: this._moveDrag,
        onHeaderPointerUp: this._endDrag,
        request: this.request,
      })}
      <button
        class="resize-handle"
        type="button"
        title=${this.localize("media_player.resize")}
        aria-label=${this.localize("media_player.resize")}
        @pointerdown=${this._startResize}
        @pointermove=${this._moveResize}
        @pointerup=${this._endResize}
        @pointercancel=${this._endResize}
        @lostpointercapture=${this._endResize}
        @keydown=${this._handleResizeKey}
      >
        ${renderIcon("resizeGrip")}
      </button>
    </dialog>`;
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request") && this.request) {
      this._active = true;
      this._content.reset();
    }
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request") && this.request) this._open();
  }

  public close = (): void => {
    this._removeDocumentListeners();
    this._clearPointerInteractions();
    const dialog = this._dialog();
    const presentation = this._presentation;
    if (!dialog || !presentation) return;
    this._presentation = undefined;
    if (presentation === "popover") dialog.hidePopover();
    else dialog.close();
    this._finishClose();
  };

  private _open(): void {
    const dialog = this._dialog();
    if (!dialog) return;
    if (!this._presentation) {
      this._userPositioned = false;
      dialog.classList.remove("dragged");
      dialog.style.removeProperty("left");
      dialog.style.removeProperty("top");
      dialog.style.removeProperty("width");
      if (
        typeof dialog.showPopover === "function" &&
        typeof dialog.hidePopover === "function"
      ) {
        dialog.showPopover();
        this._presentation = "popover";
      } else {
        dialog.show();
        this._presentation = "dialog";
      }
      this._applyInitialSize();
      const media = this._mediaSurface();
      if (this.request?.timeline && media instanceof LitElement) {
        void media.updateComplete.then(() => {
          if (this._presentation && media === this._mediaSurface()) {
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

  private readonly _handleDocumentClick = (event: MouseEvent): void => {
    const dialog = this._dialog();
    if (!dialog || !this._presentation) return;
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
    this._userPositioned = true;
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
    this._userPositioned = true;
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
    this._resizePendingMediaWidth =
      this._resize.mediaWidth + (deltaX + deltaY * (16 / 9)) / 2;
    this._scheduleResizeWrite();
  };

  private readonly _endResize = (event: PointerEvent): void => {
    if (!this._resize || event.pointerId !== this._resize.pointerId) return;
    this._flushResizeWrite();
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
    this._userPositioned = true;
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
    if (!dialog || !this._presentation) return;
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
  }

  private _mediaSurface(): HTMLElement | null {
    return this._content.mediaSurface;
  }

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
    this._cancelResizeWrite();
  }

  private _scheduleResizeWrite(): void {
    // The corner handle resizes the complete recorded-media composition:
    // video plus information and actions. Coalescing only limits layout work;
    // it deliberately does not adopt the live stage's height-only contract.
    if (this._resizeFrame !== undefined) return;
    this._resizeFrame = requestAnimationFrame(() => {
      this._resizeFrame = undefined;
      const mediaWidth = this._resizePendingMediaWidth;
      this._resizePendingMediaWidth = undefined;
      if (mediaWidth !== undefined) this._setMediaWidth(mediaWidth);
    });
  }

  private _flushResizeWrite(): void {
    if (this._resizeFrame !== undefined) {
      cancelAnimationFrame(this._resizeFrame);
      this._resizeFrame = undefined;
    }
    const mediaWidth = this._resizePendingMediaWidth;
    this._resizePendingMediaWidth = undefined;
    if (mediaWidth !== undefined) this._setMediaWidth(mediaWidth);
  }

  private _cancelResizeWrite(): void {
    if (this._resizeFrame !== undefined) {
      cancelAnimationFrame(this._resizeFrame);
      this._resizeFrame = undefined;
    }
    this._resizePendingMediaWidth = undefined;
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
    const informationHeight =
      this._content.information?.getBoundingClientRect().height ?? 0;
    const bodyGap = px(bodyStyle.rowGap);
    const verticalChrome =
      header.getBoundingClientRect().height +
      px(bodyStyle.paddingTop) +
      px(bodyStyle.paddingBottom) +
      px(dialogStyle.borderTopWidth) +
      px(dialogStyle.borderBottomWidth) +
      mediaExtraHeight +
      informationHeight +
      (informationHeight > 0 ? bodyGap : 0);
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const availableWidth = this._userPositioned
      ? viewportWidth - Math.max(8, rect.left) - 8
      : viewportWidth - 16;
    const availableHeight = this._userPositioned
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
    const dialogWidth = constrainedMediaWidth + horizontalChrome;
    const currentWidth = Number.parseFloat(dialog.style.width);
    if (
      Number.isFinite(currentWidth) &&
      Math.abs(currentWidth - dialogWidth) <= 0.5
    ) {
      return;
    }
    dialog.style.width = `${dialogWidth}px`;
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

  static styles = [
    buttonBaseStyles,
    activityActionStyles,
    recordedMediaDialogContentStyles,
    draggableDialogStyles,
  ];
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
