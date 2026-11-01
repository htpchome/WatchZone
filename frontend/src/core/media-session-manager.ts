import type { HomeAssistantApi } from "./home-assistant";
import {
  beginLiveStartupTiming,
  type LiveStartupTiming,
} from "./live-startup-timing";

export type MediaSessionState =
  "new" | "connecting" | "live" | "parked" | "failed" | "closing" | "closed";

export type MediaTransport = "hls_mse" | "hls_native" | "webrtc";

export interface MediaSessionSnapshot {
  readonly error?: string;
  readonly state: MediaSessionState;
  readonly stream?: MediaStream;
  readonly timing?: LiveStartupTiming;
  readonly transport?: MediaTransport;
  readonly video?: HTMLVideoElement;
}

export interface MediaConnection {
  readonly stream?: MediaStream;
  readonly timing?: LiveStartupTiming;
  readonly transport?: MediaTransport;
  readonly video?: HTMLVideoElement;
  close(): void;
}

export type ConnectionFactory = (
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
) => Promise<MediaConnection>;

export interface MediaSessionLease {
  readonly key: string;
  discard(): void;
  getSnapshot(): MediaSessionSnapshot;
  release(): void;
  retry(): void;
  subscribe(listener: (snapshot: MediaSessionSnapshot) => void): () => void;
}

const RETAIN_IDLE_MS = 5 * 60 * 1000;
const HLS_RETAIN_IDLE_MS = 15 * 1000;
const MAX_RETAINED_SESSIONS = 4;
const MAX_RECONNECT_ATTEMPTS = 2;
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_JITTER_MS = 250;
const RECONNECT_STABLE_RESET_MS = 30_000;

const defaultConnectionFactory: ConnectionFactory = async (...args) => {
  const timing = args[4];
  timing.mark("adapter_import_started");
  const { createHomeAssistantWebRtcConnection } =
    await import("../connections/home-assistant");
  timing.mark("adapter_imported");
  return createHomeAssistantWebRtcConnection(...args);
};

const defaultHlsConnectionFactory: ConnectionFactory = async (...args) => {
  const timing = args[4];
  timing.mark("adapter_import_started");
  const { createHomeAssistantHlsConnection } =
    await import("../connections/home-assistant/hls");
  timing.mark("adapter_imported");
  return createHomeAssistantHlsConnection(...args);
};

class ManagedMediaSession {
  private _api: HomeAssistantApi;
  private _connection?: MediaConnection;
  private _connectAbort?: AbortController;
  private _generation = 0;
  private _idleTimer?: ReturnType<typeof setTimeout>;
  private _leaseCount = 0;
  private _reconnectAttempts = 0;
  private _reconnectTimer?: ReturnType<typeof setTimeout>;
  private _stabilityTimer?: ReturnType<typeof setTimeout>;
  private readonly _listeners = new Set<
    (snapshot: MediaSessionSnapshot) => void
  >();
  private _snapshot: MediaSessionSnapshot = { state: "new" };

  public lastUsed = performance.now();

  public constructor(
    public readonly key: string,
    public readonly entityId: string,
    api: HomeAssistantApi,
    private readonly _factory: ConnectionFactory,
    private readonly _retainIdleMs: number,
    private readonly _onClosed: () => void,
  ) {
    this._api = api;
  }

  public acquire(api: HomeAssistantApi): MediaSessionLease {
    const transportChanged = this._api.identity !== api.identity;
    this._api = api;
    this.lastUsed = performance.now();
    this._leaseCount += 1;
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = undefined;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = undefined;
    }

    if (transportChanged) {
      this._reconnectAttempts = 0;
      this._closeConnection();
      this._setSnapshot({ state: "new" });
    } else if (this._snapshot.state === "parked") {
      this._setSnapshot({ ...this._snapshot, state: "live" });
    }
    if (this._snapshot.state === "new" || this._snapshot.state === "failed") {
      void this._connect();
    }

