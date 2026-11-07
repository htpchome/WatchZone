import { CLIENT_PROFILE, type ClientDeviceClass } from "./client-profile";
import {
  MAX_REDUCED_BANDWIDTH_CONNECTED_CAMERAS,
  REDUCED_BANDWIDTH_CAMERA_RETENTION_MS,
} from "./constants";

export type MediaRetentionPreference = "automatic" | "reduced_bandwidth";
export type MediaRetentionProfile = "standard" | "reduced_bandwidth";

interface NetworkInformationLike {
  readonly saveData?: boolean;
  readonly type?: string;
  addEventListener?(type: "change", listener: () => void): void;
  removeEventListener?(type: "change", listener: () => void): void;
}

export interface MediaRetentionCamera {
  readonly active: boolean;
  readonly key: string;
  readonly lastUsed: number;
  readonly preference: MediaRetentionPreference;
}

export interface MediaRetentionEnvironment {
  readonly clientDeviceClass?: ClientDeviceClass;
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

/** Owns provider-neutral retention-profile, MRU, expiry, and network decisions. */
export class MediaRetentionPolicy {
  private readonly _clientDeviceClass: ClientDeviceClass;
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
    this._clientDeviceClass =
      environment.clientDeviceClass ?? CLIENT_PROFILE.deviceClass;
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
    const retainedReducedBandwidthPhones = cameras
      .filter(
        (camera) =>
          !camera.active && this._profileFor(camera) === "reduced_bandwidth",
      )
      .sort((left, right) => right.lastUsed - left.lastUsed);
    if (retainedReducedBandwidthPhones.length === 0) return evict;

    const activeReducedBandwidthPhoneCount = cameras.filter(
      (camera) =>
        camera.active && this._profileFor(camera) === "reduced_bandwidth",
    ).length;
    const retainedLimit = Math.max(
      0,
      MAX_REDUCED_BANDWIDTH_CONNECTED_CAMERAS -
        activeReducedBandwidthPhoneCount,
    );
    const now = this._now();
    let nextExpiry = Number.POSITIVE_INFINITY;
    retainedReducedBandwidthPhones.forEach((camera, index) => {
      const expiresAt = camera.lastUsed + REDUCED_BANDWIDTH_CAMERA_RETENTION_MS;
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

  private _profileFor(camera: MediaRetentionCamera): MediaRetentionProfile {
    if (this._clientDeviceClass !== "phone") return "standard";
    if (camera.preference === "reduced_bandwidth") {
      return "reduced_bandwidth";
    }
    if (
      this._network?.saveData === true ||
      this._network?.type === "cellular"
    ) {
      return "reduced_bandwidth";
    }
    return "standard";
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
