import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { HomeAssistantApi } from "../../../../core/home-assistant";
import type {
  FrigateFallbackTransport,
  LiveConnectionType,
} from "../../../../core/config";
import type { FrigateGo2RtcLiveSourceDescriptor } from "../../../../api/live-source";
import type {
  MediaConnectionOptions,
  MediaSessionLease,
  MediaSessionSnapshot,
  MediaTransport,
} from "../../../../core/media-session-manager";
import { LiveSourceResolver } from "../../../../providers/live-source-resolver";

export type PresentedSource = "fallback" | "webrtc";

interface SessionCallbacks {
  getInitialMuted(): boolean;
  onActiveVideoChanged(video: HTMLVideoElement | undefined): void;
}

/** Owns provider leases, retained-source selection, and takeover. */
export class CameraLiveSessionController implements ReactiveController {
  private _api?: HomeAssistantApi;
  private _available = false;
  private _connected = false;
  private _discardSessionsOnRelease = false;
  private _connection: LiveConnectionType = "home_assistant";
  private _entityId?: string;
  private _frigateSource?: FrigateGo2RtcLiveSourceDescriptor;
  private _frigateSourcePending = false;
  private _frigateFallback: FrigateFallbackTransport = "mse";
  private _sourceGeneration = 0;
  private _fallbackLease?: MediaSessionLease;
  private _fallbackPendingKey?: string;
  private _fallbackSnapshot: MediaSessionSnapshot = { state: "new" };
  private _fallbackUnsubscribe?: () => void;
  private _lowLatencyHls = true;
  private _retryWebRtcAfterFallbackRecovery = false;
  private _revision = 0;
  private _selected?: PresentedSource;
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

  public get fallbackVideo(): HTMLVideoElement | undefined {
    return this._fallbackSnapshot.video;
  }

  public get failed(): boolean {
    if (this._isFrigateHlsOnly()) {
      return this._fallbackSnapshot.state === "failed";
    }
    return (
      this._webRtcSnapshot.state === "failed" &&
      this._fallbackSnapshot.state === "failed"
    );
  }

  public get revision(): number {
    return this._revision;
  }

  public get effectiveLowLatencyHls(): boolean {
    return this._lowLatencyHls;
  }

  public get selected(): PresentedSource | undefined {
    return this._selected;
  }

  public get transport(): MediaTransport | undefined {
    return this._transport;
  }

  public get webRtcStream(): MediaStream | undefined {
    return this._webRtcSnapshot.stream;
  }

  public get webRtcVideo(): HTMLVideoElement | undefined {
    return this._webRtcSnapshot.video;
  }

  public hostConnected(): void {
    this._connected = true;
    this._sync();
  }

  public hostDisconnected(): void {
    this._connected = false;
    if (this._discardSessionsOnRelease) this._discardAll();
    else this._releaseAll();
  }

  public configure(
    api: HomeAssistantApi | undefined,
    entityId: string | undefined,
    available: boolean,
    connection: LiveConnectionType = "home_assistant",
    lowLatencyHls = true,
    frigateFallback: FrigateFallbackTransport = "mse",
    retainWhenInactive = true,
    discardSessionsOnRelease = false,
  ): void {
    const providerChanged = this._connection !== connection;
    const frigateFallbackChanged =
      this._connection === "frigate_go2rtc" &&
      this._effectiveFrigateFallback() !==
        this._resolver.frigateTransportPolicy(frigateFallback).fallback;
    const identityChanged = this._entityId !== entityId || providerChanged;
    const changed =
      this._api?.identity !== api?.identity ||
      identityChanged ||
      this._lowLatencyHls !== lowLatencyHls ||
      frigateFallbackChanged;
    this._api = api;
    this._entityId = entityId;
    this._connection = connection;
    this._available = available;
    this._lowLatencyHls = lowLatencyHls;
    this._frigateFallback = frigateFallback;
    this._discardSessionsOnRelease = discardSessionsOnRelease;
    if (identityChanged) {
      this._sourceGeneration += 1;
      this._frigateSource =
        connection === "frigate_go2rtc" && api && entityId
          ? this._resolver.cachedFrigate(api, entityId)
          : undefined;
      this._frigateSourcePending = false;
    }
    if (changed || !available) {
      if (
        discardSessionsOnRelease ||
        providerChanged ||
        (!available && !retainWhenInactive)
      )
        this._discardAll();
      else if (frigateFallbackChanged) {
        if (this._selected === "fallback") this._clearSelection();
        this._releaseFallback(true);
      } else this._releaseAll();
    }
    this._sync();
    this._host.requestUpdate();
  }

