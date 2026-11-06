import type { ReactiveController, ReactiveControllerHost } from "lit";

import type {
  CameraConnectionSource,
  PresentedLiveSource,
} from "../core/camera-connection-source";
import type { HomeAssistantApi } from "../core/home-assistant";
import type {
  MediaConnectionOptions,
  MediaSessionLease,
  MediaTransport,
} from "../core/media-session-manager";

type HomeAssistantProvider =
  typeof import("./home-assistant/live").HomeAssistantLiveProvider;

let providerPromise: Promise<InstanceType<HomeAssistantProvider>> | undefined;

async function getHomeAssistantProvider(): Promise<
  InstanceType<HomeAssistantProvider>
> {
  return (providerPromise ??= import("./home-assistant/live").then(
    ({ HomeAssistantLiveProvider }) => new HomeAssistantLiveProvider(),
  ));
}

/** Public provider boundary used by camera orchestration and eager prewarm. */
export class LiveSourceResolver {
  public async acquireHomeAssistantWebRtc(
    api: HomeAssistantApi,
    entityId: string,
  ): Promise<MediaSessionLease> {
    return (await getHomeAssistantProvider()).acquireWebRtc(
      api,
      entityId,
      this.homeAssistantWebRtcKey(entityId),
    );
  }

  public async acquireHomeAssistantHls(
    api: HomeAssistantApi,
    entityId: string,
    options: MediaConnectionOptions,
  ): Promise<MediaSessionLease> {
    return (await getHomeAssistantProvider()).acquireHls(
      api,
      entityId,
      this.homeAssistantHlsKey(entityId, options.lowLatencyHls !== false),
      options,
    );
  }

  public homeAssistantWebRtcKey(entityId: string): string {
    return `home_assistant:webrtc:${entityId}`;
  }

  public homeAssistantHlsKey(entityId: string, lowLatencyHls = true): string {
    return lowLatencyHls
      ? `home_assistant:hls:${entityId}`
      : `home_assistant:hls:standard:${entityId}`;
  }
}

interface ProviderSessionCallbacks {
  getInitialMuted(): boolean;
  onActiveVideoChanged(video: HTMLVideoElement | undefined): void;
}

interface ProviderLiveSession {
  readonly failed: boolean;
  readonly hlsVideo?: HTMLVideoElement;
  readonly revision: number;
  readonly selected?: PresentedLiveSource;
  readonly transport?: MediaTransport;
  readonly webRtcStream?: MediaStream;
  connect(): void;
  configure(
    api: HomeAssistantApi | undefined,
    entityId: string | undefined,
    available: boolean,
    retainWhenInactive?: boolean,
  ): void;
  disconnect(): void;
  handleWebRtcDecoded(video: HTMLVideoElement): void;
  handleWebRtcPresented(): void;
}

/** Lazy session boundary for provider-owned live selection policies. */
export class ProviderLiveSessionResolver implements ReactiveController {
  private _adapter?: ProviderLiveSession;
  private _api?: HomeAssistantApi;
  private _available = false;
  private _connected = false;
  private _entityId?: string;
  private _generation = 0;
  private _retainWhenInactive = true;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _callbacks: ProviderSessionCallbacks,
  ) {
    _host.addController(this);
  }

  public get failed(): boolean {
    return this._adapter?.failed ?? false;
  }

  public get hlsVideo(): HTMLVideoElement | undefined {
    return this._adapter?.hlsVideo;
  }

  public get revision(): number {
    return this._adapter?.revision ?? 0;
  }

  public get selected(): PresentedLiveSource | undefined {
    return this._adapter?.selected;
  }

  public get transport(): MediaTransport | undefined {
    return this._adapter?.transport;
  }

  public get webRtcStream(): MediaStream | undefined {
    return this._adapter?.webRtcStream;
  }

  public hostConnected(): void {
    this._connected = true;
    this._adapter?.connect();
  }

  public hostDisconnected(): void {
    this._connected = false;
    this._adapter?.disconnect();
  }

  public configure(
    source: CameraConnectionSource,
    api: HomeAssistantApi | undefined,
    entityId: string | undefined,
    available: boolean,
    retainWhenInactive = true,
  ): void {
    const providerSelected = source === "frigate_go2rtc";
    this._api = providerSelected ? api : undefined;
    this._entityId = providerSelected ? entityId : undefined;
    this._available = providerSelected && available;
    this._retainWhenInactive = retainWhenInactive;
    if (!providerSelected || !api || !entityId) {
      this._generation += 1;
      this._adapter?.configure(undefined, undefined, false, retainWhenInactive);
      return;
    }
    if (this._adapter) {
      this._syncAdapter();
      return;
    }
    const generation = ++this._generation;
    void import("./frigate/live/session.controller")
      .then(({ FrigateCameraLiveSessionController }) => {
        if (generation !== this._generation) return;
        this._adapter = new FrigateCameraLiveSessionController(
          this._host,
          this._callbacks,
        );
        if (this._connected) this._adapter.connect();
        this._syncAdapter();
        this._host.requestUpdate();
      })
      .catch(() => {
        if (generation === this._generation) this._host.requestUpdate();
      });
  }

  public handleWebRtcDecoded(video: HTMLVideoElement): void {
    this._adapter?.handleWebRtcDecoded(video);
  }

  public handleWebRtcPresented(): void {
    this._adapter?.handleWebRtcPresented();
  }

  private _syncAdapter(): void {
    this._adapter?.configure(
      this._api,
      this._entityId,
      this._available,
      this._retainWhenInactive,
    );
  }
}
