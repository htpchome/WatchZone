import type { ReactiveController, ReactiveControllerHost } from "lit";

const GEOMETRY_EPSILON_PX = 1;
const SWIPE_THRESHOLD_PX = 32;

interface CameraNavigationPage {
  readonly end: number;
  readonly start: number;
}

/** Owns camera-navigation pagination, measurement, and swipe settlement. */
export class CameraNavigationOverflowController implements ReactiveController {
  public endIndex = 1;
  public nextCount = 0;
  public overflowing = false;
  public previousCount = 0;
  public startIndex = 0;

  private _clickReset?: number;
  private _frame?: number;
  private _itemValues: readonly string[] = [];
  private _measurement?: HTMLElement;
  private _pageIndex = 0;
  private _pages: readonly CameraNavigationPage[] = [];
  private _pointer?: { id: number; x: number; y: number };
  private _resizeObserver?: ResizeObserver;
  private _selectedValue = "";
  private _selectionPending = false;
  private _suppressClick = false;
  private _viewport?: HTMLElement;

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public observe(
    viewport: HTMLElement | undefined,
    measurement: HTMLElement | undefined,
    selectedValue: string,
    itemValues: readonly string[],
  ): void {
    this._selectionPending ||= this._selectedValue !== selectedValue;
    this._selectedValue = selectedValue;
    this._itemValues = itemValues;
    if (viewport !== this._viewport || measurement !== this._measurement) {
      this._disconnectElements();
      this._viewport = viewport;
      this._measurement = measurement;
      viewport?.addEventListener("click", this._handleClick, true);
      viewport?.addEventListener("pointercancel", this._handlePointerCancel);
      viewport?.addEventListener("pointerdown", this._handlePointerDown);
      viewport?.addEventListener("pointerup", this._handlePointerUp);
      if (viewport && measurement && typeof ResizeObserver !== "undefined") {
        // ResizeObserver runs before paint, so repaginate at that boundary and
        // never expose a partially fitting previous page for one frame.
        this._resizeObserver = new ResizeObserver(() => this._measure());
        this._resizeObserver.observe(viewport);
        this._resizeObserver.observe(measurement);
      }
    }
    this._scheduleMeasurement();
  }

  public hostDisconnected(): void {
    this._disconnectElements();
  }

  public readonly scrollNext = (): void => {
    this._selectPage(this._pageIndex + 1);
  };

  public readonly scrollPrevious = (): void => {
    this._selectPage(this._pageIndex - 1);
  };

  private readonly _handleClick = (event: Event): void => {
    if (!this._suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this._suppressClick = false;
  };

  private readonly _handlePointerCancel = (): void => {
    this._pointer = undefined;
  };

  private readonly _handlePointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary) return;
    this._pointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };

  private readonly _handlePointerUp = (event: PointerEvent): void => {
    const pointer = this._pointer;
    this._pointer = undefined;
    if (!pointer || pointer.id !== event.pointerId) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    if (
      Math.abs(deltaX) < SWIPE_THRESHOLD_PX ||
      Math.abs(deltaX) <= Math.abs(deltaY)
    )
      return;
    const nextPage = this._pageIndex + (deltaX < 0 ? 1 : -1);
    if (nextPage < 0 || nextPage >= this._pages.length) return;
    this._suppressClick = true;
    if (this._clickReset !== undefined) clearTimeout(this._clickReset);
    this._clickReset = window.setTimeout(() => {
      this._clickReset = undefined;
      this._suppressClick = false;
    });
    this._selectPage(nextPage);
  };

  private readonly _scheduleMeasurement = (): void => {
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = requestAnimationFrame(() => {
      this._frame = undefined;
      this._measure();
    });
  };

  private _measure(): void {
    const viewport = this._viewport;
    const measurement = this._measurement;
    if (!viewport || !measurement || this._itemValues.length === 0) {
      this._publish([], 0);
      return;
    }
    const items = [
      ...measurement.querySelectorAll<HTMLElement>(".measurement-item"),
    ];
    if (items.length !== this._itemValues.length) return;
    const style = getComputedStyle(measurement);
    const gap = Number.parseFloat(style.columnGap) || 0;
    const padding =
      (Number.parseFloat(style.paddingLeft) || 0) +
      (Number.parseFloat(style.paddingRight) || 0);
    const available = Math.max(1, viewport.clientWidth - padding);
    const pages: CameraNavigationPage[] = [];
    let start = 0;
    while (start < items.length) {
      let end = start;
      let used = 0;
      while (end < items.length) {
        const width = items[end]?.getBoundingClientRect().width ?? 0;
        const candidate = used + (end > start ? gap : 0) + width;
        if (end > start && candidate > available + GEOMETRY_EPSILON_PX) break;
        used = candidate;
        end += 1;
      }
      pages.push({ start, end: Math.max(start + 1, end) });
      start = Math.max(start + 1, end);
    }
    const selectedIndex = this._itemValues.indexOf(this._selectedValue);
    const selectedPage = pages.findIndex(
      ({ end, start: pageStart }) =>
        selectedIndex >= pageStart && selectedIndex < end,
    );
    const pageIndex =
      this._selectionPending && selectedPage >= 0
        ? selectedPage
        : Math.min(this._pageIndex, Math.max(0, pages.length - 1));
    this._selectionPending = false;
    this._publish(pages, pageIndex);
  }

  private _selectPage(pageIndex: number): void {
    if (pageIndex < 0 || pageIndex >= this._pages.length) return;
    this._publish(this._pages, pageIndex);
  }

  private _publish(
    pages: readonly CameraNavigationPage[],
    pageIndex: number,
  ): void {
    const page = pages[pageIndex] ?? {
      start: 0,
      end: Math.min(1, this._itemValues.length),
    };
    const previous = page.start;
    const next = Math.max(0, this._itemValues.length - page.end);
    const overflowing = pages.length > 1;
    if (
      page.start === this.startIndex &&
      page.end === this.endIndex &&
      previous === this.previousCount &&
      next === this.nextCount &&
      overflowing === this.overflowing
    ) {
      this._pages = pages;
      this._pageIndex = pageIndex;
      return;
    }
    this._pages = pages;
    this._pageIndex = pageIndex;
    this.startIndex = page.start;
    this.endIndex = page.end;
    this.previousCount = previous;
    this.nextCount = next;
    this.overflowing = overflowing;
    this._host.requestUpdate();
  }

  private _disconnectElements(): void {
    if (this._clickReset !== undefined) clearTimeout(this._clickReset);
    this._clickReset = undefined;
    this._suppressClick = false;
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = undefined;
    this._pointer = undefined;
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this._viewport?.removeEventListener("click", this._handleClick, true);
    this._viewport?.removeEventListener(
      "pointercancel",
      this._handlePointerCancel,
    );
    this._viewport?.removeEventListener("pointerdown", this._handlePointerDown);
    this._viewport?.removeEventListener("pointerup", this._handlePointerUp);
    this._viewport = undefined;
    this._measurement = undefined;
  }
}
