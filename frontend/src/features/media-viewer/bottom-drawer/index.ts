import { html, LitElement } from "lit";

import {
  CARD_TAG,
  RECORDED_MEDIA_BOTTOM_DRAWER_TAG,
  RECORDED_VIDEO_CLOSE_EVENT,
} from "../../../core/constants";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import type {
  RecordedMediaInitialGeometry,
  RecordedMediaRequest,
} from "../../../core/recorded-media";
import { RESPONSIVE_WIDTHS } from "../../../core/responsive-widths";
import {
  motionDurations,
  motionEasings,
  OwnedMotion,
} from "../../../ui/motion";
import { activityActionStyles } from "../../../ui/activity-action.styles";
import { buttonBaseStyles } from "../../../ui/button.styles";
import { renderIcon } from "../../../ui/icons";
import type { ToastNotice } from "../../../ui/toast-manager";
import { RecordedMediaDialogContent } from "../dialog-content";
import { recordedMediaDialogContentStyles } from "../dialog-content.styles";
import { recordedMediaHeading } from "../media-information";
import type { RecordedVideoPlayer } from "../recorded-video-player";
import { bottomDrawerStyles } from "./bottom-drawer.styles";
import { BottomDrawerMediaResizeController } from "./media-resize.controller";

interface DrawerGesture {
  readonly pointerId: number;
  readonly startY: number;
}

const MIN_CLOSE_DISTANCE_PX = 72;
const CLOSE_DISTANCE_RATIO = 0.25;
const MAX_CLOSE_DISTANCE_PX = 180;

function composedParent(element: Element): Element | undefined {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : undefined;
}

/** Non-blocking recorded-media shell that enters from the bottom edge. */
export class RecordedMediaBottomDrawer extends LitElement {
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
  private _closing = false;
  private readonly _content = new RecordedMediaDialogContent(this);
  private _dragFrame?: number;
  private _gesture?: DrawerGesture;
  private readonly _mediaResize = new BottomDrawerMediaResizeController(this);
  private readonly _motion = new OwnedMotion();
  private _offset = 0;
  private _pendingOffset = 0;
  private _presentation?: "dialog" | "popover";
  private _transitionGeneration = 0;

  public disconnectedCallback(): void {
    this._transitionGeneration += 1;
    this._motion.cancel();
    this._cancelGesture();
    this._removeViewportListeners();
    this._dismiss();
    super.disconnectedCallback();
  }

