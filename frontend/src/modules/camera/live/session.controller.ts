import type { ReactiveController, ReactiveControllerHost } from "lit";

import { LiveSourceResolver } from "../../../providers/live-source-resolver";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  type MediaSessionLease,
  type MediaSessionSnapshot,
  type MediaTransport,
} from "../../../core/media-session-manager";

import type { PresentedSource } from "./media-presentation";

interface SessionControllerCallbacks {
  getInitialMuted(): boolean;
  onActiveVideoChanged(video: HTMLVideoElement | undefined): void;
  onHlsSelected(video: HTMLVideoElement | undefined): void;
  onPresentedTransportChanged(transport: MediaTransport | undefined): void;
}

/** Owns live-session leases, transport selection, and retained handoff. */
export class LiveSessionController implements ReactiveController {
  private _api?: HomeAssistantApi;
  private _available = false;
  private _connected = false;
  private _entityId?: string;
  private _hlsLease?: MediaSessionLease;
  private _hlsSnapshot: MediaSessionSnapshot = { state: "new" };
  private _hlsUnsubscribe?: () => void;
  private _revision = 0;
  private _selected?: PresentedSource;
  private _transport?: MediaTransport;
  private _webRtcDecoded = false;
  private _webRtcLease?: MediaSessionLease;
  private _webRtcSnapshot: MediaSessionSnapshot = { state: "new" };
  private _webRtcUnsubscribe?: () => void;
  private readonly _resolver = new LiveSourceResolver();

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _callbacks: SessionControllerCallbacks,
  ) {
    _host.addController(this);
  }

  public get error(): string | undefined {
    if (!this._available) return "Camera entity is unavailable";
    return this._webRtcSnapshot.state === "failed" &&
      this._hlsSnapshot.state === "failed"
      ? (this._webRtcSnapshot.error ?? this._hlsSnapshot.error)
      : undefined;
  }

  public get hlsVideo(): HTMLVideoElement | undefined {
    return this._hlsSnapshot.video;
  }

  public get selected(): PresentedSource | undefined {
    return this._selected;
  }

  public get revision(): number {
    return this._revision;
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
  ): void {
    const identityChanged = this._api?.identity !== api?.identity;
    const sourceChanged = this._entityId !== entityId;
    this._api = api;
    this._entityId = entityId;
    this._available = available;
    if (identityChanged || sourceChanged || !available) this._releaseAll();
    this._sync();
    this._host.requestUpdate();
  }

  public handleWebRtcDecoded(video: HTMLVideoElement): void {
    if (this._webRtcDecoded || !this._webRtcSnapshot.stream) return;
    this._webRtcDecoded = true;
    this._webRtcSnapshot.timing?.mark("first_frame_decoded");
    this._webRtcSnapshot.timing?.mark("presentation_selected");
    this._select("webrtc", this._webRtcSnapshot.transport, video);
    this._releaseHls(true);
  }

  public retry(): void {
    this._webRtcLease?.retry();
    this._hlsLease?.retry();
    this._host.requestUpdate();
  }

  private _sync(): void {
    if (!this._connected || !this._api || !this._entityId || !this._available) {
      this._releaseAll();
      return;
    }
    if (!this._resolver.webRtcEligible) {
      this._releaseWebRtc();
      this._syncHls();
      return;
    }
    const key = `ha_direct:webrtc:${this._entityId}`;
    if (this._webRtcLease?.key !== key) {
      this._releaseWebRtc();
      this._webRtcLease = this._resolver.acquireWebRtc(
        this._api,
        this._entityId,
      );
      this._webRtcUnsubscribe = this._webRtcLease.subscribe((snapshot) => {
        this._webRtcSnapshot = snapshot;
        this._revision += 1;
        if (snapshot.state === "failed" && this._selected === "webrtc") {
          this._clearSelection();
          this._syncHls();
        }
        this._host.requestUpdate();
      });
    }
    this._syncHls();
  }

  private _syncHls(): void {
    if (
      this._selected === "webrtc" ||
      !this._api ||
      !this._entityId ||
      !this._available ||
      !this._connected
    ) {
      return;
    }
    const key = this._resolver.hlsSessionKey(this._entityId);
    if (this._hlsLease?.key === key) return;
    this._releaseHls();
    this._hlsLease = this._resolver.acquireHls(this._api, this._entityId, {
      initialMuted: this._callbacks.getInitialMuted(),
    });
    this._hlsUnsubscribe = this._hlsLease.subscribe((snapshot) => {
      this._hlsSnapshot = snapshot;
      this._revision += 1;
      if (snapshot.state === "live" && !this._selected) {
        snapshot.timing?.mark("presentation_selected");
        this._callbacks.onHlsSelected(snapshot.video);
        this._select("hls", snapshot.transport, snapshot.video);
      } else if (snapshot.state === "failed" && this._selected === "hls") {
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
    this._callbacks.onActiveVideoChanged(video);
    if (transport && transport !== this._transport) {
      this._transport = transport;
      this._callbacks.onPresentedTransportChanged(transport);
    }
    this._host.requestUpdate();
  }

  private _clearSelection(): void {
    if (!this._selected && !this._transport) return;
    this._selected = undefined;
    this._transport = undefined;
    this._callbacks.onActiveVideoChanged(undefined);
    this._callbacks.onPresentedTransportChanged(undefined);
  }

  private _releaseAll(): void {
    this._clearSelection();
    this._webRtcDecoded = false;
    this._releaseWebRtc();
    this._releaseHls();
  }

  private _releaseWebRtc(): void {
    this._webRtcUnsubscribe?.();
    this._webRtcUnsubscribe = undefined;
    this._webRtcLease?.release();
    this._webRtcLease = undefined;
    this._webRtcSnapshot = { state: "new" };
  }

  private _releaseHls(discard = false): void {
    this._hlsSnapshot.video?.remove();
    this._hlsUnsubscribe?.();
    this._hlsUnsubscribe = undefined;
    if (discard) this._hlsLease?.discard();
    else this._hlsLease?.release();
    this._hlsLease = undefined;
    this._hlsSnapshot = { state: "new" };
  }
}
