import type {
  HomeAssistantApi,
  HomeAssistantConnection,
  HomeAssistantConnectionEventListener,
} from "./home-assistant";
import { MEDIA_SESSION_RUNTIME_KEY } from "./constants";
import {
  beginLiveStartupTiming,
  type LiveStartupTiming,
} from "./live-startup-timing";

export type MediaSessionState =
  "new" | "connecting" | "live" | "parked" | "failed" | "closing" | "closed";

export type MediaTransport = "hls_mse" | "hls_native" | "webrtc";
export type CameraMutePreference = "muted" | "unmuted";

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

export interface MediaConnectionOptions {
  readonly initialMuted: boolean;
  readonly lowLatencyHls?: boolean;
  readonly onVideo?: (video: HTMLVideoElement) => void;
}

export type ConnectionFactory = (
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
  options: MediaConnectionOptions,
) => Promise<MediaConnection>;

export interface MediaSessionLease {
  readonly key: string;
  discard(): void;
  getSnapshot(): MediaSessionSnapshot;
  release(): void;
  retry(): void;
  subscribe(listener: (snapshot: MediaSessionSnapshot) => void): () => void;
}

export type MediaRetentionClass = "fallback" | "preferred";

export interface MediaSessionRequest {
  readonly api: HomeAssistantApi;
  readonly entityId: string;
  readonly factory: ConnectionFactory;
  readonly key: string;
  readonly options?: MediaConnectionOptions;
  readonly retention: MediaRetentionClass;
}

const MAX_RETAINED_SESSIONS = 4;
const MAX_RECONNECT_ATTEMPTS = 2;
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_JITTER_MS = 250;
const RECONNECT_STABLE_RESET_MS = 30_000;

class ManagedMediaSession {
  private _api: HomeAssistantApi;
  private _connection?: MediaConnection;
  private _connectAbort?: AbortController;
  private _generation = 0;
  private _leaseCount = 0;
  private _connectionOptions: MediaConnectionOptions = { initialMuted: true };
  private _reconnectAttempts = 0;
  private _reconnectTimer?: ReturnType<typeof setTimeout>;
  private _stabilityTimer?: ReturnType<typeof setTimeout>;
  private readonly _listeners = new Set<
    (snapshot: MediaSessionSnapshot) => void
  >();
  private _snapshot: MediaSessionSnapshot = { state: "new" };

  public lastUsed = performance.now();

  public get connectionIdentity(): HomeAssistantConnection {
    return this._api.identity;
  }

  public constructor(
    public readonly key: string,
    public readonly entityId: string,
    api: HomeAssistantApi,
    private readonly _factory: ConnectionFactory,
    public readonly retention: MediaRetentionClass,
    private readonly _onClosed: () => void,
  ) {
    this._api = api;
  }

