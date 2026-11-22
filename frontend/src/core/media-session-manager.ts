import type {
  HomeAssistantApi,
  HomeAssistantConnection,
  HomeAssistantConnectionEventListener,
} from "./home-assistant";
import { CLIENT_PROFILE } from "./client-profile";
import {
  MAX_RETAINED_CAMERA_SESSIONS,
  MEDIA_SESSION_RUNTIME_KEY,
} from "./constants";
import {
  beginLiveStartupTiming,
  type LiveStartupTiming,
} from "./live-startup-timing";
import {
  MediaConnectionError,
  mediaConnectionErrorCode,
  type MediaConnectionErrorCode,
} from "./media-connection-error";
import {
  type MediaRetentionCamera,
  type MediaRetentionEnvironment,
  type MediaRetentionPreference,
  MediaRetentionPolicy,
} from "./media-retention-policy";

export type MediaSessionState =
  "new" | "connecting" | "live" | "parked" | "failed" | "closing" | "closed";

export type MediaTransport = "hls_mse" | "hls_native" | "mse" | "webrtc";
export type CameraMutePreference = "muted" | "unmuted";

export interface MediaSessionSnapshot {
  readonly error?: string;
  readonly errorCode?: MediaConnectionErrorCode;
  readonly state: MediaSessionState;
  readonly stream?: MediaStream;
  readonly timing?: LiveStartupTiming;
  readonly transport?: MediaTransport;
  readonly usable?: boolean;
  readonly video?: HTMLVideoElement;
}

export interface MediaConnection {
  readonly stream?: MediaStream;
  readonly timing?: LiveStartupTiming;
  readonly transport?: MediaTransport;
  readonly video?: HTMLVideoElement;
  close(): void;
  /** Suspend decoder/buffer work while retaining the transport identity. */
  park?(): void;
  /** Resume a previously parked transport without reconnecting it. */
  resume?(): Promise<void> | void;
}