  protected render() {
    return html`<dialog
      popover="manual"
      tabindex="-1"
      aria-label=${
        recordedMediaHeading(this.request, this.localize, this.api?.locale) ||
        this.localize("reviews.activity")
      }
      @cancel=${this._preventCancel}
    >
      <div
        class="drawer-handle"
        aria-hidden="true"
        @pointerdown=${this._startGesture}
        @pointermove=${this._moveGesture}
        @pointerup=${this._finishGesture}
        @pointercancel=${this._cancelGestureEvent}
        @lostpointercapture=${this._cancelGestureEvent}
      ></div>
      ${this._content.render({
        active: this._active,
        api: this.api,
        close: this.close,
        localize: this.localize,
        mediaOverlay: this._renderMediaResizeHandle(),
        notices: this.notices,
        request: this.request,
      })}
    </dialog>`;
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request") && this.request) {
      this._active = true;
      this._content.reset();
      this._mediaResize.reset();
    }
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    this._mediaResize.observe(
      this.request?.kind === "video"
        ? ((this._content.mediaSurface as RecordedVideoPlayer | null) ??
            undefined)
        : undefined,
      this.renderRoot.querySelector<HTMLButtonElement>(
        ".media-resize-handle",
      ) ?? undefined,
    );
    if (changed.has("request") && this.request) this._open();
  }

  public close = (): void => {
    void this._close();
  };

  private _open(): void {
    const dialog = this._dialog();
    if (!dialog || this._presentation || this._closing) return;
    this._syncGeometry();
    if (typeof dialog.showPopover === "function") {
      dialog.showPopover();
      this._presentation = "popover";
    } else {
      dialog.show();
      this._presentation = "dialog";
    }
    dialog.focus({ preventScroll: true });
    this._addViewportListeners();
    const height = dialog.getBoundingClientRect().height;
    const generation = ++this._transitionGeneration;
    this._offset = 0;
    dialog.style.transform = `translateY(${height}px)`;
    this._motion.start(
      dialog,
      { transform: [`translateY(${height}px)`, "translateY(0px)"] },
      {
        duration: motionDurations.layout,
        ease: motionEasings.out,
        onComplete: () => {
          if (generation !== this._transitionGeneration || !this._presentation)
            return;
          this._motion.cancel();
          dialog.style.transform = "translateY(0px)";
        },
      },
    );
  }

  private async _close(): Promise<void> {
    const dialog = this._dialog();
    if (!dialog || !this._presentation || this._closing) return;
    this._closing = true;
    this._cancelGesture();
    const generation = ++this._transitionGeneration;
    const height = dialog.getBoundingClientRect().height;
    const start = Math.max(0, this._offset);
    const animation = this._motion.start(
      dialog,
      {
        transform: [`translateY(${start}px)`, `translateY(${height}px)`],
      },
      {
        duration: motionDurations.settle,
        ease: motionEasings.out,
      },
    );
    await animation.then(
      () => undefined,
      () => undefined,
    );
    if (generation !== this._transitionGeneration) return;
    this._motion.cancel();
    dialog.style.removeProperty("transform");
    this._dismiss();
    this._removeViewportListeners();
    this._closing = false;
    this._active = false;
    this.requestUpdate();
    this.dispatchEvent(
      new CustomEvent(RECORDED_VIDEO_CLOSE_EVENT, {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private readonly _preventCancel = (event: Event): void => {
    event.preventDefault();
  };

  private readonly _startGesture = (event: PointerEvent): void => {
    if (event.button !== 0 || this._closing) return;
    const handle = event.currentTarget as HTMLElement;
    event.preventDefault();
    this._transitionGeneration += 1;
    this._motion.cancel();
    this._offset = Math.max(0, this._offset);
    this._pendingOffset = this._offset;
    this._gesture = { pointerId: event.pointerId, startY: event.clientY };
    handle.setPointerCapture(event.pointerId);
  };

  private readonly _moveGesture = (event: PointerEvent): void => {
    const gesture = this._gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    this._pendingOffset = Math.max(0, event.clientY - gesture.startY);
    this._dragFrame ??= requestAnimationFrame(this._commitGestureOffset);
  };

  private readonly _finishGesture = (event: PointerEvent): void => {
    const gesture = this._gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    this._flushGestureOffset();
    this._gesture = undefined;
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    const dialog = this._dialog();
    if (!dialog) return;
    const threshold = Math.min(
      MAX_CLOSE_DISTANCE_PX,
      Math.max(
        MIN_CLOSE_DISTANCE_PX,
        dialog.getBoundingClientRect().height * CLOSE_DISTANCE_RATIO,
      ),
    );
    if (this._offset >= threshold) {
      void this._close();
      return;
    }
    this._settleOpen();
  };

  private readonly _cancelGestureEvent = (event: PointerEvent): void => {
    if (this._gesture?.pointerId !== event.pointerId) return;
    this._cancelGesture();
    this._settleOpen();
  };

  private _settleOpen(): void {
    const dialog = this._dialog();
    if (!dialog || !this._presentation || this._closing) return;
    const start = Math.max(0, this._offset);
    const generation = ++this._transitionGeneration;
    this._motion.start(
      dialog,
      { transform: [`translateY(${start}px)`, "translateY(0px)"] },
      {
        duration: motionDurations.settle,
        ease: motionEasings.standard,
        onComplete: () => {
          if (generation !== this._transitionGeneration || !this._presentation)
            return;
          this._offset = 0;
          this._motion.cancel();
          dialog.style.transform = "translateY(0px)";
        },
      },
    );
  }

  private readonly _commitGestureOffset = (): void => {
    this._dragFrame = undefined;
    this._offset = this._pendingOffset;
    const dialog = this._dialog();
    if (dialog) dialog.style.transform = `translateY(${this._offset}px)`;
  };

  private _flushGestureOffset(): void {
    if (this._dragFrame !== undefined) {
      cancelAnimationFrame(this._dragFrame);
      this._dragFrame = undefined;
    }
    this._commitGestureOffset();
  }

  private _cancelGesture(): void {
    if (this._dragFrame !== undefined) cancelAnimationFrame(this._dragFrame);
    this._dragFrame = undefined;
    const gesture = this._gesture;
    const handle = this.renderRoot.querySelector<HTMLElement>(".drawer-handle");
    if (gesture && handle?.hasPointerCapture(gesture.pointerId)) {
      handle.releasePointerCapture(gesture.pointerId);
    }
    this._gesture = undefined;
    this._pendingOffset = this._offset;
  }

  private readonly _syncGeometry = (): void => {
    const dialog = this._dialog();
    if (!dialog) return;
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const cardRect = this._ownerCard()?.getBoundingClientRect();
    const desiredWidth = Math.max(
      cardRect?.width ?? viewportWidth,
      RESPONSIVE_WIDTHS.medium,
    );
    const width = Math.min(desiredWidth, viewportWidth);
    const desiredLeft = cardRect
      ? cardRect.left + (cardRect.width - width) / 2
      : viewportLeft;
    const left = Math.min(
      Math.max(viewportLeft, desiredLeft),
      viewportLeft + viewportWidth - width,
    );
    dialog.style.inlineSize = `${width}px`;
    dialog.style.left = `${left}px`;
    dialog.style.setProperty(
      "--wzc-recorded-media-drawer-viewport-height",
      `${viewportHeight}px`,
    );
    dialog.style.setProperty(
      "--wzc-recorded-media-drawer-open-height",
      `${viewportHeight * 0.82}px`,
    );
  };

  private _ownerCard(): HTMLElement | undefined {
    let current = composedParent(this);
    while (current) {
      if (current instanceof HTMLElement && current.localName === CARD_TAG) {
        return current;
      }
      current = composedParent(current);
    }
    return undefined;
  }

  private _addViewportListeners(): void {
    window.addEventListener("resize", this._syncGeometry);
    window.visualViewport?.addEventListener("resize", this._syncGeometry);
    window.visualViewport?.addEventListener("scroll", this._syncGeometry);
  }

  private _removeViewportListeners(): void {
    window.removeEventListener("resize", this._syncGeometry);
    window.visualViewport?.removeEventListener("resize", this._syncGeometry);
    window.visualViewport?.removeEventListener("scroll", this._syncGeometry);
  }

  private _dialog(): HTMLDialogElement | null {
    return this.renderRoot.querySelector("dialog");
  }

  private _dismiss(): void {
    const dialog = this._dialog();
    const presentation = this._presentation;
    this._presentation = undefined;
    if (!dialog || !presentation) return;
    if (presentation === "popover") {
      try {
        dialog.hidePopover();
      } catch {
        // The browser may already have removed the top-layer presentation.
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }

  private _renderMediaResizeHandle(): unknown {
    if (this.request?.kind !== "video") return null;
    return html`<button
      class="media-resize-handle"
      type="button"
      role="slider"
      title=${this.localize("camera.stage_resize_title")}
      aria-label=${this.localize("camera.stage_height")}
      aria-orientation="vertical"
      aria-valuemin="56"
      aria-valuemax="100"
      aria-valuenow=${String(this._mediaResize.heightPercentage)}
      aria-valuetext=${this.localize("camera.stage_height_value", {
        percent: this._mediaResize.heightPercentage,
      })}
      @pointerdown=${this._mediaResize.handlePointerDown}
      @pointermove=${this._mediaResize.handlePointerMove}
      @pointerup=${this._mediaResize.handlePointerUp}
      @pointercancel=${this._mediaResize.handlePointerCancel}
      @lostpointercapture=${this._mediaResize.handleLostPointerCapture}
      @dblclick=${this._mediaResize.handleDoubleClick}
      @keydown=${this._mediaResize.handleKeyDown}
    >
      ${renderIcon("chevronDown")}
    </button>`;
  }

  static styles = [
    buttonBaseStyles,
    activityActionStyles,
    recordedMediaDialogContentStyles,
    bottomDrawerStyles,
  ];
}

if (!customElements.get(RECORDED_MEDIA_BOTTOM_DRAWER_TAG)) {
  customElements.define(
    RECORDED_MEDIA_BOTTOM_DRAWER_TAG,
    RecordedMediaBottomDrawer,
  );
}

declare global {
  interface HTMLElementTagNameMap {
    [RECORDED_MEDIA_BOTTOM_DRAWER_TAG]: RecordedMediaBottomDrawer;
  }
}
