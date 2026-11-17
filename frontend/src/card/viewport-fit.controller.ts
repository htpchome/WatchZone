import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { RemovedBlockSpacing } from "./home-assistant-layout-bridge";

const FIT_BLOCK_SIZE_PROPERTY = "--wzc-fit-viewport-block-size";

function composedParentElement(element: Element): HTMLElement | undefined {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot && root.host instanceof HTMLElement
    ? root.host
    : undefined;
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function restoredViewportTop(host: HTMLElement): number {
  let top = host.getBoundingClientRect().top + window.scrollY;
  let parent = composedParentElement(host);
  while (
    parent &&
    parent !== document.body &&
    parent !== document.documentElement
  ) {
    top += parent.scrollTop;
    parent = composedParentElement(parent);
  }
  return top;
}

function trailingLayoutSpace(host: HTMLElement): number {
  let trailing = pixels(getComputedStyle(host).marginBlockEnd);
  let parent = composedParentElement(host);
  while (parent && parent !== document.documentElement) {
    const style = getComputedStyle(parent);
    trailing += pixels(style.paddingBlockEnd);
    if (parent === document.body) {
      trailing += pixels(style.marginBlockEnd);
      break;
    }
    parent = composedParentElement(parent);
  }
  return trailing;
}

/** Keeps the card inside the visible viewport from its real HA layout offset. */
export class ViewportFitController implements ReactiveController {
  private _enabled = false;
  private _browserEdgeToEdgeSpacing?: RemovedBlockSpacing;
  private _connected = false;
  private _frame?: number;
  private readonly _resizeObserver =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => this._scheduleMeasure());

  public constructor(
    private readonly _host: ReactiveControllerHost & HTMLElement,
  ) {
    _host.addController(this);
  }

  public configure(enabled: boolean): void {
    if (enabled === this._enabled) {
      if (enabled) this._scheduleMeasure();
      return;
    }
    this._enabled = enabled;
    if (!this._connected) return;
    if (enabled) {
      this._observe();
      this._scheduleMeasure();
    } else {
      this._release();
    }
  }

  public setBrowserEdgeToEdgeSpacing(
    spacing: RemovedBlockSpacing | undefined,
  ): void {
    if (
      spacing?.start === this._browserEdgeToEdgeSpacing?.start &&
      spacing?.end === this._browserEdgeToEdgeSpacing?.end
    ) {
      return;
    }
    this._browserEdgeToEdgeSpacing = spacing;
    if (this._enabled) this._scheduleMeasure();
  }

  public hostConnected(): void {
    this._connected = true;
    if (!this._enabled) return;
    this._observe();
    this._scheduleMeasure();
  }

  public hostUpdated(): void {
    if (this._enabled) this._scheduleMeasure();
  }

  public hostDisconnected(): void {
    this._connected = false;
    this._release();
  }

  private readonly _scheduleMeasure = (): void => {
    if (!this._connected || !this._enabled || this._frame !== undefined) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = undefined;
      this._measure();
    });
  };

  private _measure(): void {
    if (!this._connected || !this._enabled) return;
    const viewport = window.visualViewport;
    const edgeToEdgeSpacing = this._browserEdgeToEdgeSpacing;
    const viewportBottom = edgeToEdgeSpacing
      ? (viewport?.height ?? window.innerHeight)
      : (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
    const removedBlockSpacing = edgeToEdgeSpacing
      ? edgeToEdgeSpacing.start + edgeToEdgeSpacing.end
      : 0;
    const blockSize = Math.max(
      0,
      Math.floor(
        viewportBottom -
          restoredViewportTop(this._host) -
          trailingLayoutSpace(this._host) -
          removedBlockSpacing,
      ),
    );
    this._host.style.setProperty(FIT_BLOCK_SIZE_PROPERTY, `${blockSize}px`);
  }

  private _observe(): void {
    window.addEventListener("resize", this._scheduleMeasure);
    window.visualViewport?.addEventListener("resize", this._scheduleMeasure);
    this._resizeObserver?.observe(this._host);
    let parent = composedParentElement(this._host);
    while (parent && parent !== document.documentElement) {
      this._resizeObserver?.observe(parent);
      if (parent === document.body) break;
      parent = composedParentElement(parent);
    }
  }

  private _release(): void {
    window.removeEventListener("resize", this._scheduleMeasure);
    window.visualViewport?.removeEventListener("resize", this._scheduleMeasure);
    this._resizeObserver?.disconnect();
    if (this._frame !== undefined) {
      cancelAnimationFrame(this._frame);
      this._frame = undefined;
    }
    this._host.style.removeProperty(FIT_BLOCK_SIZE_PROPERTY);
  }
}
