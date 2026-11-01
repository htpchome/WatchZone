import { css, html, LitElement, nothing } from "lit";

import type { HomeAssistantApi } from "../../core/home-assistant";
import { LIVE_TAG } from "../../core/constants";
import {
  getMediaSessionManager,
  type MediaSessionLease,
  type MediaSessionSnapshot,
} from "../../core/media-session-manager";

export class WatchZoneLive extends LitElement {
  private _api?: HomeAssistantApi;
  private _available = false;
  private _entityId?: string;
  private _hlsLease?: MediaSessionLease;
  private _hlsSnapshot: MediaSessionSnapshot = { state: "new" };
  private _hlsUnsubscribe?: () => void;
  private _selected?: "hls" | "webrtc";
  private _webRtcDecoded = false;
  private _webRtcLease?: MediaSessionLease;
  private _webRtcSnapshot: MediaSessionSnapshot = { state: "new" };
  private _webRtcUnsubscribe?: () => void;

  public set api(value: HomeAssistantApi | undefined) {
    if (this._api?.identity === value?.identity) {
      return;
    }
    this._releaseLeases();
    this._api = value;
    this._syncLeases();
  }

  public set available(value: boolean) {
    if (this._available === value) {
      return;
    }
    this._available = value;
    this._syncLeases();
    this.requestUpdate();
  }

  public set entityId(value: string | undefined) {
    if (this._entityId === value) {
      return;
    }
    this._releaseLeases();
    this._entityId = value;
    this._syncLeases();
    this.requestUpdate();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._syncLeases();
  }

  public disconnectedCallback(): void {
    this._releaseLeases();
    super.disconnectedCallback();
  }

  protected render() {
    const error = !this._available
      ? "Camera entity is unavailable"
      : this._webRtcSnapshot.state === "failed" &&
          this._hlsSnapshot.state === "failed"
        ? (this._webRtcSnapshot.error ?? this._hlsSnapshot.error)
        : undefined;
    return html`
      <div class="viewport">
        <div class="hls-host" ?hidden=${this._selected !== "hls"}></div>
        <video
          class="webrtc"
          autoplay
          playsinline
          muted
          aria-label="Live camera"
          ?hidden=${this._selected !== "webrtc"}
          @loadeddata=${this._handleWebRtcLoadedData}
        ></video>
        ${
          error
            ? html`<div class="status error" role="alert">
                <span>${error}</span>
                ${
                  this._available
                    ? html`<button type="button" @click=${this._retry}>
                        Retry
                      </button>`
                    : nothing
                }
              </div>`
            : !this._selected
              ? html`<div class="status" role="status">Connecting…</div>`
              : nothing
        }
      </div>
    `;
  }

  protected updated(): void {
    const video =
      this.shadowRoot?.querySelector<HTMLVideoElement>("video.webrtc");
    const stream = this._webRtcSnapshot.stream;
    if (video && video.srcObject !== (stream ?? null)) {
      this._webRtcDecoded = false;
      video.srcObject = stream ?? null;
      video.muted = true;
      if (stream) {
        void video.play().catch(() => undefined);
      }
    }
    const hlsHost = this.renderRoot.querySelector(".hls-host");
    const hlsVideo = this._hlsSnapshot.video;
    if (hlsHost && hlsVideo && hlsVideo.parentElement !== hlsHost) {
      hlsVideo.setAttribute("aria-label", "Live camera");
      hlsHost.append(hlsVideo);
      void hlsVideo.play().catch(() => undefined);
    }
  }

  private _syncLeases(): void {
    if (
      !this.isConnected ||
      !this._api ||
      !this._entityId ||
      !this._available
    ) {
      this._releaseLeases();
      return;
    }
    const manager = getMediaSessionManager();
    const webRtcKey = `home_assistant:${this._entityId}`;
    if (this._webRtcLease?.key !== webRtcKey) {
      this._releaseWebRtcLease();
      this._webRtcLease = manager.acquireHomeAssistant(
        this._api,
        this._entityId,
      );
      this._webRtcUnsubscribe = this._webRtcLease.subscribe((snapshot) => {
        this._webRtcSnapshot = snapshot;
        if (snapshot.state === "failed" && this._selected === "webrtc") {
          this._selected = undefined;
          this._syncHlsLease();
        }
        this.requestUpdate();
      });
    }
    this._syncHlsLease();
  }