  public handleWebRtcDecoded(video: HTMLVideoElement): void {
    if (
      this._webRtcDecoded ||
      !this._webRtcSnapshot.stream ||
      this._webRtcSnapshot.video !== video
    )
      return;
    this._webRtcDecoded = true;
    this._webRtcLease?.markUsable();
    this._webRtcSnapshot.timing?.mark("first_frame_decoded");
    this._webRtcSnapshot.timing?.mark("presentation_selected");
    this._select("webrtc", this._webRtcSnapshot.transport, video);
  }

  public handleWebRtcPresented(): void {
    if (this._selected !== "webrtc") return;
    this._releaseFallback(true);
    this._host.requestUpdate();
  }

  private _sync(): void {
    if (!this._connected || !this._api || !this._entityId || !this._available) {
      this._releaseAll();
      return;
    }
    if (this._connection === "frigate_go2rtc" && !this._frigateSource) {
      this._frigateSource = this._resolver.cachedFrigate(
        this._api,
        this._entityId,
      );
    }
    if (this._connection === "frigate_go2rtc" && !this._frigateSource) {
      if (!this._frigateSourcePending) {
        this._frigateSourcePending = true;
        void this._resolveFrigateSource(this._api, this._entityId);
      }
      return;
    }
    if (this._isFrigateHlsOnly()) {
      if (this._webRtcLease || this._webRtcPendingKey) {
        this._releaseWebRtc(true);
      }
      this._syncFallback();
      return;
    }
    const webRtcKey =
      this._connection === "frigate_go2rtc"
        ? this._resolver.frigateWebRtcKey(this._frigateSource!)
        : this._resolver.homeAssistantWebRtcKey(this._entityId);
    if (
      this._webRtcLease?.key !== webRtcKey &&
      this._webRtcPendingKey !== webRtcKey
    ) {
      this._releaseWebRtc();
      const usableLease =
        this._connection === "frigate_go2rtc"
          ? this._resolver.acquireUsableFrigateWebRtc(
              this._api,
              this._frigateSource!,
            )
          : this._resolver.acquireUsableHomeAssistantWebRtc(
              this._api,
              this._entityId,
            );
      if (usableLease) {
        this._adoptWebRtcLease(usableLease, true);
      } else {
        this._webRtcPendingKey = webRtcKey;
        void this._acquireWebRtc(this._api, this._entityId, webRtcKey);
      }
    }
    this._syncFallback();
  }

  private async _resolveFrigateSource(
    api: HomeAssistantApi,
    entityId: string,
  ): Promise<void> {
    const generation = ++this._sourceGeneration;
    try {
      const source = await this._resolver.resolveFrigate(api, entityId);
      if (generation !== this._sourceGeneration) return;
      this._frigateSourcePending = false;
      if (
        !this._connected ||
        this._api?.identity !== api.identity ||
        this._entityId !== entityId ||
        this._connection !== "frigate_go2rtc"
      )
        return;
      this._frigateSource = source;
      this._sync();
    } catch (error) {
      if (generation !== this._sourceGeneration) return;
      this._frigateSourcePending = false;
      const message =
        error instanceof Error
          ? error.message
          : "Frigate source is unavailable";
      this._webRtcSnapshot = { state: "failed", error: message };
      this._fallbackSnapshot = { state: "failed", error: message };
      this._host.requestUpdate();
    }
  }

