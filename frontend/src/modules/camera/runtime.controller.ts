import type { ReactiveController, ReactiveControllerHost } from "lit";

import {
  setCameraSuspended,
  subscribeCameraRuntime,
  type CameraRuntimeSnapshot,
} from "../../api/camera-runtime";
import type {
  HomeAssistantApi,
  HomeAssistantConnection,
  HomeAssistantConnectionEventListener,
} from "../../core/home-assistant";
import { CAMERA_RUNTIME_RESUBSCRIBE_DELAYS_MS } from "./constants";

export class CameraRuntimeController implements ReactiveController {
  private _api?: HomeAssistantApi;
  private _connected = false;
  private _entityId?: string;
  private _generation = 0;
  private _pending = false;
  private _retryAttempt = 0;
  private _retryTimer?: ReturnType<typeof setTimeout>;
  private _snapshot?: CameraRuntimeSnapshot;
  private _unsubscribe?: () => void;
  private _observedConnection?: HomeAssistantConnection;

  public constructor(private readonly _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  public get pending(): boolean {
    return this._pending;
  }

  public get snapshot(): CameraRuntimeSnapshot | undefined {
    return this._snapshot;
  }

  public configure(
    api: HomeAssistantApi | undefined,
    entityId: string | undefined,
  ): void {
    if (this._api?.identity === api?.identity && this._entityId === entityId)
      return;
    this._unobserveConnection();
    this._clearRetry();
    this._api = api;
    this._entityId = entityId;
    this._snapshot = undefined;
    this._pending = false;
    this._observeConnection();
    this._resubscribe(true);
  }

  public async setSuspended(
    suspended: boolean,
    resumeAfterSeconds?: number,
  ): Promise<void> {
    if (!this._api || !this._entityId || this._pending) return;
    this._pending = true;
    this._host.requestUpdate();
    const generation = this._generation;
    try {
      const snapshot = await setCameraSuspended(
        this._api,
        this._entityId,
        suspended,
        resumeAfterSeconds,
      );
      if (generation === this._generation) this._snapshot = snapshot;
    } finally {
      if (generation === this._generation) {
        this._pending = false;
        this._host.requestUpdate();
      }
    }
  }

  public hostConnected(): void {
    this._connected = true;
    this._observeConnection();
    this._resubscribe(true);
  }

  public hostDisconnected(): void {
    this._connected = false;
    this._unobserveConnection();
    this._clearRetry();
    this._generation += 1;
    this._unsubscribe?.();
    this._unsubscribe = undefined;
  }

  private readonly _handleConnectionDisconnected: HomeAssistantConnectionEventListener =
    () => {
      this._clearRetry();
      this._generation += 1;
      this._unsubscribe = undefined;
      if (this._pending) {
        this._pending = false;
        this._host.requestUpdate();
      }
    };

  private readonly _handleConnectionReady: HomeAssistantConnectionEventListener =
    () => {
      this._resubscribe(true);
    };

  private _observeConnection(): void {
    const connection = this._api?.identity;
    if (
      !this._connected ||
      !connection ||
      this._observedConnection === connection ||
      !connection.addEventListener ||
      !connection.removeEventListener
    ) {
      return;
    }
    this._unobserveConnection();
    connection.addEventListener(
      "disconnected",
      this._handleConnectionDisconnected,
    );
    connection.addEventListener("ready", this._handleConnectionReady);
    this._observedConnection = connection;
  }

  private _unobserveConnection(): void {
    const connection = this._observedConnection;
    if (!connection) return;
    connection.removeEventListener?.(
      "disconnected",
      this._handleConnectionDisconnected,
    );
    connection.removeEventListener?.("ready", this._handleConnectionReady);
    this._observedConnection = undefined;
  }

  private _clearRetry(resetAttempt = true): void {
    if (this._retryTimer !== undefined) {
      clearTimeout(this._retryTimer);
      this._retryTimer = undefined;
    }
    if (resetAttempt) this._retryAttempt = 0;
  }

  private _scheduleRetry(): void {
    if (
      !this._connected ||
      !this._api ||
      !this._entityId ||
      this._retryTimer !== undefined
    ) {
      return;
    }
    const delay = CAMERA_RUNTIME_RESUBSCRIBE_DELAYS_MS[this._retryAttempt];
    if (delay === undefined) return;
    this._retryAttempt += 1;
    this._retryTimer = setTimeout(() => {
      this._retryTimer = undefined;
      this._resubscribe(false);
    }, delay);
  }

  private _resubscribe(resetRetry = false): void {
    if (resetRetry) this._clearRetry();
    const generation = ++this._generation;
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    if (!this._connected || !this._api || !this._entityId) return;
    const entityId = this._entityId;
    let subscription: Promise<() => void>;
    try {
      subscription = subscribeCameraRuntime(this._api, entityId, (snapshot) => {
        if (generation !== this._generation || snapshot.entity_id !== entityId)
          return;
        this._clearRetry();
        this._snapshot = snapshot;
        this._host.requestUpdate();
      });
    } catch {
      if (generation === this._generation) this._scheduleRetry();
      return;
    }
    void Promise.resolve(subscription)
      .then((unsubscribe) => {
        if (typeof unsubscribe !== "function") return;
        if (generation !== this._generation) unsubscribe();
        else this._unsubscribe = unsubscribe;
      })
      .catch(() => {
        if (generation === this._generation) this._scheduleRetry();
      });
  }
}
