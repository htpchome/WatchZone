const SETTLE_INTERVAL_MS = 64;
const SAFE_AREA_WAIT_MS = 240;

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface CompanionLandscapeGeometry {
  readonly safeBottom: number;
  readonly safeLeft: number;
  readonly safeRight: number;
  readonly safeTop: number;
  readonly viewportHeight: number;
  readonly viewportLeft: number;
  readonly viewportTop: number;
  readonly viewportWidth: number;
}

/** Waits for one stable Companion landscape geometry and safe-area snapshot. */
export class CompanionRotationSettlement {
  private _signature?: string;
  private _startedAt = 0;
  private _timer?: number;

  public constructor(
    private readonly _host: HTMLElement,
    private readonly _mirrorInlineInsets: boolean,
  ) {}

  public start(
    boundary: HTMLElement,
    settled: (geometry: CompanionLandscapeGeometry) => void,
  ): void {
    this.cancel();
    this._startedAt = performance.now();
    this._measure(boundary, settled);
  }

  public cancel(): void {
    if (this._timer !== undefined) clearTimeout(this._timer);
    this._timer = undefined;
    this._startedAt = 0;
    this._signature = undefined;
  }

  private _measure(
    boundary: HTMLElement,
    settled: (geometry: CompanionLandscapeGeometry) => void,
  ): void {
    this._timer = undefined;
    if (!this._startedAt || !boundary.isConnected) return;
    const style = getComputedStyle(this._host);
    const reportedLeft = pixels(
      style.getPropertyValue("--wzc-safe-area-inset-left"),
    );
    const reportedRight = pixels(
      style.getPropertyValue("--wzc-safe-area-inset-right"),
    );
    const mirroredInlineInset = Math.max(reportedLeft, reportedRight);
    const viewport = window.visualViewport;
    const geometry: CompanionLandscapeGeometry = {
      safeBottom: pixels(
        style.getPropertyValue("--wzc-safe-area-inset-bottom"),
      ),
      safeLeft: this._mirrorInlineInsets ? mirroredInlineInset : reportedLeft,
      safeRight: this._mirrorInlineInsets ? mirroredInlineInset : reportedRight,
      safeTop: pixels(style.getPropertyValue("--wzc-safe-area-inset-top")),
      viewportHeight: viewport?.height ?? window.innerHeight,
      viewportLeft: viewport?.offsetLeft ?? 0,
      viewportTop: viewport?.offsetTop ?? 0,
      viewportWidth: viewport?.width ?? window.innerWidth,
    };
    const signature = `${boundary.getBoundingClientRect().width}:${this._host.getBoundingClientRect().left}:${geometry.viewportLeft}:${geometry.viewportTop}:${geometry.viewportWidth}:${geometry.viewportHeight}:${geometry.safeLeft}:${geometry.safeRight}:${geometry.safeTop}:${geometry.safeBottom}`;
    if (
      signature === this._signature &&
      (mirroredInlineInset > 0 ||
        performance.now() - this._startedAt >= SAFE_AREA_WAIT_MS)
    ) {
      this.cancel();
      settled(geometry);
      return;
    }
    this._signature = signature;
    this._timer = window.setTimeout(
      () => this._measure(boundary, settled),
      SETTLE_INTERVAL_MS,
    );
  }
}