  private async _acquireWebRtc(
    api: HomeAssistantApi,
    entityId: string,
    expectedKey: string,
  ): Promise<void> {
    try {
      const lease =
        this._connection === "frigate_go2rtc" && this._frigateSource
          ? await this._resolver.acquireFrigateWebRtc(
              api,
              entityId,
              this._frigateSource,
            )
          : await this._resolver.acquireHomeAssistantWebRtc(api, entityId);
      if (
        !this._connected ||
        this._api?.identity !== api.identity ||
        this._entityId !== entityId ||
        lease.key !== expectedKey
      ) {
        this._releaseUnusedLease(lease);
        return;
      }
      if (this._webRtcLease?.key === expectedKey) {
        this._releaseUnusedLease(lease);
        return;
      }
      this._adoptWebRtcLease(lease, false);
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

  private _adoptWebRtcLease(
    lease: MediaSessionLease,
    selectUsable: boolean,
  ): void {
    this._webRtcLease = lease;
    this._webRtcUnsubscribe = lease.subscribe((snapshot) => {
      this._webRtcSnapshot = snapshot;
      this._revision += 1;
      if (snapshot.state === "connecting" || snapshot.state === "failed") {
        this._webRtcDecoded = false;
      }
      if (snapshot.state === "failed" && this._selected === "webrtc") {
        this._clearSelection();
        this._syncFallback();
      }
      this._host.requestUpdate();
    });
    if (
      selectUsable &&
      this._webRtcSnapshot.state === "live" &&
      this._webRtcSnapshot.usable === true &&
      this._webRtcSnapshot.video
    ) {
      this._webRtcDecoded = true;
      this._select(
        "webrtc",
        this._webRtcSnapshot.transport,
        this._webRtcSnapshot.video,
      );
    }
  }

  private _syncFallback(): void {
    if (
      this._selected === "webrtc" ||
      !this._api ||
      !this._entityId ||
      !this._available ||
      !this._connected
    )
      return;
    const frigateFallback = this._effectiveFrigateFallback();
    const key =
      this._connection === "frigate_go2rtc"
        ? frigateFallback === "hls"
          ? this._resolver.frigateHlsKey(
              this._frigateSource!,
              this._lowLatencyHls,
            )
          : this._resolver.frigateMseKey(this._frigateSource!)
        : this._resolver.homeAssistantHlsKey(
            this._entityId,
            this._lowLatencyHls,
          );
    if (this._fallbackLease?.key === key || this._fallbackPendingKey === key)
      return;
    this._releaseFallback();
    const options = {
      initialMuted: this._callbacks.getInitialMuted(),
      lowLatencyHls: this._lowLatencyHls,
      nativeHlsOnly: this._isFrigateHlsOnly(),
    };
    if (this._connection === "frigate_go2rtc") {
      const usableLease =
        frigateFallback === "hls"
          ? this._resolver.acquireUsableFrigateHls(
              this._api,
              this._frigateSource!,
              options,
            )
          : this._resolver.acquireUsableFrigateMse(
              this._api,
              this._frigateSource!,
              options,
            );
      if (usableLease) {
        this._adoptFallbackLease(usableLease);
        return;
      }
    }
    this._fallbackPendingKey = key;
    void this._acquireFallback(
      this._api,
      this._entityId,
      key,
      options,
      frigateFallback,
    );
  }

  private async _acquireFallback(
    api: HomeAssistantApi,
    entityId: string,
    expectedKey: string,
    options: MediaConnectionOptions,
    frigateFallback: FrigateFallbackTransport,
  ): Promise<void> {
    try {
      const lease =
        this._connection === "frigate_go2rtc" && this._frigateSource
          ? frigateFallback === "hls"
            ? await this._resolver.acquireFrigateHls(
                api,
                entityId,
                this._frigateSource,
                options,
              )
            : await this._resolver.acquireFrigateMse(
                api,
                entityId,
                this._frigateSource,
                options,
              )
          : await this._resolver.acquireHomeAssistantHls(
              api,
              entityId,
              options,
            );
      if (
        !this._connected ||
        this._api?.identity !== api.identity ||
        this._entityId !== entityId ||
        (this._connection === "frigate_go2rtc"
          ? !this._frigateSource ||
            (this._effectiveFrigateFallback() === "hls"
              ? this._resolver.frigateHlsKey(
                  this._frigateSource,
                  this._lowLatencyHls,
                )
              : this._resolver.frigateMseKey(this._frigateSource)) !==
              expectedKey
          : this._resolver.homeAssistantHlsKey(
              entityId,
              this._lowLatencyHls,
            ) !== expectedKey) ||
        this._selected === "webrtc"
      ) {
        this._releaseUnusedLease(lease);
        return;
      }
      if (this._fallbackLease?.key === expectedKey) {
        this._releaseUnusedLease(lease);
        return;
      }
      this._adoptFallbackLease(lease);
    } catch (error) {
      this._fallbackSnapshot = {
        state: "failed",
        error:
          error instanceof Error ? error.message : "Unable to load fallback",
      };
      this._host.requestUpdate();
    } finally {
      if (this._fallbackPendingKey === expectedKey) {
        this._fallbackPendingKey = undefined;
      }
    }
  }

  private _adoptFallbackLease(lease: MediaSessionLease): void {
    this._fallbackLease = lease;
    this._fallbackUnsubscribe = lease.subscribe((snapshot) => {
      this._fallbackSnapshot = snapshot;
      this._revision += 1;
      if (snapshot.state === "live") {
        if (this._connection === "frigate_go2rtc") lease.markUsable();
        if (!this._selected) {
          snapshot.timing?.mark("presentation_selected");
          this._select("fallback", snapshot.transport, snapshot.video);
        }
        if (this._retryWebRtcAfterFallbackRecovery) {
          this._retryWebRtcAfterFallbackRecovery = false;
          if (
            !this._isFrigateHlsOnly() &&
            this._webRtcSnapshot.state === "failed"
          ) {
            this._webRtcLease?.retry();
          }
        }
      } else if (snapshot.state === "failed" && this._selected === "fallback") {
        this._retryWebRtcAfterFallbackRecovery = !this._isFrigateHlsOnly();
        this._clearSelection();
      }
      this._host.requestUpdate();
    });
  }

  private _select(
    source: PresentedSource,
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
    this._retryWebRtcAfterFallbackRecovery = false;
    this._releaseWebRtc();
    this._releaseFallback();
  }

  private _discardAll(): void {
    this._clearSelection();
    this._webRtcDecoded = false;
    this._retryWebRtcAfterFallbackRecovery = false;
    this._releaseWebRtc(true);
    this._releaseFallback(true);
  }

  private _releaseWebRtc(discard = false): void {
    this._webRtcPendingKey = undefined;
    this._webRtcUnsubscribe?.();
    this._webRtcUnsubscribe = undefined;
    if (discard || this._discardSessionsOnRelease) this._webRtcLease?.discard();
    else this._webRtcLease?.release();
    this._webRtcLease = undefined;
    this._webRtcSnapshot = { state: "new" };
  }

  private _releaseFallback(discard = false): void {
    this._fallbackPendingKey = undefined;
    this._fallbackSnapshot.video?.remove();
    this._fallbackUnsubscribe?.();
    this._fallbackUnsubscribe = undefined;
    if (discard || this._discardSessionsOnRelease)
      this._fallbackLease?.discard();
    else this._fallbackLease?.release();
    this._fallbackLease = undefined;
    this._fallbackSnapshot = { state: "new" };
  }

  private _releaseUnusedLease(lease: MediaSessionLease): void {
    if (this._discardSessionsOnRelease) lease.discard();
    else lease.release();
  }

  private _effectiveFrigateFallback(): FrigateFallbackTransport {
    return this._resolver.frigateTransportPolicy(this._frigateFallback)
      .fallback;
  }

  private _isFrigateHlsOnly(): boolean {
    return (
      this._connection === "frigate_go2rtc" &&
      this._resolver.frigateTransportPolicy(this._frigateFallback).hlsOnly
    );
  }
}
