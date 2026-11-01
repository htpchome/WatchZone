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
  private _lease?: MediaSessionLease;
  private _snapshot: MediaSessionSnapshot = { state: "new" };
  private _unsubscribe?: () => void;

  public set api(value: HomeAssistantApi | undefined) {
    if (this._api?.identity === value?.identity) {
      return;
    }
    this._api = value;
    this._syncLease();
  }

  public set available(value: boolean) {
    if (this._available === value) {
      return;
    }
    this._available = value;
    this._syncLease();
    this.requestUpdate();
  }

  public set entityId(value: string | undefined) {
    if (this._entityId === value) {
      return;
    }
    this._entityId = value;
    this._syncLease();
    this.requestUpdate();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._syncLease();
  }

  public disconnectedCallback(): void {
    this._releaseLease();
    this._detachVideo();
    super.disconnectedCallback();
  }

  protected render() {
    const error = !this._available
      ? "Camera entity is unavailable"
      : this._snapshot.error;
    return html`
      <div class="viewport">
        <video autoplay playsinline muted aria-label="Live camera"></video>
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
            : this._snapshot.state !== "live"
              ? html`<div class="status" role="status">Connecting…</div>`
              : nothing
        }
      </div>
    `;
  }

  protected updated(): void {
    const video = this.renderRoot.querySelector("video");
    const stream = this._snapshot.stream;
    if (video && video.srcObject !== (stream ?? null)) {
      video.srcObject = stream ?? null;
      video.muted = true;
      if (stream) {
        void video.play().catch(() => undefined);
      }
    }
  }

  private _syncLease(): void {
    if (
      !this.isConnected ||
      !this._api ||
      !this._entityId ||
      !this._available
    ) {
      this._releaseLease();
      return;
    }
    const key = `home_assistant:${this._entityId}`;
    if (this._lease?.key === key) {
      return;
    }
    this._releaseLease();
    this._lease = getMediaSessionManager().acquireHomeAssistant(
      this._api,
      this._entityId,
    );
    this._unsubscribe = this._lease.subscribe((snapshot) => {
      this._snapshot = snapshot;
      this.requestUpdate();
    });
  }

  private _releaseLease(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._lease?.release();
    this._lease = undefined;
    this._snapshot = { state: "new" };
  }

  private _detachVideo(): void {
    const video = this.renderRoot.querySelector("video");
    if (video) {
      video.srcObject = null;
    }
  }

  private readonly _retry = (): void => this._lease?.retry();

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

    video {
      display: block;
      inline-size: 100%;
      block-size: 100%;
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