  public acquire(
    api: HomeAssistantApi,
    options: MediaConnectionOptions = { initialMuted: true },
  ): MediaSessionLease {
    const transportChanged = this._api.identity !== api.identity;
    this._api = api;
    this._connectionOptions = {
      initialMuted: options.initialMuted,
      lowLatencyHls: options.lowLatencyHls,
    };
    this.lastUsed = performance.now();
    this._leaseCount += 1;
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
    if (api.identity.connected === false) {
      this._closeConnection();
      this._setSnapshot({
        state: "failed",
        error: "Home Assistant is reconnecting",
      });
    } else if (
      this._snapshot.state === "new" ||
      this._snapshot.state === "failed"
    ) {
      void this._connect(options);
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

  public handleTransportDisconnected(): void {
    if (this._snapshot.state === "closed") return;
    this._reconnectAttempts = 0;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = undefined;
    }
    this._closeConnection();
    this._setSnapshot({
      state: "failed",
      error: "Home Assistant connection interrupted",
    });
  }

  public handleTransportReady(): void {
    if (
      this._leaseCount === 0 ||
      this._snapshot.state === "closed" ||
      this._snapshot.state === "live" ||
      this._snapshot.state === "parked"
    )
      return;
    this._reconnectAttempts = 0;
    this._closeConnection();
    void this._connect();
  }

  private async _connect(
    connectionOptions = this._connectionOptions,
  ): Promise<void> {
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
        {
          ...connectionOptions,
          onVideo: (video) => {
            if (generation !== this._generation || abort.signal.aborted) return;
            this._setSnapshot({ ...this._snapshot, video });
            connectionOptions.onVideo?.(video);
          },
        },
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
  private readonly _cameraMutePreferences = new Map<
    string,
    CameraMutePreference
  >();
  private readonly _sessions = new Map<string, ManagedMediaSession>();
  private readonly _connectionObservers = new Map<
    HomeAssistantConnection,
    {
      readonly disconnected: HomeAssistantConnectionEventListener;
      readonly ready: HomeAssistantConnectionEventListener;
    }
  >();

  public acquire(request: MediaSessionRequest): MediaSessionLease {
    return this._acquire(
      request.key,
      request.entityId,
      request.api,
      request.factory,
      request.retention,
      request.options,
    );
  }

  public getCameraMutePreference(
    entityId: string,
  ): CameraMutePreference | undefined {
    return this._cameraMutePreferences.get(entityId);
  }

  public getCameraMuted(
    entityId: string,
    configuredDefaultMuted = true,
  ): boolean {
    const preference = this.getCameraMutePreference(entityId);
    return preference ? preference === "muted" : configuredDefaultMuted;
  }

  public setCameraMuted(entityId: string, muted: boolean): void {
    this._cameraMutePreferences.set(entityId, muted ? "muted" : "unmuted");
  }

  private _acquire(
    key: string,
    entityId: string,
    api: HomeAssistantApi,
    factory: ConnectionFactory,
    retention: MediaRetentionClass,
    options: MediaConnectionOptions = { initialMuted: true },
  ): MediaSessionLease {
    this._observeConnection(api.identity);
    let session = this._sessions.get(key);
    if (!session) {
      this._evictIfNeeded();
      session = new ManagedMediaSession(
        key,
        entityId,
        api,
        factory,
        retention,
        () => {
          this._sessions.delete(key);
          this._pruneConnectionObservers();
        },
      );
      this._sessions.set(key, session);
    }
    const lease = session.acquire(api, options);
    this._pruneConnectionObservers();
    return lease;
  }

  public closeAll(): void {
    for (const session of [...this._sessions.values()]) {
      session.close();
    }
    this._clearConnectionObservers();
  }

  private _observeConnection(connection: HomeAssistantConnection): void {
    if (
      this._connectionObservers.has(connection) ||
      !connection.addEventListener ||
      !connection.removeEventListener
    )
      return;
    const disconnected: HomeAssistantConnectionEventListener = () => {
      for (const session of this._sessions.values()) {
        if (session.connectionIdentity === connection) {
          session.handleTransportDisconnected();
        }
      }
    };
    const ready: HomeAssistantConnectionEventListener = () => {
      for (const session of this._sessions.values()) {
        if (session.connectionIdentity === connection) {
          session.handleTransportReady();
        }
      }
    };
    connection.addEventListener("disconnected", disconnected);
    connection.addEventListener("ready", ready);
    this._connectionObservers.set(connection, { disconnected, ready });
  }

  private _pruneConnectionObservers(): void {
    const activeConnections = new Set(
      [...this._sessions.values()].map((session) => session.connectionIdentity),
    );
    for (const [connection, listeners] of this._connectionObservers) {
      if (activeConnections.has(connection)) continue;
      connection.removeEventListener?.("disconnected", listeners.disconnected);
      connection.removeEventListener?.("ready", listeners.ready);
      this._connectionObservers.delete(connection);
    }
  }

  private _clearConnectionObservers(): void {
    for (const [connection, listeners] of this._connectionObservers) {
      connection.removeEventListener?.("disconnected", listeners.disconnected);
      connection.removeEventListener?.("ready", listeners.ready);
    }
    this._connectionObservers.clear();
  }

  private _evictIfNeeded(): void {
    if (this._sessions.size < MAX_RETAINED_SESSIONS) {
      return;
    }
    const retained = [...this._sessions.values()]
      .filter((session) => session.isRetained())
      .sort((left, right) => {
        if (left.retention !== right.retention) {
          return left.retention === "fallback" ? -1 : 1;
        }
        return left.lastUsed - right.lastUsed;
      });
    retained[0]?.close();
  }
}

export function getMediaSessionManager(): MediaSessionManager {
  const runtime = window as unknown as Record<string, unknown>;
  return (runtime[MEDIA_SESSION_RUNTIME_KEY] ??=
    new MediaSessionManager()) as MediaSessionManager;
}
