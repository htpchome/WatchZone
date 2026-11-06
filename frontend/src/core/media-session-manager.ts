import type {
  HomeAssistantApi,
  HomeAssistantConnection,
  HomeAssistantConnectionEventListener,
} from "./home-assistant";
import {
  MAX_RETAINED_CAMERA_SESSIONS,
  MEDIA_SESSION_RUNTIME_KEY,
} from "./constants";
import {
  beginLiveStartupTiming,
  type LiveStartupTiming,
} from "./live-startup-timing";
import {
  mediaConnectionErrorCode,
  type MediaConnectionErrorCode,
} from "./media-connection-error";
import type { DeviceClass } from "./device-profile";
import {
  type MediaRetentionCamera,
  type MediaRetentionEnvironment,
  type MediaRetentionPreference,
  MediaRetentionPolicy,
} from "./media-retention-policy";

export type MediaSessionState =
  "new" | "connecting" | "live" | "parked" | "failed" | "closing" | "closed";

export type MediaTransport = "hls_mse" | "hls_native" | "webrtc";
export type CameraMutePreference = "muted" | "unmuted";

export interface MediaSessionSnapshot {
  readonly error?: string;
  readonly errorCode?: MediaConnectionErrorCode;
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

export interface MediaReconnectPolicy {
  readonly baseDelayMs: number;
  readonly maxAttempts: number;
}

export interface MediaSessionRequest {
  readonly api: HomeAssistantApi;
  readonly cameraKey: string;
  readonly entityId: string;
  readonly factory: ConnectionFactory;
  readonly key: string;
  readonly mediaReconnectPolicy?: MediaReconnectPolicy;
  readonly options?: MediaConnectionOptions;
  readonly retryInitialFailure?: boolean;
  readonly retention: MediaRetentionClass;
}

type ReconnectCause = "home_assistant" | "media";

const DEFAULT_MEDIA_RECONNECT_POLICY: MediaReconnectPolicy = {
  baseDelayMs: 500,
  maxAttempts: 2,
};
const HOME_ASSISTANT_RECONNECT_POLICY: MediaReconnectPolicy = {
  baseDelayMs: 500,
  maxAttempts: 5,
};
const RECONNECT_JITTER_MS = 250;
const RECONNECT_STABLE_RESET_MS = 30_000;

function setEquals<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

class ManagedMediaSession {
  private _api: HomeAssistantApi;
  private _connection?: MediaConnection;
  private _connectAbort?: AbortController;
  private _generation = 0;
  private _leaseCount = 0;
  private _connectionOptions: MediaConnectionOptions = { initialMuted: true };
  private _reconnectCause?: ReconnectCause;
  private _reconnectAttempts = 0;
  private _reconnectTimer?: ReturnType<typeof setTimeout>;
  private _stabilityTimer?: ReturnType<typeof setTimeout>;
  private _transportInterrupted = false;
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
    public readonly cameraKey: string,
    public readonly entityId: string,
    api: HomeAssistantApi,
    private readonly _factory: ConnectionFactory,
    public readonly retention: MediaRetentionClass,
    private readonly _retryInitialFailure: boolean,
    private readonly _mediaReconnectPolicy: MediaReconnectPolicy,
    private readonly _onClosed: () => void,
    private readonly _onRetained: () => void,
    private readonly _enqueueReconnect: (session: ManagedMediaSession) => void,
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
      this._reconnectCause = undefined;
      this._reconnectAttempts = 0;
      this._closeConnection();
      this._setSnapshot({ state: "new" });
    } else if (this._snapshot.state === "parked") {
      this._setSnapshot({ ...this._snapshot, state: "live" });
    }
    if (api.identity.connected === false) {
      this._transportInterrupted = true;
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

  public async reconnectIfFailed(): Promise<void> {
    if (this._leaseCount === 0 || this._snapshot.state !== "failed") return;
    await this._connect();
  }

  public handleTransportDisconnected(): void {
    if (this._snapshot.state === "closed") return;
    this._transportInterrupted = true;
    this._reconnectCause = undefined;
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

  public async handleTransportReady(): Promise<void> {
    if (this._snapshot.state === "closed" || !this._transportInterrupted)
      return;
    this._transportInterrupted = false;
    this._reconnectCause = "home_assistant";
    this._reconnectAttempts = 0;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = undefined;
    }
    if (this._leaseCount === 0) return;
    this._closeConnection();
    await this._connect();
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
        (error) => this._handleFailure(generation, error, timing),
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
          this._reconnectCause = undefined;
          this._reconnectAttempts = 0;
        }, RECONNECT_STABLE_RESET_MS);
      } else {
        this._reconnectCause = undefined;
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
      const errorCode = mediaConnectionErrorCode(error);
      timing.setFailure(errorCode);
      this._setSnapshot({
        state: "failed",
        error: error instanceof Error ? error.message : "Unable to connect",
        errorCode,
        timing,
      });
      if (this._reconnectCause) {
        this._scheduleReconnect();
      } else if (this._retryInitialFailure) {
        this._reconnectCause = "media";
        this._scheduleReconnect();
      }
    }
  }

  private _handleFailure(
    generation: number,
    error: Error,
    timing: LiveStartupTiming,
  ): void {
    if (generation !== this._generation || this._snapshot.state === "closed") {
      return;
    }
    const errorCode = mediaConnectionErrorCode(error);
    timing.setFailure(errorCode);
    this._closeConnection();
    this._setSnapshot({
      state: "failed",
      error: error.message,
      errorCode,
      timing,
    });
    this._reconnectCause ??= "media";
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
    this._reconnectCause = undefined;
    this._reconnectAttempts = 0;
    this._closeConnection();
    void this._connect();
  }

  private _scheduleReconnect(): void {
    const policy =
      this._reconnectCause === "media"
        ? this._mediaReconnectPolicy
        : this._reconnectCause === "home_assistant"
          ? HOME_ASSISTANT_RECONNECT_POLICY
          : undefined;
    if (
      !policy ||
      this._leaseCount === 0 ||
      this._reconnectAttempts >= policy.maxAttempts ||
      this._reconnectTimer
    ) {
      return;
    }
    const attempt = this._reconnectAttempts++;
    const delay =
      policy.baseDelayMs * 2 ** attempt +
      Math.floor(Math.random() * RECONNECT_JITTER_MS);
    this._snapshot.timing?.setReconnect(attempt + 1, delay);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = undefined;
      if (this._leaseCount > 0 && this._snapshot.state === "failed") {
        this._enqueueReconnect(this);
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
    this._onRetained();
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
  private readonly _cameraActivity = new Map<
    object,
    { readonly cameraKey: string; readonly deviceClass: DeviceClass }
  >();
  private readonly _cameraRetentionContexts = new Map<
    object,
    {
      readonly cameraKeys: ReadonlySet<string>;
      readonly deviceClass: DeviceClass;
      readonly preference: MediaRetentionPreference;
    }
  >();
  private readonly _cameraRetentionMetadata = new Map<
    string,
    {
      readonly deviceClass: DeviceClass;
      readonly preference: MediaRetentionPreference;
    }
  >();
  private readonly _connectionObservers = new Map<
    HomeAssistantConnection,
    {
      readonly disconnected: HomeAssistantConnectionEventListener;
      readonly ready: HomeAssistantConnectionEventListener;
    }
  >();
  private _recoveryGeneration = 0;
  private readonly _reconnectQueue = new Set<ManagedMediaSession>();
  private _reconnectBatchTimer?: ReturnType<typeof setTimeout>;
  private _reconnectDrain?: Promise<void>;
  private readonly _retentionPolicy: MediaRetentionPolicy;

  public constructor(retentionEnvironment: MediaRetentionEnvironment = {}) {
    this._retentionPolicy = new MediaRetentionPolicy(
      () => this._applyRetentionPolicy(),
      retentionEnvironment,
    );
  }

  public acquire(request: MediaSessionRequest): MediaSessionLease {
    return this._acquire(
      request.key,
      request.cameraKey,
      request.entityId,
      request.api,
      request.factory,
      request.retention,
      request.retryInitialFailure ?? false,
      request.mediaReconnectPolicy ?? DEFAULT_MEDIA_RECONNECT_POLICY,
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

  public setCameraActivity(
    owner: object,
    cameraKey: string | undefined,
    deviceClass: DeviceClass,
  ): void {
    const current = this._cameraActivity.get(owner);
    if (
      current?.cameraKey === cameraKey &&
      current?.deviceClass === deviceClass
    )
      return;
    if (cameraKey) {
      this._cameraActivity.set(owner, { cameraKey, deviceClass });
    } else {
      this._cameraActivity.delete(owner);
    }
    this._applyRetentionPolicy();
    this._pruneCameraRetentionMetadata();
  }

  public setCameraRetentionPreference(
    owner: object,
    cameraKeys: readonly string[],
    deviceClass: DeviceClass,
    preference: MediaRetentionPreference,
  ): void {
    const previous = this._cameraRetentionContexts.get(owner);
    const nextKeys = new Set(cameraKeys);
    if (
      previous?.deviceClass === deviceClass &&
      previous.preference === preference &&
      setEquals(previous.cameraKeys, nextKeys)
    ) {
      return;
    }
    this._cameraRetentionContexts.set(owner, {
      cameraKeys: nextKeys,
      deviceClass,
      preference,
    });
    const affected = new Set(previous?.cameraKeys ?? []);
    for (const cameraKey of nextKeys) affected.add(cameraKey);
    this._refreshCameraRetentionMetadata(affected);
    this._applyRetentionPolicy();
    this._pruneCameraRetentionMetadata();
  }

  public clearCameraActivity(owner: object): void {
    const activityRemoved = this._cameraActivity.delete(owner);
    const context = this._cameraRetentionContexts.get(owner);
    const contextRemoved = this._cameraRetentionContexts.delete(owner);
    if (!activityRemoved && !contextRemoved) return;
    if (context) this._refreshCameraRetentionMetadata(context.cameraKeys);
    this._applyRetentionPolicy();
    this._pruneCameraRetentionMetadata();
  }

  private _acquire(
    key: string,
    cameraKey: string,
    entityId: string,
    api: HomeAssistantApi,
    factory: ConnectionFactory,
    retention: MediaRetentionClass,
    retryInitialFailure: boolean,
    mediaReconnectPolicy: MediaReconnectPolicy,
    options: MediaConnectionOptions = { initialMuted: true },
  ): MediaSessionLease {
    this._observeConnection(api.identity);
    let session = this._sessions.get(key);
    if (!session) {
      this._evictIfNeeded();
      session = new ManagedMediaSession(
        key,
        cameraKey,
        entityId,
        api,
        factory,
        retention,
        retryInitialFailure,
        mediaReconnectPolicy,
        () => {
          const closedSession = this._sessions.get(key);
          if (closedSession) this._reconnectQueue.delete(closedSession);
          this._sessions.delete(key);
          this._pruneCameraRetentionMetadata();
          this._pruneConnectionObservers();
        },
        () => this._applyRetentionPolicy(),
        (reconnectSession) => this._enqueueReconnect(reconnectSession),
      );
      this._sessions.set(key, session);
    }
    const lease = session.acquire(api, options);
    this._pruneConnectionObservers();
    this._applyRetentionPolicy();
    return lease;
  }

  public closeAll(): void {
    this._reconnectQueue.clear();
    if (this._reconnectBatchTimer) {
      clearTimeout(this._reconnectBatchTimer);
      this._reconnectBatchTimer = undefined;
    }
    for (const session of [...this._sessions.values()]) {
      session.close();
    }
    this._cameraActivity.clear();
    this._cameraRetentionContexts.clear();
    this._cameraRetentionMetadata.clear();
    this._retentionPolicy.dispose();
    this._clearConnectionObservers();
  }

  private _applyRetentionPolicy(): void {
    const activeCameraKeys = new Set(
      [...this._cameraActivity.values()].map(({ cameraKey }) => cameraKey),
    );
    const cameras = new Map<string, MediaRetentionCamera>();
    for (const session of this._sessions.values()) {
      const current = cameras.get(session.cameraKey);
      cameras.set(session.cameraKey, {
        active:
          current?.active === true ||
          activeCameraKeys.has(session.cameraKey) ||
          !session.isRetained(),
        deviceClass:
          this._cameraRetentionMetadata.get(session.cameraKey)?.deviceClass ??
          "desktop",
        key: session.cameraKey,
        lastUsed: Math.max(current?.lastUsed ?? 0, session.lastUsed),
        preference:
          this._cameraRetentionMetadata.get(session.cameraKey)?.preference ??
          "automatic",
      });
    }
    for (const cameraKey of this._retentionPolicy.evaluate([
      ...cameras.values(),
    ])) {
      for (const session of [...this._sessions.values()]) {
        if (session.cameraKey === cameraKey && session.isRetained()) {
          session.close();
        }
      }
    }
  }

  private _refreshCameraRetentionMetadata(cameraKeys: Iterable<string>): void {
    for (const cameraKey of cameraKeys) {
      const contexts = [...this._cameraRetentionContexts.values()].filter(
        ({ cameraKeys: configured }) => configured.has(cameraKey),
      );
      if (contexts.length === 0) continue;
      const reduced = contexts.find(
        ({ preference }) => preference === "reduced_bandwidth",
      );
      const selected = reduced ?? contexts.at(-1);
      if (!selected) continue;
      this._cameraRetentionMetadata.set(cameraKey, {
        deviceClass: selected.deviceClass,
        preference: selected.preference,
      });
    }
  }

  private _pruneCameraRetentionMetadata(): void {
    const referenced = new Set(
      [...this._cameraActivity.values()].map(({ cameraKey }) => cameraKey),
    );
    for (const context of this._cameraRetentionContexts.values()) {
      for (const cameraKey of context.cameraKeys) referenced.add(cameraKey);
    }
    for (const session of this._sessions.values()) {
      referenced.add(session.cameraKey);
    }
    for (const cameraKey of this._cameraRetentionMetadata.keys()) {
      if (!referenced.has(cameraKey))
        this._cameraRetentionMetadata.delete(cameraKey);
    }
  }

  private _enqueueReconnect(session: ManagedMediaSession): void {
    if (!this._sessions.has(session.key)) return;
    this._reconnectQueue.add(session);
    if (this._reconnectDrain || this._reconnectBatchTimer) return;
    this._reconnectBatchTimer = setTimeout(() => {
      this._reconnectBatchTimer = undefined;
      this._reconnectDrain = this._drainReconnectQueue().finally(() => {
        this._reconnectDrain = undefined;
        const next = this._reconnectQueue.values().next().value;
        if (next) this._enqueueReconnect(next);
      });
    }, 0);
  }

  private async _drainReconnectQueue(): Promise<void> {
    while (this._reconnectQueue.size > 0) {
      const session = [...this._sessions.values()].find((candidate) =>
        this._reconnectQueue.has(candidate),
      );
      if (!session) {
        this._reconnectQueue.clear();
        return;
      }
      this._reconnectQueue.delete(session);
      await session.reconnectIfFailed();
    }
  }

  private _observeConnection(connection: HomeAssistantConnection): void {
    if (
      this._connectionObservers.has(connection) ||
      !connection.addEventListener ||
      !connection.removeEventListener
    )
      return;
    const disconnected: HomeAssistantConnectionEventListener = () => {
      this._recoveryGeneration += 1;
      for (const session of this._sessions.values()) {
        if (session.connectionIdentity === connection) {
          session.handleTransportDisconnected();
        }
      }
    };
    const ready: HomeAssistantConnectionEventListener = () => {
      void this._restoreConnectionSessions(connection);
    };
    connection.addEventListener("disconnected", disconnected);
    connection.addEventListener("ready", ready);
    this._connectionObservers.set(connection, { disconnected, ready });
  }

  private async _restoreConnectionSessions(
    connection: HomeAssistantConnection,
  ): Promise<void> {
    const generation = ++this._recoveryGeneration;
    const sessions = [...this._sessions.values()].filter(
      (session) => session.connectionIdentity === connection,
    );
    for (const session of sessions) {
      if (generation !== this._recoveryGeneration) return;
      await session.handleTransportReady();
    }
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
    if (this._sessions.size < MAX_RETAINED_CAMERA_SESSIONS) {
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
