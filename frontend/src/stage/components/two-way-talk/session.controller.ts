import type { ReactiveController, ReactiveControllerHost } from "lit";

import type {
  ActiveCameraSession,
  CameraSessionContext,
} from "../../camera-session-context";
import type { LiveConnectionType } from "../../../core/config";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import {
  ensurePersistentTalkTile,
  getPersistentTalkSession,
  type PersistentTalkSnapshot,
  type PersistentTalkTarget,
} from "../../../features/persistent-talk";
import { TalkSourceResolver } from "../../../providers/talk-source-resolver";

interface TalkSessionCallbacks {
  onConnected(localStream: MediaStream): void;
  onFailed(error: unknown): void;
  onStopped(): void;
}

interface TalkCameraSource {
  readonly connection: LiveConnectionType;
  readonly entityId: string;
  readonly label?: string;
}

/** Adapts one Stage control surface to the document-scoped TWT session. */
export class TalkSessionController implements ReactiveController {
  private _api?: HomeAssistantApi;
  private _camera?: ActiveCameraSession;
  private _cameraContext?: CameraSessionContext;
  private _capabilityApi?: HomeAssistantApi;
  private _capabilityEntityId?: string;
  private _capabilityEnabled = false;
  private _capabilityGeneration = 0;
  private _configuredSources: readonly TalkCameraSource[] = [];
  private _disconnectGeneration = 0;
  private _localize?: LocalizeFunction;
  private readonly _manager = getPersistentTalkSession();
  private _snapshot: PersistentTalkSnapshot = this._manager.snapshot;
  private _supported = false;
  private _unsubscribeCamera?: () => void;
  private _unsubscribeSession?: () => void;
  private readonly _resolver = new TalkSourceResolver();

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _callbacks: TalkSessionCallbacks,
  ) {
    _host.addController(this);
  }

  public get active(): boolean {
    return this._matchesTarget() && this._snapshot.status === "connected";
  }

  public get camera(): ActiveCameraSession | undefined {
    return this._camera;
  }

  public get connecting(): boolean {
    return this._matchesTarget() && this._snapshot.status === "connecting";
  }

  public get microphoneMuted(): boolean {
    return this.active && this._snapshot.microphoneMuted;
  }

  public get speakerMuted(): boolean {
    return this._snapshot.muted;
  }

  public get supported(): boolean {
    return this._supported;
  }

  public configure(
    api: HomeAssistantApi | undefined,
    cameraContext: CameraSessionContext,
    sources: readonly TalkCameraSource[],
    localize: LocalizeFunction = englishLocalize,
  ): void {
    const configurationChanged =
      this._api !== api ||
      sources.length !== this._configuredSources.length ||
      sources.some(
        (source, index) =>
          source.entityId !== this._configuredSources[index]?.entityId ||
          source.connection !== this._configuredSources[index]?.connection ||
          source.label !== this._configuredSources[index]?.label,
      );
    this._api = api;
    this._configuredSources = sources;
    this._localize = localize;
    if (this._cameraContext !== cameraContext) {
      this._unsubscribeCamera?.();
      this._cameraContext = cameraContext;
      this._unsubscribeCamera = cameraContext.subscribe((camera) =>
        this._handleCamera(camera),
      );
    } else if (configurationChanged) {
      this._handleCamera(cameraContext.session);
    } else {
      this._syncSurface();
    }
  }

  public hostConnected(): void {
    this._disconnectGeneration += 1;
    this._unsubscribeSession ??= this._manager.subscribe((snapshot) =>
      this._handleSnapshot(snapshot),
    );
    this._syncSurface();
  }

  public hostDisconnected(): void {
    const generation = ++this._disconnectGeneration;
    queueMicrotask(() => {
      if (
        generation !== this._disconnectGeneration ||
        (this._host as ReactiveControllerHost & { isConnected?: boolean })
          .isConnected
      ) {
        return;
      }
      this._manager.removeSurface(this);
      this._unsubscribeCamera?.();
      this._unsubscribeCamera = undefined;
      this._cameraContext = undefined;
      this._unsubscribeSession?.();
      this._unsubscribeSession = undefined;
    });
  }

  public async start(): Promise<void> {
    const target = this._target();
    if (!target || !this._camera?.available || !this._supported) return;
    await ensurePersistentTalkTile();
    await this._manager.start(target);
    if (this._snapshot !== this._manager.snapshot) {
      this._handleSnapshot(this._manager.snapshot);
    }
  }

  public stop(): void {
    if (!this.active && !this.connecting) return;
    this._manager.stopFromSurface();
  }

  public toggleMicrophoneMute(): void {
    if (this.active) this._manager.toggleMicrophoneMute();
  }

  public toggleSpeakerMute(): void {
    if (this.active) this._manager.toggleSpeaker();
  }

  private _handleCamera(camera: ActiveCameraSession | undefined): void {
    this._camera = camera;
    this._syncSurface();
    const entityId = camera?.entityId;
    const source = this._source(entityId);
    const enabled = Boolean(source);
    if (!enabled && entityId && this._snapshot.target?.entityId === entityId) {
      this._manager.dismiss();
    }
    if (
      this._capabilityApi === this._api &&
      this._capabilityEntityId === entityId &&
      this._capabilityEnabled === enabled
    ) {
      this._host.requestUpdate();
      return;
    }
    this._capabilityApi = this._api;
    this._capabilityEntityId = entityId;
    this._capabilityEnabled = enabled;
    const generation = ++this._capabilityGeneration;
    this._supported = false;
    if (!source || !entityId || !this._api) {
      this._host.requestUpdate();
      return;
    }
    void this._resolver
      .supports(this._api, source.connection, entityId)
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

  private _handleSnapshot(snapshot: PersistentTalkSnapshot): void {
    const previous = this._snapshot;
    this._snapshot = snapshot;
    if (
      this._matchesTarget() &&
      snapshot.status === "connected" &&
      previous.status !== "connected" &&
      snapshot.connection
    ) {
      this._callbacks.onConnected(snapshot.connection.localStream);
    }
    if (snapshot.errorRevision !== previous.errorRevision) {
      this._callbacks.onFailed(new Error("Two-way talk connection failed"));
    }
    if (
      (previous.status === "connected" || previous.status === "connecting") &&
      snapshot.status !== "connected" &&
      previous.target?.entityId === this._camera?.entityId
    ) {
      this._callbacks.onStopped();
    }
    this._host.requestUpdate();
  }

  private _syncSurface(): void {
    const camera = this._camera;
    const target = this._target();
    if (!camera || !target) {
      this._manager.removeSurface(this);
      return;
    }
    const host = this._host as ReactiveControllerHost & HTMLElement;
    const root = host.getRootNode?.();
    const cardHost = root instanceof ShadowRoot ? root.host : host;
    this._manager.updateSurface(this, {
      ...target,
      camera,
      host: cardHost instanceof HTMLElement ? cardHost : host,
    });
  }

  private _target(): PersistentTalkTarget | undefined {
    const camera = this._camera;
    const source = this._source(camera?.entityId);
    if (!camera || !source || !this._api || !this._localize) return undefined;
    return {
      api: this._api,
      connection: source.connection,
      entityId: source.entityId,
      label: camera.label || source.label || source.entityId,
      localize: this._localize,
      returnPath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
    };
  }

  private _source(entityId: string | undefined): TalkCameraSource | undefined {
    return entityId
      ? this._configuredSources.find(
          (source) =>
            source.entityId === entityId &&
            source.connection === this._camera?.connection,
        )
      : undefined;
  }

  private _matchesTarget(): boolean {
    return Boolean(
      this._camera?.entityId &&
      this._camera.entityId === this._snapshot.target?.entityId,
    );
  }
}
