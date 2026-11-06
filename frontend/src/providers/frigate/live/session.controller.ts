import type { ReactiveControllerHost } from "lit";

import type { PresentedLiveSource } from "../../../core/camera-connection-source";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import type {
  MediaSessionLease,
  MediaSessionSnapshot,
  MediaTransport,
} from "../../../core/media-session-manager";
import { FrigateLiveProvider } from ".";

interface SessionCallbacks {
  getInitialMuted(): boolean;
  onActiveVideoChanged(video: HTMLVideoElement | undefined): void;
}

/** Owns Frigate MSE-first selection with an isolated WebRTC fallback. */
export class FrigateCameraLiveSessionController {
  private _api?: HomeAssistantApi;
  private _available = false;
  private _connected = false;
  private _entityId?: string;
  private _generation = 0;
  private _mseLease?: MediaSessionLease;
  private _mseSnapshot: MediaSessionSnapshot = { state: "new" };
  private _mseUnsubscribe?: () => void;
  private _revision = 0;
  private _selected?: PresentedLiveSource;
  private _transport?: MediaTransport;
  private _webRtcDecoded = false;
  private _webRtcLease?: MediaSessionLease;
  private _webRtcSnapshot: MediaSessionSnapshot = { state: "new" };
  private _webRtcUnsubscribe?: () => void;
  private readonly _provider = new FrigateLiveProvider();

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _callbacks: SessionCallbacks,
  ) {}

  public get failed(): boolean {
    return (
      this._mseSnapshot.state === "failed" &&
      this._webRtcSnapshot.state === "failed"
    );
  }
  public get elementVideo(): HTMLVideoElement | undefined {
    return this._mseSnapshot.video;
  }
  public get revision(): number {
    return this._revision;
  }
  public get selected(): PresentedLiveSource | undefined {
    return this._selected;
  }
  public get transport(): MediaTransport | undefined {
    return this._transport;
  }
  public get webRtcStream(): MediaStream | undefined {
    return this._webRtcSnapshot.stream;
  }

  public connect(): void {
    this._connected = true;
    this._sync();
  }
  public disconnect(): void {
    this._connected = false;
    this._releaseAll();
  }

  public configure(
    api: HomeAssistantApi | undefined,
    entityId: string | undefined,
    available: boolean,
    options: {
      readonly lowLatencyHls: boolean;
      readonly retainWhenInactive: boolean;
    },
  ): void {
    const { retainWhenInactive } = options;
    const changed =
      this._api?.identity !== api?.identity || this._entityId !== entityId;
    this._api = api;
    this._entityId = entityId;
    this._available = available;
    if (changed || !available) {
      if (!available && !retainWhenInactive) this._discardAll();
      else this._releaseAll();
    }
    this._sync();
  }

  public handleWebRtcDecoded(video: HTMLVideoElement): void {
    if (this._webRtcDecoded || !this._webRtcSnapshot.stream) return;
    this._webRtcDecoded = true;
    this._webRtcSnapshot.timing?.mark("first_frame_decoded");
    this._select("webrtc", this._webRtcSnapshot.transport, video);
  }

  public handleWebRtcPresented(): void {
    if (this._selected !== "webrtc") return;
    this._releaseMse(true);
  }

  private _sync(): void {
    if (!this._connected || !this._api || !this._entityId || !this._available)
      return;
    this._startWebRtc();
    if (this._webRtcLease) this._syncMse();
  }

  private _syncMse(): void {
    if (
      !this._api ||
      !this._entityId ||
      !this._available ||
      !this._connected ||
      this._selected === "webrtc" ||
      (this._webRtcSnapshot.state === "live" &&
        Boolean(this._webRtcSnapshot.stream)) ||
      this._mseLease ||
      this._mseSnapshot.state !== "new"
    )
      return;
    const generation = this._generation;
    this._mseSnapshot = { state: "connecting" };
    void this._acquireMse(this._api, this._entityId, generation);
  }

  private async _acquireMse(
    api: HomeAssistantApi,
    entityId: string,
    generation: number,
  ): Promise<void> {
    try {
      const lease = await this._provider.acquireMse(api, entityId, {
        initialMuted: this._callbacks.getInitialMuted(),
      });
      if (!this._valid(api, entityId, generation)) {
        lease.release();
        return;
      }
      this._mseLease = lease;
      this._mseUnsubscribe = lease.subscribe((snapshot) => {
        this._mseSnapshot = snapshot;
        this._revision += 1;
        if (snapshot.state === "live") {
          if (!this._selected) {
            snapshot.timing?.mark("presentation_selected");
            this._select("mse", snapshot.transport, snapshot.video);
          } else if (this._selected === "mse") {
            this._callbacks.onActiveVideoChanged(snapshot.video);
          }
        } else if (snapshot.state === "failed") {
          if (this._selected === "mse") this._clearSelection();
        }
        this._host.requestUpdate();
      });
    } catch (error) {
      if (!this._valid(api, entityId, generation)) return;
      this._mseSnapshot = {
        state: "failed",
        error: error instanceof Error ? error.message : "Unable to load MSE",
      };
      this._host.requestUpdate();
    }
  }

  private _startWebRtc(): void {
    if (
      !this._api ||
      !this._entityId ||
      this._webRtcLease ||
      this._webRtcSnapshot.state !== "new"
    )
      return;
    const api = this._api;
    const entityId = this._entityId;
    const generation = this._generation;
    this._webRtcSnapshot = { state: "connecting" };
    void this._provider
      .acquireWebRtc(api, entityId)
      .then((lease) => {
        if (!this._valid(api, entityId, generation)) {
          lease.release();
          return;
        }
        this._webRtcLease = lease;
        this._webRtcUnsubscribe = lease.subscribe((snapshot) => {
          this._webRtcSnapshot = snapshot;
          this._revision += 1;
          if (snapshot.state === "failed" && this._selected === "webrtc") {
            this._clearSelection();
          }
          this._syncMse();
          this._host.requestUpdate();
        });
      })
      .catch((error: unknown) => {
        if (!this._valid(api, entityId, generation)) return;
        this._webRtcSnapshot = {
          state: "failed",
          error:
            error instanceof Error ? error.message : "Unable to load WebRTC",
        };
        this._syncMse();
        this._host.requestUpdate();
      });
  }

  private _valid(
    api: HomeAssistantApi,
    entityId: string,
    generation: number,
  ): boolean {
    return (
      this._connected &&
      this._available &&
      this._api?.identity === api.identity &&
      this._entityId === entityId &&
      this._generation === generation
    );
  }
  private _select(
    source: PresentedLiveSource,
    transport: MediaTransport | undefined,
    video: HTMLVideoElement | undefined,
  ): void {
    this._selected = source;
    this._transport = transport;
    this._callbacks.onActiveVideoChanged(video);
  }
  private _clearSelection(): void {
    this._selected = undefined;
    this._transport = undefined;
    this._callbacks.onActiveVideoChanged(undefined);
  }
  private _releaseAll(): void {
    this._generation += 1;
    this._clearSelection();
    this._webRtcDecoded = false;
    this._releaseMse();
    this._releaseWebRtc();
  }
  private _discardAll(): void {
    this._generation += 1;
    this._clearSelection();
    this._webRtcDecoded = false;
    this._releaseMse(true);
    this._releaseWebRtc(true);
  }
  private _releaseMse(discard = false): void {
    this._mseUnsubscribe?.();
    this._mseUnsubscribe = undefined;
    if (discard) this._mseLease?.discard();
    else this._mseLease?.release();
    this._mseLease = undefined;
    this._mseSnapshot = { state: "new" };
  }
  private _releaseWebRtc(discard = false): void {
    this._webRtcUnsubscribe?.();
    this._webRtcUnsubscribe = undefined;
    if (discard) this._webRtcLease?.discard();
    else this._webRtcLease?.release();
    this._webRtcLease = undefined;
    this._webRtcSnapshot = { state: "new" };
  }
}
