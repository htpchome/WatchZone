import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { PtzCapability, PtzDirection, PtzProviderId } from "../../api/ptz";
import { cameraProviderId } from "../../core/camera-connection-source";
import type {
  ActiveCameraSession,
  CameraSessionContext,
} from "../../core/camera-session-context";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../../core/home-assistant";
import { PtzSourceResolver } from "../../providers/ptz-source-resolver";

export interface PtzCameraSource {
  readonly entityId: string;
  readonly provider: PtzProviderId;
}

interface PtzSessionCallbacks {
  readonly onFailure: () => void;
  readonly onStopped: () => void;
}

/** Owns capability resolution and the complete PTZ motion lifecycle. */
export class PtzSessionController implements ReactiveController {
  private _api?: HomeAssistantApi;
  private _camera?: ActiveCameraSession;
  private _cameraContext?: CameraSessionContext;
  private _capability?: PtzCapability;
  private _capabilityGeneration = 0;
  private _configuredSources: readonly PtzCameraSource[] = [];
  private _contextUnsubscribe?: () => void;
  private _motionGeneration = 0;
  private _motionUnsubscribe?: HomeAssistantUnsubscribe;
  private _releaseOverlay?: () => void;
  private readonly _resolver = new PtzSourceResolver();
  private _source?: PtzCameraSource;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _callbacks: PtzSessionCallbacks,
  ) {
    _host.addController(this);
  }

  public get camera(): ActiveCameraSession | undefined {
    return this._camera;
  }

  public get capability(): PtzCapability | undefined {
    return this._capability;
  }

  public configure(
    api: HomeAssistantApi | undefined,
    cameraContext: CameraSessionContext,
    sources: readonly PtzCameraSource[],
  ): void {
    const apiChanged = this._api?.identity !== api?.identity;
    this._api = api;
    this._configuredSources = sources;
    if (this._cameraContext === cameraContext) {
      this._syncCamera(cameraContext.session, apiChanged);
      return;
    }
    this._contextUnsubscribe?.();
    this._cameraContext = cameraContext;
    this._contextUnsubscribe = cameraContext.subscribe((camera) =>
      this._syncCamera(camera),
    );
  }

  public async start(direction: PtzDirection): Promise<void> {
    const api = this._api;
    const camera = this._camera;
    const source = this._source;
    const capability = this._capability;
    const supported =
      direction === "left" || direction === "right"
        ? capability?.pan
        : capability?.tilt;
    if (!api || !camera?.available || !source || !supported) return;

    this._stopMotion(false);
    const generation = ++this._motionGeneration;
    this._releaseOverlay = camera.holdOverlay();
    try {
      const unsubscribe = await this._resolver.start(
        api,
        source.provider,
        camera.entityId,
        direction,
      );
      if (generation !== this._motionGeneration) {
        unsubscribe();
        return;
      }
      this._motionUnsubscribe = unsubscribe;
    } catch {
      if (generation !== this._motionGeneration) return;
      this._releaseMotionOverlay();
      this._callbacks.onFailure();
    }
  }

  public stop(): void {
    this._stopMotion(true);
  }

  private _stopMotion(notify: boolean): void {
    const wasMoving =
      this._motionUnsubscribe !== undefined ||
      this._releaseOverlay !== undefined;
    this._motionGeneration += 1;
    this._motionUnsubscribe?.();
    this._motionUnsubscribe = undefined;
    this._releaseMotionOverlay();
    if (wasMoving && notify) this._callbacks.onStopped();
  }

  public hostConnected(): void {
    document.addEventListener("visibilitychange", this._handleVisibilityChange);
    window.addEventListener("blur", this._stopForLifecycle);
    window.addEventListener("freeze", this._stopForLifecycle);
    window.addEventListener("pagehide", this._stopForLifecycle);
  }

  public hostDisconnected(): void {
    document.removeEventListener(
      "visibilitychange",
      this._handleVisibilityChange,
    );
    window.removeEventListener("blur", this._stopForLifecycle);
    window.removeEventListener("freeze", this._stopForLifecycle);
    window.removeEventListener("pagehide", this._stopForLifecycle);
    this._contextUnsubscribe?.();
    this._contextUnsubscribe = undefined;
    this._cameraContext = undefined;
    this.stop();
  }

  private _syncCamera(
    camera: ActiveCameraSession | undefined,
    force = false,
  ): void {
    const source = camera
      ? this._configuredSources.find(
          ({ entityId, provider }) =>
            entityId === camera.entityId &&
            provider === cameraProviderId(camera.source),
        )
      : undefined;
    if (!force && camera === this._camera && sameSource(source, this._source)) {
      return;
    }
    this.stop();
    this._camera = camera;
    this._source = source;
    this._capability = undefined;
    const generation = ++this._capabilityGeneration;
    this._host.requestUpdate();
    if (!camera || !source || !this._api) return;
    void this._resolver
      .capability(this._api, source.provider, camera.entityId)
      .then((capability) => {
        if (generation !== this._capabilityGeneration) return;
        this._capability = capability;
        this._host.requestUpdate();
      })
      .catch(() => {
        if (generation !== this._capabilityGeneration) return;
        this._capability = undefined;
        this._host.requestUpdate();
      });
  }

  private _releaseMotionOverlay(): void {
    this._releaseOverlay?.();
    this._releaseOverlay = undefined;
  }

  private readonly _handleVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") this.stop();
  };

  private readonly _stopForLifecycle = (): void => this.stop();
}

function sameSource(
  left: PtzCameraSource | undefined,
  right: PtzCameraSource | undefined,
): boolean {
  return (
    left?.entityId === right?.entityId && left?.provider === right?.provider
  );
}
