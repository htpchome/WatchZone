import type { DeviceClass } from "./device-profile";
import {
  MAX_CONSTRAINED_MOBILE_CONNECTED_CAMERAS,
  MAX_MOBILE_CONNECTED_CAMERAS,
  MOBILE_CAMERA_WARM_RETENTION_MS,
} from "./constants";

interface NetworkInformationLike {
  readonly saveData?: boolean;
  readonly type?: string;
  addEventListener?(type: "change", listener: () => void): void;
  removeEventListener?(type: "change", listener: () => void): void;
}

export interface MediaRetentionCamera {
  readonly active: boolean;
  readonly deviceClass: DeviceClass;
  readonly key: string;
  readonly lastUsed: number;
}

export interface MediaRetentionEnvironment {
  readonly network?: NetworkInformationLike;
  readonly now?: () => number;
  readonly setTimer?: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer?: (timer: unknown) => void;
}

function browserNetwork(): NetworkInformationLike | undefined {
  return (
    globalThis.navigator as Navigator & {
      readonly connection?: NetworkInformationLike;
    }
  ).connection;
}

/** Owns provider-neutral mobile MRU, expiry, and network retention decisions. */
export class MediaRetentionPolicy {
  private readonly _clearTimer: (timer: unknown) => void;
  private readonly _network?: NetworkInformationLike;
  private readonly _now: () => number;
  private readonly _setTimer: (
    callback: () => void,
    delayMs: number,
  ) => unknown;
  private _timer?: unknown;

  public constructor(
    private readonly _onPolicyChange: () => void,
    environment: MediaRetentionEnvironment = {},
  ) {
    this._network = environment.network ?? browserNetwork();
    this._now = environment.now ?? (() => performance.now());
    this._setTimer =
      environment.setTimer ??
      ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
    this._clearTimer =
      environment.clearTimer ??
      ((timer) =>
        globalThis.clearTimeout(
          timer as ReturnType<typeof globalThis.setTimeout>,
        ));
    this._network?.addEventListener?.("change", this._handleNetworkChange);
  }

  public evaluate(
    cameras: readonly MediaRetentionCamera[],
  ): ReadonlySet<string> {
    this._clearExpiry();
    const evict = new Set<string>();
    const retainedPhones = cameras
      .filter(({ active, deviceClass }) => !active && deviceClass === "phone")
      .sort((left, right) => right.lastUsed - left.lastUsed);
    if (retainedPhones.length === 0) return evict;

    const activePhoneCount = cameras.filter(
      ({ active, deviceClass }) => active && deviceClass === "phone",
    ).length;
    const connectedLimit = this._hasConfirmedUnmeteredNetwork()
      ? MAX_MOBILE_CONNECTED_CAMERAS
      : MAX_CONSTRAINED_MOBILE_CONNECTED_CAMERAS;
    const retainedLimit = Math.max(0, connectedLimit - activePhoneCount);
    const now = this._now();
    let nextExpiry = Number.POSITIVE_INFINITY;
    retainedPhones.forEach((camera, index) => {
      const expiresAt = camera.lastUsed + MOBILE_CAMERA_WARM_RETENTION_MS;
      if (index >= retainedLimit || expiresAt <= now) {
        evict.add(camera.key);
      } else {
        nextExpiry = Math.min(nextExpiry, expiresAt);
      }
    });
    if (Number.isFinite(nextExpiry)) {
      this._timer = this._setTimer(
        this._handleExpiry,
        Math.max(0, nextExpiry - now),
      );
    }
    return evict;
  }

  public dispose(): void {
    this._clearExpiry();
    this._network?.removeEventListener?.("change", this._handleNetworkChange);
  }

  private _hasConfirmedUnmeteredNetwork(): boolean {
    if (this._network?.saveData === true) return false;
    return this._network?.type === "wifi" || this._network?.type === "ethernet";
  }

  private _clearExpiry(): void {
    if (this._timer === undefined) return;
    this._clearTimer(this._timer);
    this._timer = undefined;
  }

  private readonly _handleExpiry = (): void => {
    this._timer = undefined;
    this._onPolicyChange();
  };

  private readonly _handleNetworkChange = (): void => {
    this._onPolicyChange();
  };
}