    let released = false;
    const release = (discard: boolean): void => {
      if (released) {
        return;
      }
      released = true;
      this._release(discard);
    };
    return {
      key: this.key,
      discard: () => release(true),
      getSnapshot: () => this._snapshot,
      release: () => release(false),
      retry: () => {
        if (!released) {
          this._retry();
        }
      },
      subscribe: (listener) => {
        if (released) {
          return () => undefined;
        }
        this._listeners.add(listener);
        listener(this._snapshot);
        return () => this._listeners.delete(listener);
      },
    };
  }

  public close(): void {
    if (this._snapshot.state === "closed") {
      return;
    }
    this._setSnapshot({ state: "closing" });
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = undefined;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = undefined;
    }
    this._closeConnection();
    this._setSnapshot({ state: "closed" });
    this._listeners.clear();
    this._onClosed();
  }

  public isRetained(): boolean {
    return this._leaseCount === 0;
  }

  private async _connect(): Promise<void> {
    const generation = ++this._generation;
    this._connectAbort?.abort();
    const abort = new AbortController();
    this._connectAbort = abort;
    this._setSnapshot({ state: "connecting" });
    const timing = beginLiveStartupTiming(this.key);

    try {
      const connection = await this._factory(
        this._api,
        this.entityId,
        abort.signal,
        (error) => this._handleFailure(generation, error),
        timing,
      );
      if (generation !== this._generation || abort.signal.aborted) {
        connection.close();
        return;
      }
      this._connection = connection;
      if (this._reconnectAttempts > 0) {
        this._stabilityTimer = setTimeout(() => {
          this._stabilityTimer = undefined;
          this._reconnectAttempts = 0;
        }, RECONNECT_STABLE_RESET_MS);
      }
      this._setSnapshot({
        state: this._leaseCount > 0 ? "live" : "parked",
        stream: connection.stream,
        timing: connection.timing,
        transport: connection.transport,
        video: connection.video,
      });
    } catch (error) {
      if (generation !== this._generation || abort.signal.aborted) {
        return;
      }
      this._setSnapshot({
        state: "failed",
        error: error instanceof Error ? error.message : "Unable to connect",
      });
      if (this._reconnectAttempts > 0) {
        this._scheduleReconnect();
      }
    }
  }

  private _handleFailure(generation: number, error: Error): void {
    if (generation !== this._generation || this._snapshot.state === "closed") {
      return;
    }
    this._closeConnection();
    this._setSnapshot({ state: "failed", error: error.message });
    this._scheduleReconnect();
  }

  private _retry(): void {
    if (this._snapshot.state === "connecting") {
      return;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = undefined;
    }
    this._reconnectAttempts = 0;
    this._closeConnection();
    void this._connect();
  }

  private _scheduleReconnect(): void {
    if (
      this._leaseCount === 0 ||
      this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS ||
      this._reconnectTimer
    ) {
      return;
    }
    const attempt = this._reconnectAttempts++;
    const delay =
      RECONNECT_BASE_DELAY_MS * 2 ** attempt +
      Math.floor(Math.random() * RECONNECT_JITTER_MS);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = undefined;
      if (this._leaseCount > 0 && this._snapshot.state === "failed") {
        void this._connect();
      }
    }, delay);
  }

  private _release(discard: boolean): void {
    this._leaseCount = Math.max(0, this._leaseCount - 1);
    this.lastUsed = performance.now();
    if (this._leaseCount > 0) {
      // Element-backed transports can have only one DOM attachment. Republish
      // the retained snapshot so another active lease can reclaim it after a
      // preview/editor owner releases without creating a new connection.
      this._setSnapshot(this._snapshot);
      return;
    }
    if (discard) {
      this.close();
      return;
    }
    if (this._snapshot.state === "live") {
      this._setSnapshot({ ...this._snapshot, state: "parked" });
    }
    this._idleTimer = setTimeout(() => this.close(), this._retainIdleMs);
  }

  private _closeConnection(): void {
    this._generation += 1;
    if (this._stabilityTimer) {
      clearTimeout(this._stabilityTimer);
      this._stabilityTimer = undefined;
    }
    this._connectAbort?.abort();
    this._connectAbort = undefined;
    this._connection?.close();
    this._connection = undefined;
  }

  private _setSnapshot(snapshot: MediaSessionSnapshot): void {
    this._snapshot = snapshot;
    for (const listener of this._listeners) {
      listener(snapshot);
    }
  }
}

export class MediaSessionManager {
  private readonly _cameraMuted = new Map<string, boolean>();
  private readonly _sessions = new Map<string, ManagedMediaSession>();

  public constructor(
    private readonly _factory: ConnectionFactory = defaultConnectionFactory,
    private readonly _hlsFactory: ConnectionFactory = defaultHlsConnectionFactory,
  ) {}

  public acquireHomeAssistant(
    api: HomeAssistantApi,
    entityId: string,
  ): MediaSessionLease {
    return this._acquire(
      `home_assistant:${entityId}`,
      entityId,
      api,
      this._factory,
      RETAIN_IDLE_MS,
    );
  }

  public acquireHomeAssistantHls(
    api: HomeAssistantApi,
    entityId: string,
  ): MediaSessionLease {
    return this._acquire(
      `home_assistant_hls:${entityId}`,
      entityId,
      api,
      this._hlsFactory,
      HLS_RETAIN_IDLE_MS,
    );
  }

  public getCameraMuted(entityId: string): boolean {
    return this._cameraMuted.get(entityId) ?? true;
  }

  public setCameraMuted(entityId: string, muted: boolean): void {
    this._cameraMuted.set(entityId, muted);
  }

  private _acquire(
    key: string,
    entityId: string,
    api: HomeAssistantApi,
    factory: ConnectionFactory,
    retainIdleMs: number,
  ): MediaSessionLease {
    let session = this._sessions.get(key);
    if (!session) {
      this._evictIfNeeded();
      session = new ManagedMediaSession(
        key,
        entityId,
        api,
        factory,
        retainIdleMs,
        () => this._sessions.delete(key),
      );
      this._sessions.set(key, session);
    }
    return session.acquire(api);
  }

  public closeAll(): void {
    for (const session of [...this._sessions.values()]) {
      session.close();
    }
  }

  private _evictIfNeeded(): void {
    if (this._sessions.size < MAX_RETAINED_SESSIONS) {
      return;
    }
    const retained = [...this._sessions.values()]
      .filter((session) => session.isRetained())
      .sort((left, right) => left.lastUsed - right.lastUsed);
    retained[0]?.close();
  }
}

declare global {
  interface Window {
    __watchZoneMediaSessionManager?: MediaSessionManager;
  }
}

export function getMediaSessionManager(): MediaSessionManager {
  return (window.__watchZoneMediaSessionManager ??= new MediaSessionManager());
}
