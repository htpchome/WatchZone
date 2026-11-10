import type { ReactiveController, ReactiveControllerHost } from "lit";

const POPOVER_GAP = 4;
const VIEWPORT_MARGIN = 16;

export type ActivityPopoverPlacement = "above" | "below" | "left" | "right";

export interface ActivityPopoverGeometry {
  readonly left: number;
  readonly maxHeight: number;
  readonly placement: ActivityPopoverPlacement;
  readonly top: number;
}

interface Rectangle {
  readonly bottom: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
}

interface ViewportRectangle {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

/** Keeps an activity popover in the top layer and attached to its trigger. */
export class ActivityPopoverController implements ReactiveController {
  private _listening = false;
  private _popover?: HTMLElement;
  private _positionFrame?: number;

  public constructor(
    private readonly _host: ReactiveControllerHost & HTMLElement,
    private readonly _open: () => boolean,
    private readonly _triggerSelector: string,
    private readonly _popoverSelector = ".popover",
  ) {
    _host.addController(this);
  }

  public hostUpdated(): void {
    const popover = this._host.shadowRoot?.querySelector<HTMLElement>(
      this._popoverSelector,
    );
    if (!this._open() || !popover) {
      this._stopPositioning();
      return;
    }
    this._popover = popover;
    if (
      typeof popover.showPopover === "function" &&
      !popover.matches(":popover-open")
    ) {
      popover.showPopover();
    }
    this._startPositioning();
    this._schedulePosition();
  }

  public hostDisconnected(): void {
    this._stopPositioning();
  }

  private _startPositioning(): void {
    if (this._listening) return;
    this._listening = true;
    window.addEventListener("resize", this._schedulePosition);
    window.addEventListener("scroll", this._schedulePosition, true);
    window.visualViewport?.addEventListener("resize", this._schedulePosition);
    window.visualViewport?.addEventListener("scroll", this._schedulePosition);
  }

  private _stopPositioning(): void {
    this._popover = undefined;
    if (this._positionFrame !== undefined) {
      window.cancelAnimationFrame(this._positionFrame);
      this._positionFrame = undefined;
    }
    if (!this._listening) return;
    this._listening = false;
    window.removeEventListener("resize", this._schedulePosition);
    window.removeEventListener("scroll", this._schedulePosition, true);
    window.visualViewport?.removeEventListener(
      "resize",
      this._schedulePosition,
    );
    window.visualViewport?.removeEventListener(
      "scroll",
      this._schedulePosition,
    );
  }

  private readonly _schedulePosition = (): void => {
    if (this._positionFrame !== undefined) return;
    this._positionFrame = window.requestAnimationFrame(() => {
      this._positionFrame = undefined;
      this._position();
    });
  };

  private _position(): void {
    const popover = this._popover;
    const trigger = this._host.shadowRoot?.querySelector<HTMLElement>(
      this._triggerSelector,
    );
    if (
      !popover ||
      !trigger ||
      (typeof popover.showPopover === "function" &&
        !popover.matches(":popover-open"))
    ) {
      return;
    }
    const visualViewport = window.visualViewport;
    const geometry = activityPopoverGeometry(
      trigger.getBoundingClientRect(),
      popover.getBoundingClientRect(),
      {
        height: visualViewport?.height ?? window.innerHeight,
        left: visualViewport?.offsetLeft ?? 0,
        top: visualViewport?.offsetTop ?? 0,
        width: visualViewport?.width ?? window.innerWidth,
      },
    );
    popover.dataset.placement = geometry.placement;
    popover.style.left = `${geometry.left}px`;
    popover.style.maxHeight = `${geometry.maxHeight}px`;
    popover.style.top = `${geometry.top}px`;
  }
}

/** Pure placement policy shared by the filter and calendar popovers. */
export function activityPopoverGeometry(
  trigger: Rectangle,
  popover: Rectangle,
  viewport: ViewportRectangle,
): ActivityPopoverGeometry {
  const viewportLeft = viewport.left + VIEWPORT_MARGIN;
  const viewportTop = viewport.top + VIEWPORT_MARGIN;
  const viewportRight = viewport.left + viewport.width - VIEWPORT_MARGIN;
  const viewportBottom = viewport.top + viewport.height - VIEWPORT_MARGIN;
  const below = Math.max(0, viewportBottom - trigger.bottom - POPOVER_GAP);
  const above = Math.max(0, trigger.top - POPOVER_GAP - viewportTop);
  const right = Math.max(0, viewportRight - trigger.right - POPOVER_GAP);
  const left = Math.max(0, trigger.left - POPOVER_GAP - viewportLeft);
  const clampedLeft = clamp(
    trigger.right - popover.width,
    viewportLeft,
    viewportRight - popover.width,
  );

  if (popover.height <= below) {
    return {
      left: clampedLeft,
      maxHeight: below,
      placement: "below",
      top: trigger.bottom + POPOVER_GAP,
    };
  }
  if (popover.height <= above) {
    return {
      left: clampedLeft,
      maxHeight: above,
      placement: "above",
      top: trigger.top - POPOVER_GAP - popover.height,
    };
  }

  const availableHeight = Math.max(0, viewportBottom - viewportTop);
  const sideTop = clamp(
    trigger.top,
    viewportTop,
    viewportBottom - Math.min(popover.height, availableHeight),
  );
  if (popover.width <= left || popover.width <= right) {
    const useLeft =
      popover.width <= left && (popover.width > right || left > right);
    return useLeft
      ? {
          left: trigger.left - POPOVER_GAP - popover.width,
          maxHeight: availableHeight,
          placement: "left",
          top: sideTop,
        }
      : {
          left: trigger.right + POPOVER_GAP,
          maxHeight: availableHeight,
          placement: "right",
          top: sideTop,
        };
  }

  const useAbove = above > below;
  return {
    left: clampedLeft,
    maxHeight: useAbove ? above : below,
    placement: useAbove ? "above" : "below",
    top: useAbove ? viewportTop : trigger.bottom + POPOVER_GAP,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}
