import type { ReactiveController, ReactiveControllerHost } from "lit";

export interface CameraConnectionCandidate {
  readonly available: boolean;
  readonly key: string;
}

/** Enables camera connections one at a time in configured display order. */
export class CameraConnectionQueueController implements ReactiveController {
  private _candidates: readonly CameraConnectionCandidate[] = [];
  private readonly _enabled = new Set<string>();
  private _pending?: string;
  private readonly _settled = new Set<string>();
  private _online = true;

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public configure(
    candidates: readonly CameraConnectionCandidate[],
    online = true,
  ): void {
    const keys = new Set(candidates.map(({ key }) => key));
    for (const key of this._enabled) {
      if (!keys.has(key)) this._enabled.delete(key);
    }
    for (const key of this._settled) {
      if (!keys.has(key)) this._settled.delete(key);
    }
    if (this._pending && !keys.has(this._pending)) this._pending = undefined;
    this._candidates = candidates;
    if (!online) {
      const changed = this._enabled.size > 0 || this._pending !== undefined;
      this._enabled.clear();
      this._pending = undefined;
      this._settled.clear();
      this._online = false;
      if (changed) this._host.requestUpdate();
      return;
    }
    this._online = true;
    this._advance();
  }

  public isEnabled(key: string): boolean {
    return this._enabled.has(key);
  }

  /** Starts a selected queued camera without disturbing the ordered worker. */
  public prioritize(key: string): void {
    if (
      !this._online ||
      this._enabled.has(key) ||
      !this._candidates.some((candidate) => candidate.key === key)
    )
      return;
    this._enabled.add(key);
    this._host.requestUpdate();
  }

  public settle(key: string): void {
    if (!this._enabled.has(key)) return;
    this._settled.add(key);
    if (this._pending !== key) return;
    this._pending = undefined;
    this._advance();
  }

  public hostConnected(): void {
    this._advance();
  }

  public hostDisconnected(): void {}

  private _advance(): void {
    if (!this._online || this._pending) return;
    let changed = false;
    for (const candidate of this._candidates) {
      if (this._enabled.has(candidate.key)) {
        if (candidate.available && !this._settled.has(candidate.key)) {
          this._pending = candidate.key;
          return;
        }
        continue;
      }
      this._enabled.add(candidate.key);
      changed = true;
      if (candidate.available) {
        this._pending = candidate.key;
        this._host.requestUpdate();
        return;
      }
    }
    if (changed) this._host.requestUpdate();
  }
}