export interface MediaConnectionOptions {
  readonly initialMuted: boolean;
  readonly lowLatencyHls?: boolean;
  readonly nativeHlsOnly?: boolean;
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
  markUsable(): void;
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
  private _abort?: AbortController;
  private _generation = 0;
  private _leaseCount = 0;
  private _options: MediaConnectionOptions = { initialMuted: true };
  private _documentHidden = false;
  private _expiredWhileHidden = false;
  private _hiddenUntil = 0;
  private _hiddenTeardownTimer?: ReturnType<typeof setTimeout>;
  private _resumeOnVisible = false;
  private _retryCause?: ReconnectCause;
  private _retryCount = 0;
  private _retryTimer?: ReturnType<typeof setTimeout>;
  private _stableTimer?: ReturnType<typeof setTimeout>;
  private _haInterrupted = false;
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
    private readonly _mediaRetryPolicy: MediaReconnectPolicy,
    private readonly _onClosed: () => void,
    private readonly _onRetained: () => void,
    private readonly _queueRetry: (session: ManagedMediaSession) => void,
  ) {
    this._api = api;
  }

  public acquire(
    api: HomeAssistantApi,
    options: MediaConnectionOptions = { initialMuted: true },
  ): MediaSessionLease {
    const transportChanged = this._api.identity !== api.identity;
    this._api = api;
    this._options = {
      initialMuted: options.initialMuted,
      lowLatencyHls: options.lowLatencyHls,
      nativeHlsOnly: options.nativeHlsOnly,
    };
    this.lastUsed = performance.now();
    this._leaseCount += 1;

    if (transportChanged) {
      this._resetRetry();
      this._closeConnection();
      this._setSnapshot({ state: "new" });
    } else if (this._snapshot.state === "parked") {
      if (this._documentHidden) this._resumeOnVisible = true;
      else this._resumeConnection();
      this._setSnapshot({ ...this._snapshot, state: "live" });
    }
    if (
      api.identity.connected === false &&
      (!this._connection ||
        (this._snapshot.state !== "live" && this._snapshot.state !== "parked"))
    ) {
      this._haInterrupted = true;
      this._closeConnection();
      this._setSnapshot({
        state: "failed",
        error: "Home Assistant is reconnecting",
      });
    } else if (this._snapshot.state === "new") {
      void this._connect(options);
    } else if (
      this._snapshot.state === "failed" &&
      !this._retryTimer &&
      this._canRetry()
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
      markUsable: () => {
        if (!released) this._markUsable();
      },
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
    this._resetRetry();
    this._closeConnection();
    this._setSnapshot({ state: "closed" });
    this._listeners.clear();
    this._onClosed();
  }

  public isRetained(): boolean {
    return this._leaseCount === 0;
  }

  public isUsable(api: HomeAssistantApi): boolean {
    return (
      this._api.identity === api.identity &&
      this._connection !== undefined &&
      this._snapshot.usable === true &&
      this._snapshot.video !== undefined &&
      (this._snapshot.state === "live" || this._snapshot.state === "parked")
    );
  }

  public async retryFailed(): Promise<void> {
    if (
      !this._leaseCount ||
      !["connecting", "failed"].includes(this._snapshot.state)
    )
      return;
    await this._connect();
  }

  public wake(): void {
    if (
      !this._leaseCount ||
      !["connecting", "failed"].includes(this._snapshot.state)
    )
      return;
    this._resetRetry("media");
    this._closeConnection();
    this._queueRetry(this);
  }

  public handleTransportDisconnected(): void {
    if (this._snapshot.state === "closed") return;
    this._haInterrupted = true;
    this._resetRetry();
  }

  public async handleTransportReady(): Promise<void> {
    if (this._snapshot.state === "closed" || !this._haInterrupted) return;
    this._haInterrupted = false;
    if (
      this._connection &&
      (this._snapshot.state === "live" || this._snapshot.state === "parked")
    ) {
      return;
    }
    this._resetRetry("home_assistant");
    if (this._leaseCount === 0) return;
    this._closeConnection();
    await this._connect();
  }

  public handleDocumentHidden(closeConnection: boolean): void {
    if (this._snapshot.state === "closed" || this._documentHidden) return;
    this._documentHidden = true;
    this._hiddenUntil = Date.now() + 120_000;
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = undefined;
    }
    if (closeConnection) {
      if (this._connection || this._snapshot.state === "connecting") {
        this._resetRetry();
        this._closeConnection();
        this._setSnapshot({
          state: "failed",
          error: "Media suspended while the mobile client is backgrounded",
        });
      }
      return;
    }
    this._scheduleHiddenTeardown();
  }

  public handleDocumentVisible(): void {
    if (Date.now() >= this._hiddenUntil) {
      this._expireHiddenStream();
    }
    this._hiddenUntil = 0;
    this._clearHiddenTeardown();
    this._documentHidden = false;
    if (this._expiredWhileHidden) {
      this._expiredWhileHidden = false;
      this.close();
      return;
    }
    if (this._snapshot.state === "closed" || this._leaseCount === 0) return;
    if (this._resumeOnVisible && this._connection) {
      this._resumeOnVisible = false;
      this._resumeConnection();
    }
    if (this._haInterrupted) {
      if (this._api.identity.connected === false) return;
      this._haInterrupted = false;
      if (
        this._connection &&
        (this._snapshot.state === "live" || this._snapshot.state === "parked")
      ) {
        return;
      }
      this._resetRetry("home_assistant");
    }
    if (this._snapshot.state === "connecting") {
      this._closeConnection();
      this._setSnapshot({
        state: "failed",
        error: "Media connection resumed in the foreground",
      });
      this._retryCause ??= "media";
    }
    if (this._snapshot.state !== "failed") return;
    if (this._retryTimer || !this._canRetry()) return;
    this._retryCause ??= "media";
    this._queueRetry(this);
  }

  private async _connect(connectionOptions = this._options): Promise<void> {
    const generation = ++this._generation;
    this._abort?.abort();
    const abort = new AbortController();
    this._abort = abort;
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
      if (this._leaseCount === 0) connection.park?.();
      if (this._retryCount > 0) {
        this._stableTimer = setTimeout(() => {
          this._stableTimer = undefined;
          this._resetRetry();
        }, RECONNECT_STABLE_RESET_MS);
      } else {
        this._resetRetry();
      }
      this._setSnapshot({
        state: this._leaseCount > 0 ? "live" : "parked",
        stream: connection.stream,
        timing: connection.timing,
        transport: connection.transport,
        video: connection.video,
      });
      this._scheduleHiddenTeardown();
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
      if (this._haInterrupted) {
        this._retryCause = "home_assistant";
        return;
      }
      if (this._retryCause && !this._documentHidden) {
        this._scheduleRetry();
      } else if (this._retryInitialFailure && !this._documentHidden) {
        this._retryCause = "media";
        this._scheduleRetry();
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
    if (this._haInterrupted) {
      this._retryCause = "home_assistant";
      return;
    }
    this._retryCause ??= "media";
    if (!this._documentHidden) this._scheduleRetry();
  }

  private _retry(): void {
    if (this._snapshot.state === "connecting" || this._retryTimer) {
      return;
    }
    this._resetRetry();
    this._closeConnection();
    void this._connect();
  }

  private _canRetry(): boolean {
    if (!this._retryCause) return true;
    const policy =
      this._retryCause === "media"
        ? this._mediaRetryPolicy
        : HOME_ASSISTANT_RECONNECT_POLICY;
    return this._retryCount < policy.maxAttempts;
  }

  private _resetRetry(cause?: ReconnectCause): void {
    clearTimeout(this._retryTimer);
    this._retryTimer = undefined;
    this._retryCause = cause;
    this._retryCount = 0;
  }

  private _scheduleRetry(): void {
    if (this._documentHidden) return;
    const policy =
      this._retryCause === "media"
        ? this._mediaRetryPolicy
        : this._retryCause === "home_assistant"
          ? HOME_ASSISTANT_RECONNECT_POLICY
          : undefined;
    if (!policy || this._retryCount >= policy.maxAttempts || this._retryTimer) {
      return;
    }
    const attempt = this._retryCount++;
    const delay =
      policy.baseDelayMs * 2 ** attempt +
      Math.floor(Math.random() * RECONNECT_JITTER_MS);
    this._snapshot.timing?.setReconnect(attempt + 1, delay);
    this._retryTimer = setTimeout(() => {
      this._retryTimer = undefined;
      if (this._leaseCount > 0 && this._snapshot.state === "failed") {
        this._queueRetry(this);
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
      this._connection?.park?.();
      this._setSnapshot({ ...this._snapshot, state: "parked" });
    }
    this._onRetained();
  }

  private _markUsable(): void {
    if (
      this._snapshot.usable === true ||
      (this._snapshot.state !== "live" && this._snapshot.state !== "parked")
    )
      return;
    this._setSnapshot({ ...this._snapshot, usable: true });
  }

  private _resumeConnection(): void {
    const connection = this._connection;
    if (!connection?.resume) return;
    const generation = this._generation;
    let resumed: Promise<void> | void;
    try {
      resumed = connection.resume();
    } catch (error) {
      this._handleResumeFailure(generation, connection, error);
      return;
    }
    if (!resumed) return;
    void resumed.catch((error: unknown) =>
      this._handleResumeFailure(generation, connection, error),
    );
  }

  private _handleResumeFailure(
    generation: number,
    connection: MediaConnection,
    error: unknown,
  ): void {
    if (
      generation !== this._generation ||
      connection !== this._connection ||
      this._snapshot.state === "closed"
    )
      return;
    this._closeConnection();
    this._setSnapshot({
      state: "failed",
      error:
        error instanceof Error
          ? error.message
          : "Retained media did not resume",
      errorCode: "unknown",
      timing: this._snapshot.timing,
    });
    this._retryCause = "media";
    if (this._leaseCount > 0 && !this._documentHidden) {
      this._queueRetry(this);
    }
  }

  private _scheduleHiddenTeardown(): void {
    this._clearHiddenTeardown();
    if (
      !this._documentHidden ||
      this._leaseCount === 0 ||
      !this._connection ||
      this._snapshot.transport === "webrtc"
    )
      return;
    this._hiddenTeardownTimer = setTimeout(() => {
      this._expireHiddenStream();
    }, this._hiddenUntil - Date.now());
  }

  private _expireHiddenStream(): void {
    if (
      !this._documentHidden ||
      this._leaseCount === 0 ||
      !this._connection ||
      this._snapshot.transport === "webrtc"
    )
      return;
    this._expiredWhileHidden = true;
    this._resetRetry("media");
    this._closeConnection();
    this._setSnapshot({ state: "failed" });
  }

  private _clearHiddenTeardown(): void {
    clearTimeout(this._hiddenTeardownTimer);
    this._hiddenTeardownTimer = undefined;
  }

  private _closeConnection(): void {
    this._generation += 1;
    if (this._stableTimer) {
      clearTimeout(this._stableTimer);
      this._stableTimer = undefined;
    }
    this._abort?.abort();
    this._abort = undefined;
    this._clearHiddenTeardown();
    this._resumeOnVisible = false;
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
  private readonly _forcedMuteOwners = new Set<object>();
  private readonly _forcedMuteListeners = new Set<(active: boolean) => void>();
  private readonly _activity = new Map<object, string>();
  private readonly _retentionContexts = new Map<
    object,
    {
      readonly cameraKeys: ReadonlySet<string>;
      readonly preference: MediaRetentionPreference;
    }
  >();
  private readonly _retentionMetadata = new Map<
    string,
    {
      readonly preference: MediaRetentionPreference;
    }
  >();
  private readonly _haObservers = new Map<
    HomeAssistantConnection,
    {
      readonly disconnected: HomeAssistantConnectionEventListener;
      readonly ready: HomeAssistantConnectionEventListener;
    }
  >();
  private _restoreGen = 0;
  private readonly _retryQueue = new Set<ManagedMediaSession>();
  private _retryBatchTimer?: ReturnType<typeof setTimeout>;
  private _retryDrain?: Promise<void>;
  private readonly _closeWhenHidden: boolean;
  private _documentHidden = document.visibilityState !== "visible";
  private readonly _retentionPolicy: MediaRetentionPolicy;

  public constructor(retentionEnvironment: MediaRetentionEnvironment = {}) {
    this._closeWhenHidden =
      (retentionEnvironment.clientDeviceClass ?? CLIENT_PROFILE.deviceClass) ===
      "phone";
    this._retentionPolicy = new MediaRetentionPolicy(
      () => this._applyRetentionPolicy(),
      retentionEnvironment,
    );
    document.addEventListener("visibilitychange", this._handleVisibilityChange);
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

  public acquireUsable(
    key: string,
    api: HomeAssistantApi,
    options: MediaConnectionOptions = { initialMuted: true },
  ): MediaSessionLease | undefined {
    const session = this._sessions.get(key);
    if (!session?.isUsable(api)) return undefined;
    this._observeConnection(api.identity);
    const lease = session.acquire(api, options);
    if (this._documentHidden) {
      session.handleDocumentHidden(this._closeWhenHidden);
    }
    this._pruneConnectionObservers();
    this._applyRetentionPolicy();
    return lease;
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

  public acquireForcedMute(owner: object): void {
    const wasActive = this._forcedMuteOwners.size > 0;
    this._forcedMuteOwners.add(owner);
    if (!wasActive) this._publishForcedMute(true);
  }

  public releaseForcedMute(owner: object): void {
    if (!this._forcedMuteOwners.delete(owner)) return;
    if (this._forcedMuteOwners.size === 0) this._publishForcedMute(false);
  }

  public subscribeForcedMute(listener: (active: boolean) => void): () => void {
    this._forcedMuteListeners.add(listener);
    listener(this._forcedMuteOwners.size > 0);
    return () => this._forcedMuteListeners.delete(listener);
  }

  public setCameraActivity(owner: object, cameraKey: string | undefined): void {
    const current = this._activity.get(owner);
    if (current === cameraKey) return;
    if (cameraKey) {
      this._activity.set(owner, cameraKey);
    } else {
      this._activity.delete(owner);
    }
    this._applyRetentionPolicy();
    this._pruneCameraRetentionMetadata();
  }

  public setCameraRetentionPreference(
    owner: object,
    cameraKeys: readonly string[],
    preference: MediaRetentionPreference,
  ): void {
    const previous = this._retentionContexts.get(owner);
    const nextKeys = new Set(cameraKeys);
    if (
      previous?.preference === preference &&
      setEquals(previous.cameraKeys, nextKeys)
    ) {
      return;
    }
    this._retentionContexts.set(owner, {
      cameraKeys: nextKeys,
      preference,
    });
    const affected = new Set(previous?.cameraKeys ?? []);
    for (const cameraKey of nextKeys) affected.add(cameraKey);
    this._refreshCameraRetentionMetadata(affected);
    this._applyRetentionPolicy();
    this._pruneCameraRetentionMetadata();
  }

  public clearCameraActivity(owner: object): void {
    const activityRemoved = this._activity.delete(owner);
    const context = this._retentionContexts.get(owner);
    const contextRemoved = this._retentionContexts.delete(owner);
    if (!activityRemoved && !contextRemoved) return;
    if (context) this._refreshCameraRetentionMetadata(context.cameraKeys);
    this._applyRetentionPolicy();
    this._pruneCameraRetentionMetadata();
  }

  public wake(providerPrefix: string): void {
    for (const [key, session] of this._sessions) {
      if (key.startsWith(providerPrefix)) session.wake();
    }
  }

  private _acquire(
    key: string,
    cameraKey: string,
    entityId: string,
    api: HomeAssistantApi,
    factory: ConnectionFactory,
    retention: MediaRetentionClass,
    retryInitialFailure: boolean,
    mediaRetryPolicy: MediaReconnectPolicy,
    options: MediaConnectionOptions = { initialMuted: true },
  ): MediaSessionLease {
    let session = this._sessions.get(key);
    if (!session) {
      this._evictIfNeeded();
      if (this._sessions.size >= MAX_RETAINED_CAMERA_SESSIONS) {
        throw new MediaConnectionError(
          "capacity_exceeded",
          "The live-session capacity is currently in use",
        );
      }
      session = new ManagedMediaSession(
        key,
        cameraKey,
        entityId,
        api,
        factory,
        retention,
        retryInitialFailure,
        mediaRetryPolicy,
        () => {
          const closedSession = this._sessions.get(key);
          if (closedSession) this._retryQueue.delete(closedSession);
          this._sessions.delete(key);
          this._pruneCameraRetentionMetadata();
          this._pruneConnectionObservers();
        },
        () => this._applyRetentionPolicy(),
        (reconnectSession) => this._queueRetry(reconnectSession),
      );
      this._sessions.set(key, session);
    }
    this._observeConnection(api.identity);
    const lease = session.acquire(api, options);
    if (this._documentHidden) {
      session.handleDocumentHidden(this._closeWhenHidden);
    }
    this._pruneConnectionObservers();
    this._applyRetentionPolicy();
    return lease;
  }

  public closeAll(): void {
    this.invalidateAll();
    this._retentionPolicy.dispose();
    this._clearConnectionObservers();
    document.removeEventListener(
      "visibilitychange",
      this._handleVisibilityChange,
    );
  }

  /** Close integration-dependent work while keeping the manager reusable. */
  public invalidateAll(): void {
    this._retryQueue.clear();
    if (this._retryBatchTimer) {
      clearTimeout(this._retryBatchTimer);
      this._retryBatchTimer = undefined;
    }
    for (const session of [...this._sessions.values()]) {
      session.close();
    }
    this._activity.clear();
    this._retentionContexts.clear();
    this._retentionMetadata.clear();
    this._clearConnectionObservers();
  }

  private readonly _handleVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") {
      this._documentHidden = true;
      for (const session of this._sessions.values()) {
        session.handleDocumentHidden(this._closeWhenHidden);
      }
      return;
    }
    this._documentHidden = false;
    for (const session of this._sessions.values()) {
      session.handleDocumentVisible();
    }
  };

  private _publishForcedMute(active: boolean): void {
    for (const listener of this._forcedMuteListeners) listener(active);
  }

  private _applyRetentionPolicy(): void {
    const activeCameraKeys = new Set(this._activity.values());
    const cameras = new Map<string, MediaRetentionCamera>();
    for (const session of this._sessions.values()) {
      const current = cameras.get(session.cameraKey);
      cameras.set(session.cameraKey, {
        active:
          current?.active === true ||
          activeCameraKeys.has(session.cameraKey) ||
          !session.isRetained(),
        key: session.cameraKey,
        lastUsed: Math.max(current?.lastUsed ?? 0, session.lastUsed),
        preference:
          this._retentionMetadata.get(session.cameraKey)?.preference ??
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
      const contexts = [...this._retentionContexts.values()].filter(
        ({ cameraKeys: configured }) => configured.has(cameraKey),
      );
      if (contexts.length === 0) continue;
      const reduced = contexts.find(
        ({ preference }) => preference === "reduced_bandwidth",
      );
      const selected = reduced ?? contexts.at(-1);
      if (!selected) continue;
      this._retentionMetadata.set(cameraKey, {
        preference: selected.preference,
      });
    }
  }

  private _pruneCameraRetentionMetadata(): void {
    const referenced = new Set(this._activity.values());
    for (const context of this._retentionContexts.values()) {
      for (const cameraKey of context.cameraKeys) referenced.add(cameraKey);
    }
    for (const session of this._sessions.values()) {
      referenced.add(session.cameraKey);
    }
    for (const cameraKey of this._retentionMetadata.keys()) {
      if (!referenced.has(cameraKey)) this._retentionMetadata.delete(cameraKey);
    }
  }

  private _queueRetry(session: ManagedMediaSession): void {
    if (!this._sessions.has(session.key)) return;
    this._retryQueue.add(session);
    if (this._retryDrain || this._retryBatchTimer) return;
    this._retryBatchTimer = setTimeout(() => {
      this._retryBatchTimer = undefined;
      this._retryDrain = this._drainReconnectQueue().finally(() => {
        this._retryDrain = undefined;
        const next = this._retryQueue.values().next().value;
        if (next) this._queueRetry(next);
      });
    }, 0);
  }

  private async _drainReconnectQueue(): Promise<void> {
    while (this._retryQueue.size > 0) {
      const session = [...this._sessions.values()].find((candidate) =>
        this._retryQueue.has(candidate),
      );
      if (!session) {
        this._retryQueue.clear();
        return;
      }
      this._retryQueue.delete(session);
      await session.retryFailed();
    }
  }

  private _observeConnection(connection: HomeAssistantConnection): void {
    if (
      this._haObservers.has(connection) ||
      !connection.addEventListener ||
      !connection.removeEventListener
    )
      return;
    const disconnected: HomeAssistantConnectionEventListener = () => {
      this._restoreGen += 1;
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
    this._haObservers.set(connection, { disconnected, ready });
  }

  private async _restoreConnectionSessions(
    connection: HomeAssistantConnection,
  ): Promise<void> {
    const generation = ++this._restoreGen;
    const sessions = [...this._sessions.values()].filter(
      (session) => session.connectionIdentity === connection,
    );
    for (const session of sessions) {
      if (generation !== this._restoreGen) return;
      await session.handleTransportReady();
    }
  }

  private _pruneConnectionObservers(): void {
    const activeConnections = new Set(
      [...this._sessions.values()].map((session) => session.connectionIdentity),
    );
    for (const [connection, listeners] of this._haObservers) {
      if (activeConnections.has(connection)) continue;
      connection.removeEventListener?.("disconnected", listeners.disconnected);
      connection.removeEventListener?.("ready", listeners.ready);
      this._haObservers.delete(connection);
    }
  }

  private _clearConnectionObservers(): void {
    for (const [connection, listeners] of this._haObservers) {
      connection.removeEventListener?.("disconnected", listeners.disconnected);
      connection.removeEventListener?.("ready", listeners.ready);
    }
    this._haObservers.clear();
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
