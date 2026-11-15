import { html, LitElement, nothing } from "lit";

import { MINIMAL_CAMERA_TAG } from "../../../core/constants";
import type {
  FrigateFallbackTransport,
  HomeAssistantActionConfig,
  LiveConnectionType,
} from "../../../core/config";
import type {
  HomeAssistant,
  HomeAssistantApi,
} from "../../../core/home-assistant";
import { performHomeAssistantAction } from "../../../core/home-assistant-actions";
import {
  isMediaFullscreenActive,
  mediaFullscreenSupported,
  toggleMediaFullscreen,
} from "../../../core/fullscreen";
import {
  playMediaElement,
  setMediaElementMuted,
} from "../../../core/media-playback";
import { renderIcon } from "../../../ui/icons";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { CameraAudioController } from "../../camera-presentation/live/audio.controller";
import { CameraLiveSessionController } from "../../camera-presentation/live/session.controller";
import { CameraActivityHighlightController } from "../../camera-presentation/activity-highlight.controller";
import { minimalCameraStyles } from "./minimal-camera.styles";

interface MinimalCameraConfig {
  readonly connection: LiveConnectionType;
  readonly entityId: string;
  readonly frigateFallback: FrigateFallbackTransport;
  readonly lowLatencyHls: boolean;
  readonly posterUrl?: string;
  readonly startUnmutedPcTablet: boolean;
  readonly startUnmutedPhone: boolean;
  readonly title: string;
}

const HOLD_DELAY_MS = 500;
const DOUBLE_TAP_DELAY_MS = 250;

