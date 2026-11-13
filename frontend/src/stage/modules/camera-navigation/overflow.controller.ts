import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { SegmentedControl } from "../../../ui/segmented-control";

const GEOMETRY_EPSILON_PX = 1;

/** Owns camera-navigation overflow measurement and horizontal scrolling. */
export class CameraNavigationOverflowController implements ReactiveController {
  public nextCount = 0;
  public overflowing = false;
  public previousCount = 0;

  private _frame?: number;
  private _items?: SegmentedControl;
  private _revealPending = false;
  private _resizeObserver?: ResizeObserver;
  private _selectedValue = "";
  private _viewport?: HTMLElement;

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public observe(
    viewport: HTMLElement | undefined,
    items: SegmentedControl | undefined,
    selectedValue: string,
  ): void {
    const selectionChanged = this._selectedValue !== selectedValue;
    this._selectedValue = selectedValue;
    if (viewport !== this._viewport || items !== this._items) {
      this._disconnect();
      this._viewport = viewport;
      this._items = items;
      viewport?.addEventListener("scroll", this._handleScroll, {
        passive: true,
      });
      if (viewport && items && typeof ResizeObserver !== "undefined") {
        this._resizeObserver = new ResizeObserver(() =>
          this._scheduleMeasurement(),
        );
        this._resizeObserver.observe(viewport);
        this._resizeObserver.observe(items);
      }
    }
    this._scheduleMeasurement(selectionChanged);
  }

  public hostDisconnected(): void {
    this._disconnect();
  }

  public readonly scrollNext = (): void => {
    this._scrollByPage(1);
  };

  public readonly scrollPrevious = (): void => {
    this._scrollByPage(-1);
  };

  private readonly _handleScroll = (): void => {
    this._scheduleMeasurement();
  };

  private readonly _scheduleMeasurement = (revealSelected = false): void => {
    this._revealPending ||= revealSelected;
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = requestAnimationFrame(() => {
      this._frame = undefined;
      const shouldReveal = this._revealPending;
      this._revealPending = false;
      if (shouldReveal) this._revealSelected();
      this._measure();
    });
  };

  private _buttons(): readonly HTMLButtonElement[] {
    return this._items
      ? [
          ...this._items.renderRoot.querySelectorAll<HTMLButtonElement>(
            ".segmented-control-option",
          ),
        ]
      : [];
  }

  private _measure(): void {
    const viewport = this._viewport;
    if (!viewport) return this._setMeasurement(0, 0, false);
    const viewportRect = viewport.getBoundingClientRect();
    let previous = 0;
    let next = 0;
    for (const button of this._buttons()) {
      const buttonRect = button.getBoundingClientRect();
      if (buttonRect.left < viewportRect.left - GEOMETRY_EPSILON_PX)
        previous += 1;
      if (buttonRect.right > viewportRect.right + GEOMETRY_EPSILON_PX)
        next += 1;
    }
    const overflowing =
      viewport.scrollWidth > viewport.clientWidth + GEOMETRY_EPSILON_PX ||
      previous + next > 0;
    if (overflowing !== this.overflowing) {
      // Alignment changes the button geometry. Publish that mode first, then
      // measure counts only after the centered/start-aligned layout settles.
      this._setMeasurement(0, 0, overflowing);
      void this._host.updateComplete.then(() => this._scheduleMeasurement());
      return;
    }
    this._setMeasurement(previous, next, overflowing);
  }

  private _setMeasurement(
    previous: number,
    next: number,
    overflowing: boolean,
  ): void {
    if (
      previous === this.previousCount &&
      next === this.nextCount &&
      overflowing === this.overflowing
    )
      return;
    this.previousCount = previous;
    this.nextCount = next;
    this.overflowing = overflowing;
    this._host.requestUpdate();
  }

  private _revealSelected(): void {
    const viewport = this._viewport;
    const selected = this._buttons().find(
      (button) => button.dataset.value === this._selectedValue,
    );
    if (!viewport || !selected) return;
    const viewportRect = viewport.getBoundingClientRect();
    const buttonRect = selected.getBoundingClientRect();
    if (buttonRect.left < viewportRect.left) {
      viewport.scrollTo({
        left: viewport.scrollLeft + buttonRect.left - viewportRect.left,
      });
    } else if (buttonRect.right > viewportRect.right) {
      viewport.scrollTo({
        left: viewport.scrollLeft + buttonRect.right - viewportRect.right,
      });
    }
  }

  private _scrollByPage(direction: -1 | 1): void {
    const viewport = this._viewport;
    if (!viewport) return;
    viewport.scrollBy({
      behavior: "smooth",
      left: direction * Math.max(1, viewport.clientWidth * 0.8),
    });
  }

  private _disconnect(): void {
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = undefined;
    this._revealPending = false;
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this._viewport?.removeEventListener("scroll", this._handleScroll);
    this._viewport = undefined;
    this._items = undefined;
  }
}
