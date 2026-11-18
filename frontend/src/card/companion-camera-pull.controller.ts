import type { LocalizeFunction } from "../core/localization";

interface PullHost extends HTMLElement {
  readonly renderRoot: DocumentFragment | HTMLElement;
}

interface CameraBounds {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

interface PullStart {
  readonly pointerId: number;
  readonly progress: number;
  readonly x: number;
}

const CAMERA_NODE_SUFFIX = "default-camera-module";
const ACTIVITY_NODE_SUFFIX = "default-activity-stack";
const DRAG_TOLERANCE_PX = 4;
const EXPANDED_HANDLE_INSET_PX = 52;
const EXPAND_THRESHOLD = 0.5;
const SETTLE_DURATION_MS = 240;

/** Owns the Companion-phone landscape camera pull gesture and snap state. */
export class CompanionCameraPullController {
  private _active = false;
  private _activity?: HTMLElement;
  private _baseline?: CameraBounds;
  private _camera?: HTMLElement;
  private _drag?: PullStart;
  private _dragFrame?: number;
  private _expanded = false;
  private _grid?: HTMLElement;
  private _handle?: HTMLButtonElement;
  private _handleBaselineLeft?: number;
  private _handleBaselineTop?: number;
  private _handleTargetLeft?: number;
  private _handleTargetTop?: number;
  private _measureFrame?: number;
  private _measurementGeneration = 0;
  private _moved = false;
  private _pendingProgress = 0;
  private _progress = 0;
  private _settleTimer?: number;
  private _surface?: HTMLElement;
  private _target?: CameraBounds;
  private readonly _geometryObserver =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => {
          if (!this._active || this._progress > 0 || this._drag) return;
          this._scheduleMeasurement();
        });

  public constructor(
    private readonly _host: PullHost,
    private readonly _localize: LocalizeFunction,
  ) {}

  public activate(): void {
    if (!this._active) {
      this._active = true;
      window.addEventListener("keydown", this._handleWindowKeydown);
    }
    this.sync();
  }

  public sync(): void {
    if (!this._active) return;
    this._connectHandle();
    if (this._progress === 0) this._scheduleMeasurement();
    else this._applyProgress(this._progress);
  }

  public deactivate(): void {
    if (!this._active && !this._handle) return;
    this._active = false;
    window.removeEventListener("keydown", this._handleWindowKeydown);
    this._resetOverlay();
    this._disconnectHandle();
  }

  private _connectHandle(): void {
    const camera = this._host.renderRoot.querySelector<HTMLElement>(
      `.stage-placement[data-layout-node$="${CAMERA_NODE_SUFFIX}"]`,
    );
    const grid =
      this._host.renderRoot.querySelector<HTMLElement>(".stage-grid");
    const activity = this._host.renderRoot.querySelector<HTMLElement>(
      `.stage-placement[data-layout-node$="${ACTIVITY_NODE_SUFFIX}"]`,
    );
    const surface = this._host.renderRoot.querySelector<HTMLElement>(".shell");
    if (!camera || !grid || !activity || !surface) return;
    if (
      this._handle?.isConnected &&
      (activity !== this._activity ||
        camera !== this._camera ||
        grid !== this._grid ||
        surface !== this._surface)
    ) {
      this._disconnectHandle();
    }
    this._activity = activity;
    this._camera = camera;
    this._grid = grid;
    this._surface = surface;
    if (this._handle?.isConnected) return;
    const handle = document.createElement("button");
    handle.className = "companion-camera-pull-handle";
    handle.type = "button";
    handle.setAttribute("role", "slider");
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", "100");
    handle.hidden = true;
    handle.addEventListener("click", this._handleClick);
    handle.addEventListener("keydown", this._handleKeydown);
    handle.addEventListener("lostpointercapture", this._cancelPointer);
    handle.addEventListener("pointercancel", this._cancelPointer);
    handle.addEventListener("pointerdown", this._startPointer);
    handle.addEventListener("pointermove", this._movePointer);
    handle.addEventListener("pointerup", this._finishPointer);
    surface.append(handle);
    this._handle = handle;
    this._geometryObserver?.observe(surface);
    this._geometryObserver?.observe(grid);
    this._geometryObserver?.observe(camera);
    this._geometryObserver?.observe(activity);
    this._syncAccessibility();
  }

  private _disconnectHandle(): void {
    const handle = this._handle;
    if (!handle) return;
    handle.removeEventListener("click", this._handleClick);
    handle.removeEventListener("keydown", this._handleKeydown);
    handle.removeEventListener("lostpointercapture", this._cancelPointer);
    handle.removeEventListener("pointercancel", this._cancelPointer);
    handle.removeEventListener("pointerdown", this._startPointer);
    handle.removeEventListener("pointermove", this._movePointer);
    handle.removeEventListener("pointerup", this._finishPointer);
    this._geometryObserver?.disconnect();
    handle.remove();
    this._handle = undefined;
    this._activity = undefined;
    this._camera = undefined;
    this._grid = undefined;
    this._surface = undefined;
  }