export class MinimalCameraModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    available: { attribute: false, type: Boolean },
    camera: { attribute: false },
    doubleTapAction: { attribute: false },
    hass: { attribute: false },
    holdAction: { attribute: false },
    localize: { attribute: false },
    tapAction: { attribute: false },
  };

  private _activeVideo?: HTMLVideoElement;
  private _attachedWebRtcVideo?: HTMLVideoElement;
  private _holdFired = false;
  private _holdTimer?: ReturnType<typeof setTimeout>;
  private _tapTimer?: ReturnType<typeof setTimeout>;
  private readonly _activity = new CameraActivityHighlightController(this);
  private readonly _audio: CameraAudioController = new CameraAudioController(
    this,
    {
      dismissToast: () => undefined,
      getAutoplayWarning: () => this.localize("camera.autoplay_blocked"),
      getMediaState: (): {
        fallback?: HTMLVideoElement;
        selected?: "fallback" | "webrtc";
        webRtc?: HTMLVideoElement;
      } => ({
        fallback: this._session.fallbackVideo,
        selected: this._session.selected,
        webRtc: this._session.webRtcVideo,
      }),
      showWarning: () => undefined,
    },
  );
  private readonly _session: CameraLiveSessionController =
    new CameraLiveSessionController(this, {
      getInitialMuted: (): boolean => this._audio.muted,
      onActiveVideoChanged: (video) => {
        this._activeVideo = video;
        this._audio.handleActiveVideoChanged(video);
      },
    });

  public api?: HomeAssistantApi;
  public available = false;
  public camera?: MinimalCameraConfig;
  public hass?: HomeAssistant;
  public localize: LocalizeFunction = englishLocalize;
  public tapAction: HomeAssistantActionConfig = { action: "more-info" };
  public holdAction: HomeAssistantActionConfig = { action: "none" };
  public doubleTapAction: HomeAssistantActionConfig = { action: "none" };

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("fullscreenchange", this._handleFullscreenChange);
    document.addEventListener(
      "webkitfullscreenchange",
      this._handleFullscreenChange,
    );
  }

  protected willUpdate(): void {
    const camera = this.camera;
    this._audio.configure(
      camera?.entityId,
      camera?.startUnmutedPcTablet ?? false,
      camera?.startUnmutedPhone ?? false,
      false,
      true,
    );
    this._session.configure(
      this.api,
      camera?.entityId,
      this.available,
      camera?.connection,
      camera?.lowLatencyHls,
      camera?.frigateFallback,
      true,
      false,
    );
    this._activity.configure(this.api, camera?.entityId);
  }

  protected render() {
    const selected = this._session.selected;
    return html`<div
      class=${`viewport${this._activity.classification ? ` activity-${this._activity.classification}` : ""}`}
      role="button"
      tabindex="0"
      aria-label=${this.camera?.title || this.camera?.entityId || this.localize("camera.live")}
      @pointerdown=${this._handlePointerDown}
      @pointerup=${this._handlePointerUp}
      @pointercancel=${this._cancelHold}
      @dblclick=${this._handleDoubleTap}
      @click=${this._handleClick}
      @keydown=${this._handleKeyDown}
    >
      <div class="media">
        ${
          !selected
            ? this.camera?.posterUrl
              ? html`<img src=${this.camera.posterUrl} alt="" />`
              : html`<div class="placeholder" aria-hidden="true">
                  ${renderIcon("camera")}
                </div>`
            : nothing
        }
        <div
          class="video-host fallback"
          ?hidden=${selected !== "fallback"}
        ></div>
        <div
          class=${`video-host webrtc${selected === "webrtc" ? " selected" : ""}`}
        ></div>
      </div>
      <div class="controls">
        <button
          type="button"
          aria-label=${
            this._audio.muted
              ? this.localize("camera.unmute")
              : this.localize("camera.mute")
          }
          @pointerdown=${this._stopControlEvent}
          @click=${this._toggleMute}
        >
          ${renderIcon(this._audio.muted ? "volumeOff" : "volumeOn")}
        </button>
        ${
          mediaFullscreenSupported(this._viewport, this._activeVideo)
            ? html`<button
                type="button"
                aria-label=${this.localize(
                  isMediaFullscreenActive(this._activeVideo)
                    ? "camera.exit_fullscreen"
                    : "camera.enter_fullscreen",
                )}
                @pointerdown=${this._stopControlEvent}
                @click=${this._toggleFullscreen}
              >
                ${renderIcon(
                  isMediaFullscreenActive(this._activeVideo)
                    ? "fullscreenExit"
                    : "fullscreen",
                )}
              </button>`
            : nothing
        }
      </div>
    </div>`;
  }

  protected updated(): void {
    this._attachMedia();
    this._audio.syncMediaState();
  }

  public disconnectedCallback(): void {
    this._cancelHold();
    if (this._tapTimer !== undefined) clearTimeout(this._tapTimer);
    this._detachWebRtcVideo();
    document.removeEventListener(
      "fullscreenchange",
      this._handleFullscreenChange,
    );
    document.removeEventListener(
      "webkitfullscreenchange",
      this._handleFullscreenChange,
    );
    super.disconnectedCallback();
  }

  private get _viewport(): HTMLElement | undefined {
    return this.renderRoot.querySelector<HTMLElement>(".viewport") ?? undefined;
  }

  private _attachMedia(): void {
    const fallback = this._session.fallbackVideo;
    const fallbackHost = this.renderRoot.querySelector<HTMLElement>(
      ".video-host.fallback",
    );
    if (fallback && fallbackHost && fallback.parentElement !== fallbackHost) {
      fallback.autoplay = true;
      fallback.playsInline = true;
      setMediaElementMuted(fallback, this._audio.muted);
      fallbackHost.append(fallback);
      void playMediaElement(fallback).catch(() => undefined);
    }

    const webRtc = this._session.webRtcVideo;
    if (this._attachedWebRtcVideo !== webRtc) {
      this._detachWebRtcVideo();
      this._attachedWebRtcVideo = webRtc;
      for (const event of ["canplay", "loadeddata", "playing"]) {
        webRtc?.addEventListener(event, this._handleWebRtcDecoded);
      }
    }
    const webRtcHost =
      this.renderRoot.querySelector<HTMLElement>(".video-host.webrtc");
    if (webRtc && webRtcHost && webRtc.parentElement !== webRtcHost) {
      webRtc.autoplay = true;
      webRtc.playsInline = true;
      setMediaElementMuted(webRtc, this._audio.muted);
      webRtcHost.append(webRtc);
      void playMediaElement(webRtc).catch(() => undefined);
    }
    if (this._session.selected === "webrtc") {
      this._session.handleWebRtcPresented();
    }
  }

  private _detachWebRtcVideo(): void {
    for (const event of ["canplay", "loadeddata", "playing"]) {
      this._attachedWebRtcVideo?.removeEventListener(
        event,
        this._handleWebRtcDecoded,
      );
    }
    this._attachedWebRtcVideo = undefined;
  }

  private readonly _handleWebRtcDecoded = (event: Event): void => {
    this._session.handleWebRtcDecoded(event.currentTarget as HTMLVideoElement);
  };

  private readonly _handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this._holdFired = false;
    this._cancelHold();
    this._holdTimer = setTimeout(() => {
      this._holdTimer = undefined;
      this._holdFired = true;
      void this._perform(this.holdAction);
    }, HOLD_DELAY_MS);
  };

  private readonly _handlePointerUp = (): void => this._cancelHold();

  private readonly _cancelHold = (): void => {
    if (this._holdTimer !== undefined) clearTimeout(this._holdTimer);
    this._holdTimer = undefined;
  };

  private readonly _handleClick = (): void => {
    if (this._holdFired) {
      this._holdFired = false;
      return;
    }
    if (this._tapTimer !== undefined) return;
    this._tapTimer = setTimeout(() => {
      this._tapTimer = undefined;
      void this._perform(this.tapAction);
    }, DOUBLE_TAP_DELAY_MS);
  };

  private readonly _handleDoubleTap = (event: MouseEvent): void => {
    event.preventDefault();
    if (this._tapTimer !== undefined) clearTimeout(this._tapTimer);
    this._tapTimer = undefined;
    void this._perform(this.doubleTapAction);
  };

  private readonly _handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void this._perform(this.tapAction);
  };

  private _perform(config: HomeAssistantActionConfig): Promise<void> {
    if (!this.camera) return Promise.resolve();
    return performHomeAssistantAction(
      this,
      this.hass,
      config,
      this.camera.entityId,
    );
  }

  private readonly _stopControlEvent = (event: Event): void => {
    event.stopPropagation();
  };

  private readonly _toggleMute = (event: Event): void => {
    event.stopPropagation();
    this._audio.toggleUserMute();
  };

  private readonly _toggleFullscreen = (event: Event): void => {
    event.stopPropagation();
    void toggleMediaFullscreen(this._viewport, this._activeVideo).catch(
      () => undefined,
    );
  };

  private readonly _handleFullscreenChange = (): void => {
    this.requestUpdate();
  };

  static styles = minimalCameraStyles;
}

if (!customElements.get(MINIMAL_CAMERA_TAG)) {
  customElements.define(MINIMAL_CAMERA_TAG, MinimalCameraModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [MINIMAL_CAMERA_TAG]: MinimalCameraModule;
  }
}
