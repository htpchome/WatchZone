import type { ReactiveController, ReactiveControllerHost } from "lit";

import type {
  ActiveCameraSession,
  CameraSessionContext,
} from "../../core/camera-session-context";
import {
  cameraSourceKey,
  type CameraConnectionSource,
} from "../../core/camera-connection-source";
import type { HomeAssistantApi } from "../../core/home-assistant";
import type { TalkConnection } from "../../providers/talk-source-resolver";
import { TalkSourceResolver } from "../../providers/talk-source-resolver";

interface TalkSessionCallbacks {
  onConnected(connection: TalkConnection): void;
  onFailed(error: unknown): void;
  onStopped(): void;
}

/** Owns one ephemeral microphone session and all privacy-sensitive teardown. */
export class TalkSessionController implements ReactiveController {
  private _abort?: AbortController;
  private _api?: HomeAssistantApi;
  private _camera?: ActiveCameraSession;
  private _cameraContext?: CameraSessionContext;
  private _capabilityApi?: HomeAssistantApi;
  private _capabilityEntityId?: string;
  private _capabilityEnabled = false;
  private _capabilityGeneration = 0;
  private _capabilitySource?: CameraConnectionSource;
  private _connection?: TalkConnection;
  private _enabledCameraKeys = new Set<string>();
  private _microphoneMuted = false;
  private _supported = false;
  private _talkAudioCamera?: ActiveCameraSession;
  private _unsubscribeCamera?: () => void;
  private readonly _resolver = new TalkSourceResolver();

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _callbacks: TalkSessionCallbacks,
  ) {
    _host.addController(this);
  }

  public get active(): boolean {
    return Boolean(this._connection);
  }

  public get camera(): ActiveCameraSession | undefined {
    return this._camera;
  }

  public get connecting(): boolean {
    return Boolean(this._abort && !this._connection);
  }

  public get microphoneMuted(): boolean {
    return this._microphoneMuted;
  }

  public get supported(): boolean {
    return this._supported;
  }

  public configure(
    api: HomeAssistantApi | undefined,
    cameraContext: CameraSessionContext,
    cameras: readonly {
      readonly entityId: string;
      readonly source: CameraConnectionSource;
    }[],
  ): void {
    const enabledSet = new Set(
      cameras.map(({ entityId, source }) => cameraSourceKey(source, entityId)),
    );
    const configurationChanged =
      this._api !== api ||
      enabledSet.size !== this._enabledCameraKeys.size ||
      [...enabledSet].some((key) => !this._enabledCameraKeys.has(key));
    this._api = api;
    this._enabledCameraKeys = enabledSet;
    if (this._cameraContext !== cameraContext) {
      this._unsubscribeCamera?.();
      this._cameraContext = cameraContext;
      this._unsubscribeCamera = cameraContext.subscribe((camera) =>
        this._handleCamera(camera),
      );
    } else if (configurationChanged) {
      this._handleCamera(cameraContext.session);
    }
  }

  public hostConnected(): void {
    document.addEventListener("visibilitychange", this._handleVisibility);
    document.addEventListener("freeze", this._handleBackground);
    window.addEventListener("pagehide", this._handleBackground);
  }

  public hostDisconnected(): void {
    document.removeEventListener("visibilitychange", this._handleVisibility);
    document.removeEventListener("freeze", this._handleBackground);
    window.removeEventListener("pagehide", this._handleBackground);
    this._unsubscribeCamera?.();
    this._unsubscribeCamera = undefined;
    this._cameraContext = undefined;
    this.stop();
  }

  public async start(): Promise<void> {
    const api = this._api;
    const camera = this._camera;
    if (
      !api ||
      !camera ||
      !camera.available ||
      !this._supported ||
      this.connecting ||
      this.active
    )
      return;
    const abort = new AbortController();
    this._abort = abort;
    this._microphoneMuted = false;
    this._host.requestUpdate();
    try {
      const connection = await this._resolver.connect(
        api,
        camera.source,
        camera.entityId,
        abort.signal,
        (error) => this._handleConnectionFailure(camera.entityId, error),
      );
      if (
        abort.signal.aborted ||
        this._camera?.entityId !== camera.entityId ||
        this._camera?.source !== camera.source ||
        document.visibilityState !== "visible"
      ) {
        connection.close();
        return;
      }
      this._connection = connection;
      this._talkAudioCamera = camera;
      camera.setTalkAudioActive(true);
      this._callbacks.onConnected(connection);
    } catch (error) {
      if (!abort.signal.aborted) this._callbacks.onFailed(error);
    } finally {
      if (this._abort === abort) this._abort = undefined;
      this._host.requestUpdate();
    }
  }

  public stop(): void {
    const hadSession = Boolean(this._abort || this._connection);
    this._abort?.abort();
    this._abort = undefined;
    this._connection?.close();
    this._connection = undefined;
    this._releaseTalkAudio();
    this._microphoneMuted = false;
    if (hadSession) this._callbacks.onStopped();
    this._host.requestUpdate();
  }

  public toggleMicrophoneMute(): void {
    if (!this._connection) return;
    this._microphoneMuted = !this._microphoneMuted;
    this._connection.setMicrophoneMuted(this._microphoneMuted);
    this._host.requestUpdate();
  }

  private _handleCamera(camera: ActiveCameraSession | undefined): void {
    const changed =
      this._camera?.entityId !== camera?.entityId ||
      this._camera?.source !== camera?.source;
    if (changed) this.stop();
    this._camera = camera;
    const entityId = camera?.entityId;
    const enabled = Boolean(
      entityId &&
      camera &&
      this._enabledCameraKeys.has(cameraSourceKey(camera.source, entityId)),
    );
    if (!enabled && (this.active || this.connecting)) this.stop();
    if (
      this._capabilityApi === this._api &&
      this._capabilityEntityId === entityId &&
      this._capabilitySource === camera?.source &&
      this._capabilityEnabled === enabled
    ) {
      this._host.requestUpdate();
      return;
    }
    this._capabilityApi = this._api;
    this._capabilityEntityId = entityId;
    this._capabilitySource = camera?.source;
    this._capabilityEnabled = enabled;
    const generation = ++this._capabilityGeneration;
    this._supported = false;
    if (!enabled || !entityId || !this._api) {
      this._host.requestUpdate();
      return;
    }
    void this._resolver
      .supports(this._api, camera.source, entityId)
      .then((supported) => {
        if (generation !== this._capabilityGeneration) return;
        this._supported = supported;
        this._host.requestUpdate();
      })
      .catch(() => {
        if (generation !== this._capabilityGeneration) return;
        this._supported = false;
        this._host.requestUpdate();
      });
  }

  private readonly _handleVisibility = (): void => {
    if (document.visibilityState !== "visible") this.stop();
  };

  private _handleConnectionFailure(entityId: string, error: Error): void {
    if (this._camera?.entityId !== entityId || !this._connection) return;
    this._connection.close();
    this._connection = undefined;
    this._releaseTalkAudio();
    this._microphoneMuted = false;
    this._callbacks.onFailed(error);
    this._host.requestUpdate();
  }

  private readonly _handleBackground = (): void => this.stop();

  private _releaseTalkAudio(): void {
    this._talkAudioCamera?.setTalkAudioActive(false);
    this._talkAudioCamera = undefined;
  }
}