  private _measureBounds(): boolean {
    const camera = this._camera;
    const grid = this._grid;
    const surface = this._surface;
    const activity = this._activity;
    if (!camera || !grid || !surface || !activity || this._progress > 0)
      return false;
    const rect = camera.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const hostRect = this._host.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const activityRect = activity.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      gridRect.width <= 0 ||
      gridRect.height <= 0 ||
      hostRect.width <= 0 ||
      hostRect.height <= 0 ||
      surfaceRect.width <= 0 ||
      surfaceRect.height <= 0
    )
      return false;
    this._baseline = {
      height: rect.height,
      left: rect.left - gridRect.left,
      top: rect.top - gridRect.top,
      width: rect.width,
    };
    this._target = {
      height: hostRect.height,
      left: hostRect.left - gridRect.left,
      top: hostRect.top - gridRect.top,
      width: hostRect.width,
    };
    this._handleBaselineLeft =
      (rect.right + activityRect.left) / 2 - surfaceRect.left;
    this._handleBaselineTop = rect.top + rect.height / 2 - surfaceRect.top;
    this._handleTargetLeft =
      hostRect.right - EXPANDED_HANDLE_INSET_PX - surfaceRect.left;
    this._handleTargetTop =
      hostRect.top + hostRect.height / 2 - surfaceRect.top;
    this._host.style.setProperty(
      "--wzc-companion-camera-base-block-size",
      `${rect.bottom - gridRect.top}px`,
    );
    this._applyProgress(0);
    if (this._handle) this._handle.hidden = false;
    return true;
  }

  private _scheduleMeasurement(): void {
    const generation = ++this._measurementGeneration;
    if (this._measureFrame !== undefined)
      cancelAnimationFrame(this._measureFrame);
    this._measureFrame = requestAnimationFrame(() => {
      this._measureFrame = requestAnimationFrame(() => {
        this._measureFrame = undefined;
        if (
          generation !== this._measurementGeneration ||
          !this._active ||
          this._progress > 0
        )
          return;
        this._measureBounds();
      });
    });
  }

  private readonly _startPointer = (event: PointerEvent): void => {
    if (!this._active || event.button !== 0 || !this._handle) return;
    if (
      this._handle.hidden ||
      !this._baseline ||
      !this._target ||
      this._handleBaselineLeft === undefined ||
      this._handleTargetLeft === undefined
    )
      return;
    event.preventDefault();
    this._cancelMeasurement();
    this._cancelSettle();
    this._drag = {
      pointerId: event.pointerId,
      progress: this._progress,
      x: event.clientX,
    };
    this._pendingProgress = this._progress;
    this._moved = false;
    this._handle.setPointerCapture(event.pointerId);
    this._host.classList.add(
      "landscape-camera-overlay-active",
      "landscape-camera-overlay-dragging",
    );
    this._applyProgress(this._progress);
  };

  private readonly _movePointer = (event: PointerEvent): void => {
    const drag = this._drag;
    const handleBaselineLeft = this._handleBaselineLeft;
    const handleTargetLeft = this._handleTargetLeft;
    if (
      !drag ||
      handleBaselineLeft === undefined ||
      handleTargetLeft === undefined ||
      drag.pointerId !== event.pointerId
    )
      return;
    event.preventDefault();
    const travel = Math.max(1, handleTargetLeft - handleBaselineLeft);
    const delta = event.clientX - drag.x;
    if (Math.abs(delta) >= DRAG_TOLERANCE_PX) this._moved = true;
    this._pendingProgress = Math.min(
      1,
      Math.max(0, drag.progress + delta / travel),
    );
    this._dragFrame ??= requestAnimationFrame(this._commitDragProgress);
  };

  private readonly _finishPointer = (event: PointerEvent): void => {
    const drag = this._drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    this._commitPendingProgress();
    this._drag = undefined;
    if (this._handle?.hasPointerCapture(event.pointerId)) {
      this._handle.releasePointerCapture(event.pointerId);
    }
    this._host.classList.remove("landscape-camera-overlay-dragging");
    this._settle(this._progress >= EXPAND_THRESHOLD ? 1 : 0);
  };

  private readonly _cancelPointer = (event: PointerEvent): void => {
    const drag = this._drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this._drag = undefined;
    this._host.classList.remove("landscape-camera-overlay-dragging");
    this._settle(drag.progress >= EXPAND_THRESHOLD ? 1 : 0);
  };

  private readonly _commitDragProgress = (): void => {
    this._dragFrame = undefined;
    this._applyProgress(this._pendingProgress);
  };

  private _commitPendingProgress(): void {
    if (this._dragFrame !== undefined) {
      cancelAnimationFrame(this._dragFrame);
      this._dragFrame = undefined;
    }
    this._applyProgress(this._pendingProgress);
  }

  private _settle(target: 0 | 1): void {
    this._cancelSettle();
    this._expanded = target === 1;
    this._host.classList.toggle(
      "landscape-camera-overlay-expanded",
      this._expanded,
    );
    this._host.classList.add("landscape-camera-overlay-settling");
    requestAnimationFrame(() => this._applyProgress(target));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this._finishSettle(target);
      return;
    }
    this._settleTimer = window.setTimeout(
      () => this._finishSettle(target),
      SETTLE_DURATION_MS,
    );
  }

  private _finishSettle(target: 0 | 1): void {
    this._settleTimer = undefined;
    this._host.classList.remove("landscape-camera-overlay-settling");
    if (target === 0) {
      this._host.classList.remove("landscape-camera-overlay-active");
      this._scheduleMeasurement();
    }
    this._syncAccessibility();
  }

  private _applyProgress(progress: number): void {
    const baseline = this._baseline;
    const target = this._target;
    const handle = this._handle;
    const handleBaselineLeft = this._handleBaselineLeft;
    const handleBaselineTop = this._handleBaselineTop;
    const handleTargetLeft = this._handleTargetLeft;
    const handleTargetTop = this._handleTargetTop;
    if (
      !baseline ||
      !target ||
      !handle ||
      handleBaselineLeft === undefined ||
      handleBaselineTop === undefined ||
      handleTargetLeft === undefined ||
      handleTargetTop === undefined
    )
      return;
    this._progress = Math.min(1, Math.max(0, progress));
    const mix = (start: number, end: number) =>
      start + (end - start) * this._progress;
    const left = mix(baseline.left, target.left);
    const top = mix(baseline.top, target.top);
    const width = mix(baseline.width, target.width);
    const height = mix(baseline.height, target.height);
    this._host.style.setProperty(
      "--wzc-companion-camera-overlay-left",
      `${left}px`,
    );
    this._host.style.setProperty(
      "--wzc-companion-camera-overlay-top",
      `${top}px`,
    );
    this._host.style.setProperty(
      "--wzc-companion-camera-overlay-inline-size",
      `${width}px`,
    );
    this._host.style.setProperty(
      "--wzc-companion-camera-overlay-block-size",
      `${height}px`,
    );
    this._host.style.setProperty(
      "--wzc-companion-camera-pull-inline-start",
      `${mix(handleBaselineLeft, handleTargetLeft)}px`,
    );
    this._host.style.setProperty(
      "--wzc-companion-camera-pull-block-start",
      `${mix(handleBaselineTop, handleTargetTop)}px`,
    );
    handle.setAttribute(
      "aria-valuenow",
      String(Math.round(this._progress * 100)),
    );
  }

  private readonly _handleClick = (event: MouseEvent): void => {
    if (event.detail !== 0 || this._moved) return;
    this._settle(this._expanded ? 0 : 1);
  };

  private readonly _handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowRight" || event.key === "End") {
      event.preventDefault();
      this._settle(1);
    } else if (
      event.key === "ArrowLeft" ||
      event.key === "Home" ||
      event.key === "Escape"
    ) {
      event.preventDefault();
      this._settle(0);
    }
  };

  private readonly _handleWindowKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this._expanded) return;
    this._settle(0);
    this._handle?.focus();
  };

  private _syncAccessibility(): void {
    const handle = this._handle;
    if (!handle) return;
    const key = this._expanded
      ? "camera.exit_fullscreen"
      : "camera.enter_fullscreen";
    const label = this._localize(key);
    handle.setAttribute("aria-label", label);
    handle.title = label;
    handle.setAttribute("aria-valuetext", label);
  }

  private _cancelSettle(): void {
    if (this._settleTimer !== undefined) clearTimeout(this._settleTimer);
    this._settleTimer = undefined;
    this._host.classList.remove("landscape-camera-overlay-settling");
  }

  private _cancelMeasurement(): void {
    this._measurementGeneration += 1;
    if (this._measureFrame !== undefined)
      cancelAnimationFrame(this._measureFrame);
    this._measureFrame = undefined;
  }

  private _resetOverlay(): void {
    this._cancelSettle();
    if (this._dragFrame !== undefined) cancelAnimationFrame(this._dragFrame);
    this._dragFrame = undefined;
    this._cancelMeasurement();
    if (this._drag && this._handle?.hasPointerCapture(this._drag.pointerId)) {
      this._handle.releasePointerCapture(this._drag.pointerId);
    }
    this._drag = undefined;
    this._expanded = false;
    this._moved = false;
    this._pendingProgress = 0;
    this._progress = 0;
    this._baseline = undefined;
    this._handleBaselineLeft = undefined;
    this._handleBaselineTop = undefined;
    this._handleTargetLeft = undefined;
    this._handleTargetTop = undefined;
    this._target = undefined;
    this._host.classList.remove(
      "landscape-camera-overlay-active",
      "landscape-camera-overlay-dragging",
      "landscape-camera-overlay-expanded",
      "landscape-camera-overlay-settling",
    );
    for (const property of [
      "--wzc-companion-camera-base-block-size",
      "--wzc-companion-camera-overlay-left",
      "--wzc-companion-camera-overlay-top",
      "--wzc-companion-camera-overlay-inline-size",
      "--wzc-companion-camera-overlay-block-size",
      "--wzc-companion-camera-pull-inline-start",
      "--wzc-companion-camera-pull-block-start",
    ]) {
      this._host.style.removeProperty(property);
    }
  }
}
