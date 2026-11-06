import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { PresentedLiveSource } from "../../../core/camera-connection-source";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import type {
  MediaSessionLease,
  MediaSessionSnapshot,
  MediaTransport,
} from "../../../core/media-session-manager";
import { getMediaSessionManager } from "../../../core/media-session-manager";
import { LiveSourceResolver } from "../../../providers/live-source-resolver";

interface SessionCallbacks {
  getInitialMuted(): boolean;
  onActiveVideoChanged(video: HTMLVideoElement | undefined): void;
}

/** Owns provider leases, retained-source selection, and takeover. */
export class CameraLiveSessionController implements ReactiveController {
  private _api?: HomeAssistantApi;
  private _available = false;
  private _connected = false;
  private _entityId?: string;
  private _hlsLease?: MediaSessionLease;
  private _hlsPendingKey?: string;
  private _hlsSnapshot: MediaSessionSnapshot = { state: "new" };
  private _hlsUnsubscribe?: () => void;
  private _lowLatencyHls = true;
  private _retryWebRtcAfterHlsRecovery = false;
  private _retainedWebRtcPreferred = false;
  private _revision = 0;
  private _selected?: PresentedLiveSource;
  private _transport?: MediaTransport;
  private _webRtcDecoded = false;
  private _webRtcLease?: MediaSessionLease;
  private _webRtcPendingKey?: string;
  private _webRtcSnapshot: MediaSessionSnapshot = { state: "new" };
  private _webRtcUnsubscribe?: () => void;
  private readonly _resolver = new LiveSourceResolver();

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _callbacks: SessionCallbacks,
  ) {
    _host.addController(this);
  }

  public get hlsVideo(): HTMLVideoElement | undefined {
    return this._hlsSnapshot.video;
  }

  public get failed(): boolean {
    return (
      this._webRtcSnapshot.state === "failed" &&
      this._hlsSnapshot.state === "failed"
    );
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

  public hostConnected(): void {
    this._connected = true;
    this._sync();
  }

  public hostDisconnected(): void {
    this._connected = false;
    this._releaseAll();
  }

  public configure(
    api: HomeAssistantApi | undefined,
    entityId: string | undefined,
    available: boolean,
    lowLatencyHls = true,
    retainWhenInactive = true,
  ): void {
    const changed =
      this._api?.identity !== api?.identity ||
      this._entityId !== entityId ||
      this._lowLatencyHls !== lowLatencyHls;
    this._api = api;
    this._entityId = entityId;
    this._available = available;
    this._lowLatencyHls = lowLatencyHls;
    if (changed || !available) {
      if (!available && !retainWhenInactive) this._discardAll();
      else this._releaseAll();
    }
    this._sync();
    this._host.requestUpdate();
  }

  public handleWebRtcDecoded(video: HTMLVideoElement): void {
    if (this._webRtcDecoded || !this._webRtcSnapshot.stream) return;
    this._webRtcDecoded = true;
    this._webRtcSnapshot.timing?.mark("first_frame_decoded");
    this._webRtcSnapshot.timing?.mark("presentation_selected");
    this._select("webrtc", this._webRtcSnapshot.transport, video);
  }

  public handleWebRtcPresented(): void {
    if (this._selected !== "webrtc") return;
    this._releaseHls(true);
    this._host.requestUpdate();
  }

  private _sync(): void {
    if (!this._connected || !this._api || !this._entityId || !this._available) {
      this._releaseAll();
      return;
    }
    const webRtcKey = this._resolver.homeAssistantWebRtcKey(this._entityId);
    this._retainedWebRtcPreferred =
      this._selected === "webrtc" ||
      getMediaSessionManager().hasReusableTransport(
        this._entityId,
        "webrtc",
      );
    if (
      this._webRtcLease?.key !== webRtcKey &&
      this._webRtcPendingKey !== webRtcKey
    ) {
      this._releaseWebRtc();
      this._webRtcPendingKey = webRtcKey;
      void this._acquireWebRtc(this._api, this._entityId, webRtcKey);
    }
    this._syncHls();
  }

  private async _acquireWebRtc(
    api: HomeAssistantApi,
    entityId: string,
    expectedKey: string,
  ): Promise<void> {
    try {
      const lease = await this._resolver.acquireHomeAssistantWebRtc(
        api,
        entityId,
      );
      if (
        !this._connected ||
        this._api?.identity !== api.identity ||
        this._entityId !== entityId
      ) {
        lease.release();
        return;
      }
      if (this._webRtcLease?.key === expectedKey) {
        lease.release();
        return;
      }
      this._webRtcLease = lease;
      this._webRtcUnsubscribe = this._webRtcLease.subscribe((snapshot) => {
        this._webRtcSnapshot = snapshot;
        this._revision += 1;
        if (snapshot.state === "connecting" || snapshot.state === "failed") {
          this._webRtcDecoded = false;
        }
        if (snapshot.state === "failed") {
          this._retainedWebRtcPreferred = false;
        }
        if (snapshot.state === "failed" && this._selected === "webrtc") {
          this._clearSelection();
        }
        if (snapshot.state === "failed") this._syncHls();
        this._host.requestUpdate();
      });
    } catch (error) {
      this._webRtcSnapshot = {
        state: "failed",
        error: error instanceof Error ? error.message : "Unable to load WebRTC",
      };
      this._host.requestUpdate();
    } finally {
      if (this._webRtcPendingKey === expectedKey) {
        this._webRtcPendingKey = undefined;
      }
    }
  }

  private _syncHls(): void {
    if (
      this._selected === "webrtc" ||
      this._retainedWebRtcPreferred ||
      !this._api ||
      !this._entityId ||
      !this._available ||
      !this._connected
    )
      return;
    const key = this._resolver.homeAssistantHlsKey(
      this._entityId,
      this._lowLatencyHls,
    );
    if (this._hlsLease?.key === key || this._hlsPendingKey === key) return;
    this._releaseHls();
    this._hlsPendingKey = key;
    void this._acquireHls(this._api, this._entityId, key, this._lowLatencyHls);
  }

  private async _acquireHls(
    api: HomeAssistantApi,
    entityId: string,
    expectedKey: string,
    lowLatencyHls: boolean,
  ): Promise<void> {
    try {
      const lease = await this._resolver.acquireHomeAssistantHls(
        api,
        entityId,
        {
          initialMuted: this._callbacks.getInitialMuted(),
          lowLatencyHls,
        },
      );
      if (
        !this._connected ||
        this._api?.identity !== api.identity ||
        this._entityId !== entityId ||
        this._resolver.homeAssistantHlsKey(entityId, this._lowLatencyHls) !==
          expectedKey ||
        this._selected === "webrtc"
      ) {
        lease.release();
        return;
      }
      if (this._hlsLease?.key === expectedKey) {
        lease.release();
        return;
      }
      this._hlsLease = lease;
      this._hlsUnsubscribe = this._hlsLease.subscribe((snapshot) => {
        this._hlsSnapshot = snapshot;
        this._revision += 1;
        if (snapshot.state === "live") {
          if (!this._selected) {
            snapshot.timing?.mark("presentation_selected");
            this._select("hls", snapshot.transport, snapshot.video);
          } else if (this._selected === "hls") {
            this._callbacks.onActiveVideoChanged(snapshot.video);
          }
          if (this._retryWebRtcAfterHlsRecovery) {
            this._retryWebRtcAfterHlsRecovery = false;
            if (this._webRtcSnapshot.state === "failed") {
              this._webRtcLease?.retry();
            }
          }
        } else if (snapshot.state === "failed" && this._selected === "hls") {
          this._retryWebRtcAfterHlsRecovery = true;
          this._clearSelection();
        }
        this._host.requestUpdate();
      });
    } catch (error) {
      this._hlsSnapshot = {
        state: "failed",
        error: error instanceof Error ? error.message : "Unable to load HLS",
      };
      this._host.requestUpdate();
    } finally {
      if (this._hlsPendingKey === expectedKey) {
        this._hlsPendingKey = undefined;
      }
    }
  }

  private _select(
    source: PresentedLiveSource,
    transport: MediaTransport | undefined,
    video: HTMLVideoElement | undefined,
  ): void {
    this._selected = source;
    this._transport = transport;
    this._callbacks.onActiveVideoChanged(video);
    this._host.requestUpdate();
  }

  private _clearSelection(): void {
    this._selected = undefined;
    this._transport = undefined;
    this._callbacks.onActiveVideoChanged(undefined);
  }

  private _releaseAll(): void {
    this._clearSelection();
    this._webRtcDecoded = false;
    this._retryWebRtcAfterHlsRecovery = false;
    this._retainedWebRtcPreferred = false;
    this._releaseWebRtc();
    this._releaseHls();
  }

  private _discardAll(): void {
    this._clearSelection();
    this._webRtcDecoded = false;
    this._retryWebRtcAfterHlsRecovery = false;
    this._retainedWebRtcPreferred = false;
    this._releaseWebRtc(true);
    this._releaseHls(true);
  }

  private _releaseWebRtc(discard = false): void {
    this._webRtcPendingKey = undefined;
    this._webRtcUnsubscribe?.();
    this._webRtcUnsubscribe = undefined;
    if (discard) this._webRtcLease?.discard();
    else this._webRtcLease?.release();
    this._webRtcLease = undefined;
    this._webRtcSnapshot = { state: "new" };
  }

  private _releaseHls(discard = false): void {
    this._hlsPendingKey = undefined;
    this._hlsSnapshot.video?.remove();
    this._hlsUnsubscribe?.();
    this._hlsUnsubscribe = undefined;
    if (discard) this._hlsLease?.discard();
    else this._hlsLease?.release();
    this._hlsLease = undefined;
    this._hlsSnapshot = { state: "new" };
  }
}