  private _syncHlsLease(): void {
    if (
      this._selected === "webrtc" ||
      !this._api ||
      !this._entityId ||
      !this._available ||
      !this.isConnected
    ) {
      return;
    }
    const key = `home_assistant_hls:${this._entityId}`;
    if (this._hlsLease?.key === key) {
      return;
    }
    this._releaseHlsLease();
    this._hlsLease = getMediaSessionManager().acquireHomeAssistantHls(
      this._api,
      this._entityId,
    );
    this._hlsUnsubscribe = this._hlsLease.subscribe((snapshot) => {
      this._hlsSnapshot = snapshot;
      if (snapshot.state === "live" && !this._selected) {
        this._selected = "hls";
      } else if (snapshot.state === "failed" && this._selected === "hls") {
        this._selected = undefined;
      }
      this.requestUpdate();
    });
  }

  private _releaseLeases(): void {
    this._selected = undefined;
    this._webRtcDecoded = false;
    this._releaseWebRtcLease();
    this._releaseHlsLease();
  }

  private _releaseWebRtcLease(): void {
    this._webRtcUnsubscribe?.();
    this._webRtcUnsubscribe = undefined;
    this._webRtcLease?.release();
    this._webRtcLease = undefined;
    this._webRtcSnapshot = { state: "new" };
    const video =
      this.shadowRoot?.querySelector<HTMLVideoElement>("video.webrtc");
    if (video) {
      video.srcObject = null;
    }
  }

  private _releaseHlsLease(discard = false): void {
    this._hlsSnapshot.video?.remove();
    this._hlsUnsubscribe?.();
    this._hlsUnsubscribe = undefined;
    if (discard) {
      this._hlsLease?.discard();
    } else {
      this._hlsLease?.release();
    }
    this._hlsLease = undefined;
    this._hlsSnapshot = { state: "new" };
  }

  private readonly _retry = (): void => {
    this._webRtcLease?.retry();
    this._hlsLease?.retry();
  };

  private readonly _handleWebRtcLoadedData = (): void => {
    if (this._webRtcDecoded || !this._webRtcSnapshot.stream) {
      return;
    }
    this._webRtcDecoded = true;
    this._webRtcSnapshot.timing?.mark("first_frame_decoded");
    this._selected = "webrtc";
    this._releaseHlsLease(true);
    this.requestUpdate();
  };

  static styles = css`
    :host {
      display: block;
      inline-size: 100%;
      min-inline-size: 0;
      min-block-size: 0;
      color: var(--wzc-text-color, var(--primary-text-color));
    }

    .viewport {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: var(--wzc-live-background, var(--secondary-background-color));
      border-radius: var(--wzc-live-radius, var(--ha-border-radius-lg, 8px));
    }

    .hls-host,
    video {
      position: absolute;
      inset: 0;
      display: block;
      inline-size: 100%;
      block-size: 100%;
    }

    .hls-host[hidden],
    video[hidden] {
      display: none;
    }

    .hls-host video,
    video {
      object-fit: var(--wzc-live-fit, contain);
      background: inherit;
    }

    .status {
      position: absolute;
      inset: 0;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 0.75rem;
      padding: 1rem;
      text-align: center;
      background: color-mix(
        in srgb,
        var(--wzc-live-background, var(--secondary-background-color)) 88%,
        transparent
      );
    }

    .error {
      color: var(--ha-color-text-error, var(--error-color));
    }

    button {
      min-block-size: 2.5rem;
      padding-inline: 1rem;
      color: var(--ha-color-text-primary, var(--primary-text-color));
      background: var(--ha-color-fill-primary-normal-resting, transparent);
      border: 1px solid
        var(--ha-color-border-neutral-normal, var(--divider-color));
      border-radius: var(--ha-border-radius-button, 999px);
      font: inherit;
      cursor: pointer;
    }
  `;
}

if (!customElements.get(LIVE_TAG)) {
  customElements.define(LIVE_TAG, WatchZoneLive);
}

declare global {
  interface HTMLElementTagNameMap {
    "watchzone-card-live": WatchZoneLive;
  }
}
