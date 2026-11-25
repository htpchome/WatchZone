const SETTLE_INTERVAL_MS = 64;
const SAFE_AREA_WAIT_MS = 240;

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Waits for one stable Companion landscape geometry and safe-area snapshot. */
export class CompanionRotationSettlement {
  private _signature?: string;
  private _startedAt = 0;
  private _timer?: number;

  public constructor(private readonly _host: HTMLElement) {}

  public start(
    boundary: HTMLElement,
    settled: (inlineInset: number) => void,
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
    settled: (inlineInset: number) => void,
  ): void {
    this._timer = undefined;
    if (!this._startedAt || !boundary.isConnected) return;
    const style = getComputedStyle(this._host);
    const inlineInset = Math.max(
      pixels(style.getPropertyValue("--wzc-safe-area-inset-left")),
      pixels(style.getPropertyValue("--wzc-safe-area-inset-right")),
    );
    const signature = `${boundary.getBoundingClientRect().width}:${this._host.getBoundingClientRect().left}:${window.visualViewport?.height ?? window.innerHeight}:${inlineInset}`;
    if (
      signature === this._signature &&
      (inlineInset > 0 ||
        performance.now() - this._startedAt >= SAFE_AREA_WAIT_MS)
    ) {
      this.cancel();
      settled(inlineInset);
      return;
    }
    this._signature = signature;
    this._timer = window.setTimeout(
      () => this._measure(boundary, settled),
      SETTLE_INTERVAL_MS,
    );
  }
}
