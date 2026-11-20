import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  MEDIA_CONTROL_EVENT,
  MEDIA_CONTROLS_TAG,
  MEDIA_OVERLAY_INTERACTION_EVENT,
  RECORDED_MEDIA_DIMENSIONS_EVENT,
  RECORDED_VIDEO_TRANSPORT_EVENT,
  RECORDED_VIDEO_TRANSPORT_HOLD_EVENT,
  RECORDED_VIDEO_TRANSPORT_TAG,
  RECORDED_VIDEO_PLAYER_TAG,
  RECORDED_MEDIA_ERROR_EVENT,
  RECORDED_MEDIA_EXPORT_EVENT,
  RECORDING_SEGMENT_MANAGER_EVENT,
  RECORDING_SEGMENT_STATE_EVENT,
  RECORDING_SEGMENT_MANAGER_TAG,
  RECORDING_SCRUBBER_EVENT,
  RECORDING_SCRUBBER_TAG,
} from "../../core/constants";
import type { HomeAssistantApi } from "../../core/home-assistant";
import {
  isMediaFullscreenActive,
  mediaFullscreenSupported,
  toggleMediaFullscreen,
} from "../../core/fullscreen";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import {
  playMediaElement,
  setMediaElementMuted,
} from "../../core/media-playback";
import {
  isPictureInPictureActive,
  pictureInPictureMethod,
  refreshNativePictureInPictureSuppression,
  togglePictureInPicture,
} from "../../core/picture-in-picture";
import type {
  RecordedMediaDimensions,
  RecordedMediaExportIntent,
  RecordedMediaRequest,
  RecordingTimeline,
} from "../../core/recorded-media";
import { ZoomController } from "../../ui/zoom";
import { MediaOverlayVisibilityController } from "../../ui/media-overlay-visibility.controller";
import type {
  MediaControlDescriptor,
  MediaControlEventDetail,
} from "../../ui/media-controls-overlay";
import { releaseTouchFocus } from "../../ui/control-interaction";
import "../../ui/media-controls-overlay";
import { RecordedMediaPlaybackController } from "./recorded-media-playback.controller";
import { recordedVideoPlayerStyles } from "./recorded-video-player.styles";
import {
  RecordingSegmentController,
  type RecordingSegmentSelection,
} from "./recording-segment.controller";
import type { RecordingSegmentManagerAction } from "./recording-segment-manager";
import "./recording-segment-manager";
import type {
  RecordedVideoTransportEventDetail,
  RecordedVideoTransportHoldDetail,
} from "./transport-controls";
import "./transport-controls";
import type { RecordingScrubberEventDetail } from "./recording-scrubber";
import "./recording-scrubber";

const mediaControlsTag = unsafeStatic(MEDIA_CONTROLS_TAG);
const mediaControlEvent = unsafeStatic(MEDIA_CONTROL_EVENT);
const mediaOverlayInteractionEvent = unsafeStatic(
  MEDIA_OVERLAY_INTERACTION_EVENT,
);
const transportTag = unsafeStatic(RECORDED_VIDEO_TRANSPORT_TAG);
const transportEvent = unsafeStatic(RECORDED_VIDEO_TRANSPORT_EVENT);
const transportHoldEvent = unsafeStatic(RECORDED_VIDEO_TRANSPORT_HOLD_EVENT);
const recordingScrubberTag = unsafeStatic(RECORDING_SCRUBBER_TAG);
const recordingScrubberEvent = unsafeStatic(RECORDING_SCRUBBER_EVENT);
const recordingSegmentManagerTag = unsafeStatic(RECORDING_SEGMENT_MANAGER_TAG);
const recordingSegmentManagerEvent = unsafeStatic(
  RECORDING_SEGMENT_MANAGER_EVENT,
);
type RecordedVideoControlAction = "fullscreen" | "picture_in_picture";
const PLAYBACK_RATES = [0.25, 0.5, 1, 2, 5, 10, 25] as const;
/** Ephemeral recorded-media playback engine. */
export class RecordedVideoPlayer extends LitElement {
  public static properties = {
    api: { attribute: false },
    localize: { attribute: false },
    request: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public localize: LocalizeFunction = englishLocalize;
  public request?: RecordedMediaRequest;

  /** The stable viewport whose height is controlled by a presentation shell. */
  public get presentationSurface(): HTMLElement | undefined {
    return this._viewport();
  }

  public setBasePresentationScale(scale: number): void {
    this._zoom.setBasePresentationScale(scale);
  }

  public beginStageResizeReturn(): void {
    this._zoom.beginStageResizeReturn();
  }

  public updateStageResizeReturn(progress: number): void {
    this._zoom.updateStageResizeReturn(progress);
  }

  public endStageResizeReturn(): void {
    this._zoom.endStageResizeReturn();
  }

  public readonly toggleSegmentSelection = async (): Promise<void> => {
    const timeline = this.request?.timeline;
    if (!timeline) return;
    if (this._segment.active) {
      await this._restoreOriginalPlayback(this._previewTimestamp());
      this._segment.cancel();
    } else {
      this._segment.activate(timeline);
    }
    this._emitSegmentState();
  };

  private _fullscreenActive = false;
  private _currentTime = 0;
  private _duration = 0;
  private _muted = true;
  private _nativePlaybackRate = 1;
  private _paused = true;
  private _pictureInPictureActive = false;
  private _playbackRate = 1;
  private _segmentPreviewActive = false;
  private _segmentPreviewGeneration = 0;
  private _segmentPreviewTimeline?: RecordingTimeline;
  private _rateAccelerationFrame?: number;
  private _rateAccelerationTimestamp?: number;
  private _transportHoldRelease?: () => void;
  private _volume = 1;
  private readonly _overlay = new MediaOverlayVisibilityController(this);
  private readonly _zoom = new ZoomController(this, {
    onActivation: (input) =>
      input === "touch"
        ? this._overlay.revealFromTouch()
        : this._overlay.reveal(),
    onTouchInteraction: () => this._overlay.revealFromTouch(),
  });
  private readonly _playback = new RecordedMediaPlaybackController(
    () => this.api,
    () => this._reportError(),
    () => this._handlePlaybackReady(),
  );
  private readonly _segment = new RecordingSegmentController(
    () => this.api,
    () => this.requestUpdate(),
    (operation) =>
      this._reportControlError(
        this.localize(
          operation === "preview"
            ? "recording_segments.preview_failed"
            : operation === "export"
              ? "recording_segments.export_failed"
              : "recording_segments.download_failed",
        ),
      ),
    (intent) => this._dispatchExport(intent),
  );

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("fullscreenchange", this._syncControlState);
    document.addEventListener("webkitfullscreenchange", this._syncControlState);
  }

  public disconnectedCallback(): void {
    document.removeEventListener("fullscreenchange", this._syncControlState);
    document.removeEventListener(
      "webkitfullscreenchange",
      this._syncControlState,
    );
    this._releaseTransportHold();
    this._stopRateAcceleration();
    this._playback.stop(this._video());
    super.disconnectedCallback();
  }

  protected render() {
    const video = this._video();
    const timeline = this.request?.timeline;
    const fullscreenSupported = mediaFullscreenSupported(
      this._viewport(),
      video,
    );
    const pictureInPictureSupported = Boolean(pictureInPictureMethod(video));
    const controls: readonly MediaControlDescriptor<RecordedVideoControlAction>[] =
      [
        {
          action: "picture_in_picture",
          active: this._pictureInPictureActive,
          disabled: !pictureInPictureSupported,
          icon: "pipPopOut",
          label: this.localize(
            this._pictureInPictureActive
              ? "media_player.exit_pip"
              : "media_player.enter_pip",
          ),
        },
        {
          action: "fullscreen",
          active: this._fullscreenActive,
          disabled: !fullscreenSupported,
          icon: this._fullscreenActive ? "fullscreenExit" : "fullscreen",
          label: this.localize(
            this._fullscreenActive
              ? "media_player.exit_fullscreen"
              : "media_player.enter_fullscreen",
          ),
        },
      ];
    return staticHtml`<div
      class="viewport"
      tabindex="0"
      aria-label=${this.localize("media_player.zoom_view", {
        percent: Math.round(this._zoom.scale * 100),
      })}
      @pointerenter=${this._overlay.handlePointerEnter}
      @pointerleave=${this._overlay.handlePointerLeave}
      @pointerdown=${this._overlay.handlePointerDown}
      @pointermove=${this._overlay.handlePointerMove}
      @pointerup=${this._overlay.handlePointerEnd}
      @pointercancel=${this._overlay.handlePointerEnd}
      @focusin=${this._overlay.handleFocusIn}
      @focusout=${this._overlay.handleFocusOut}
    >
      <div class="media-surface">
        <div class="media-host">
          <video
            autoplay
            muted
            playsinline
            preload="auto"
            poster=${this.request?.posterUrl ?? ""}
            @loadedmetadata=${this._handleMediaDimensionsChanged}
            @resize=${this._handleMediaDimensionsChanged}
            @emptied=${this._handleMediaDimensionsChanged}
            @durationchange=${this._syncControlState}
            @timeupdate=${this._syncControlState}
            @play=${this._syncControlState}
            @pause=${this._syncControlState}
            @ended=${this._handleSegmentPreviewEnded}
            @volumechange=${this._syncControlState}
            @enterpictureinpicture=${this._syncControlState}
            @leavepictureinpicture=${this._syncControlState}
            @webkitpresentationmodechanged=${this._syncControlState}
          ></video>
        </div>
      </div>
      <${mediaControlsTag}
        class="player-tools"
        .controls=${controls}
        .label=${this.localize("media_player.controls")}
        .visible=${this._overlay.visible}
        .viewportEdge=${this._fullscreenActive}
        @${mediaControlEvent}=${this._handleControl}
        @${mediaOverlayInteractionEvent}=${this._handleOverlayControlInteraction}
      ></${mediaControlsTag}>
      <${transportTag}
        .currentTime=${this._currentTime}
        .duration=${this._duration}
        .localize=${this.localize}
        .muted=${this._muted}
        .paused=${this._paused}
        .visible=${this._overlay.visible}
        .viewportEdge=${this._fullscreenActive}
        .volume=${this._volume}
        @${transportEvent}=${this._handleTransport}
        @${transportHoldEvent}=${this._handleTransportHold}
      ></${transportTag}>
    </div>
    <slot name="media-resize-handle"></slot>
    ${
      timeline
        ? staticHtml`<${recordingScrubberTag}
            .api=${this.api}
            .currentTimestamp=${mediaTimeToRecordingTimestamp(
              this._currentTime,
              this._duration,
              this._segmentPreviewTimeline ?? timeline,
            )}
            .localize=${this.localize}
            .paused=${this._paused}
            .segmentActive=${this._segment.active}
            .segmentSelection=${this._segment.selection}
            .timeline=${timeline}
            @${recordingScrubberEvent}=${this._handleRecordingScrubber}
          ></${recordingScrubberTag}>`
        : null
    }
    ${
      timeline
        ? staticHtml`<div class="playback-options">
            <span class="rate-label"
              >${this.localize("media_player.playback_speed")}</span
            >
            <div
              class="rate-control"
              role="group"
              aria-label=${this.localize("media_player.playback_speed")}
              @click=${stopPropagation}
              @keydown=${stopPropagation}
            >
              <button
                class="rate-step decrease"
                type="button"
                title=${this.localize("media_player.decrease_speed")}
                aria-label=${this.localize("media_player.decrease_speed")}
                ?disabled=${this._playbackRate === PLAYBACK_RATES[0]}
                @pointerup=${releaseTouchFocus}
                @click=${this._decreasePlaybackRate}
              >−</button>
              <ha-dropdown
                class="rate-dropdown"
                placement="top-end"
                @wa-select=${this._selectPlaybackRate}
              >
                <button
                  class="rate-trigger"
                  type="button"
                  slot="trigger"
                  aria-label=${this.localize("media_player.playback_speed")}
                >
                  <span>${formatPlaybackRate(this._playbackRate)}</span>
                  <ha-icon icon="mdi:menu-down" aria-hidden="true"></ha-icon>
                </button>
                ${PLAYBACK_RATES.map(
                  (rate) => staticHtml`<ha-dropdown-item
                    value=${String(rate)}
                    ?selected=${this._playbackRate === rate}
                    >${formatPlaybackRate(rate)}</ha-dropdown-item
                  >`,
                )}
              </ha-dropdown>
              <button
                class="rate-step increase"
                type="button"
                title=${this.localize("media_player.increase_speed")}
                aria-label=${this.localize("media_player.increase_speed")}
                ?disabled=${
                  this._playbackRate ===
                  PLAYBACK_RATES[PLAYBACK_RATES.length - 1]
                }
                @pointerup=${releaseTouchFocus}
                @click=${this._increasePlaybackRate}
              >+</button>
            </div>
          </div>`
        : null
    }
    ${
      timeline && this._segment.active
        ? staticHtml`<${recordingSegmentManagerTag}
            .downloading=${this._segment.downloading}
            .exporting=${this._segment.exporting}
            .locale=${this.api?.locale}
            .localize=${this.localize}
            .previewing=${this._segmentPreviewActive}
            .selection=${this._segment.selection}
            @${recordingSegmentManagerEvent}=${this._handleSegmentManager}
          ></${recordingSegmentManagerTag}>`
        : null
    }`;
  }

  protected firstUpdated(): void {
    this._observeMediaPresentation();
    void this._loadRequest();
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request")) {
      this._playbackRate = 1;
      this._segmentPreviewActive = false;
      this._segmentPreviewTimeline = undefined;
      this._segmentPreviewGeneration += 1;
      this.toggleAttribute(
        "recording-timeline",
        Boolean(this.request?.timeline),
      );
      this._zoom.configure(this.request?.id);
      this._segment.configure(this.request?.timeline);
    }
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("request") && changed.get("request") !== undefined) {
      void this._loadRequest();
    }
    this._observeMediaPresentation();
    refreshNativePictureInPictureSuppression(this._video());
  }

  private async _loadRequest(): Promise<void> {
    const video = this._video();
    const request = this.request;
    if (!video || !request) return;
    this._applyPlaybackRate(video);
    this._syncControlState();
    await this._playback.load(video, request);
    this._applyPlaybackRate(video);
  }

  private _video(): HTMLVideoElement | undefined {
    return (
      this.renderRoot.querySelector<HTMLVideoElement>("video") ?? undefined
    );
  }

  private _viewport(): HTMLElement | undefined {
    return this.renderRoot.querySelector<HTMLElement>(".viewport") ?? undefined;
  }

  private _observeMediaPresentation(): void {
    this._zoom.attach(this._viewport(), this._video());
  }

  private readonly _handleMediaDimensionsChanged = (): void => {
    this._syncMediaDimensions();
    refreshNativePictureInPictureSuppression(this._video());
    this._syncControlState();
  };

  private _handlePlaybackReady(): void {
    this._syncMediaDimensions();
    this._syncControlState();
  }

  private _syncMediaDimensions(): void {
    const video = this._video();
    const width = video?.videoWidth ?? 0;
    const height = video?.videoHeight ?? 0;
    if (width > 0 && height > 0) {
      this._zoom.setMediaDimensions(width, height);
      this.dispatchEvent(
        new CustomEvent<RecordedMediaDimensions>(
          RECORDED_MEDIA_DIMENSIONS_EVENT,
          {
            bubbles: true,
            composed: true,
            detail: { height, width },
          },
        ),
      );
    }
  }

  private readonly _syncControlState = (): void => {
    const video = this._video();
    const muted = video?.muted ?? true;
    const paused = video?.paused ?? true;
    const currentTime = finiteMediaValue(video?.currentTime);
    const duration = finiteMediaValue(video?.duration);
    const volume = finiteVolume(video?.volume);
    const fullscreenActive = isMediaFullscreenActive(video);
    const pictureInPictureActive = isPictureInPictureActive(video);
    if (
      muted === this._muted &&
      paused === this._paused &&
      currentTime === this._currentTime &&
      duration === this._duration &&
      volume === this._volume &&
      fullscreenActive === this._fullscreenActive &&
      pictureInPictureActive === this._pictureInPictureActive
    ) {
      return;
    }
    this._muted = muted;
    const pausedChanged = paused !== this._paused;
    this._paused = paused;
    this._currentTime = currentTime;
    this._duration = duration;
    this._volume = volume;
    this._fullscreenActive = fullscreenActive;
    this._pictureInPictureActive = pictureInPictureActive;
    if (pausedChanged) this._syncRateAcceleration();
    this.requestUpdate();
  };

  private readonly _toggleMute = (): void => {
    const video = this._video();
    if (!video) return;
    setMediaElementMuted(video, !video.muted);
    if (!video.muted) void playMediaElement(video);
    this._syncControlState();
  };

  private readonly _togglePlayback = async (): Promise<void> => {
    const video = this._video();
    if (!video) return;
    if (video.paused) {
      try {
        await playMediaElement(video);
      } catch {
        this._reportError();
      }
    } else video.pause();
    this._syncControlState();
  };

  private _seek(value: number): void {
    const video = this._video();
    if (!video || !Number.isFinite(value)) return;
    video.currentTime = Math.max(
      0,
      Math.min(value, finiteMediaValue(video.duration)),
    );
    this._syncControlState();
  }

  private _setVolume(value: number): void {
    const video = this._video();
    if (!video || !Number.isFinite(value)) return;
    const volume = finiteVolume(value);
    setMediaElementMuted(video, volume === 0);
    video.volume = volume;
    this._syncControlState();
  }

  private _setPlaybackRate(value: number): void {
    const video = this._video();
    if (
      !video ||
      !PLAYBACK_RATES.includes(value as (typeof PLAYBACK_RATES)[number])
    ) {
      return;
    }
    this._playbackRate = value;
    this._applyPlaybackRate(video);
    this.requestUpdate();
  }

  private _applyPlaybackRate(video: HTMLVideoElement): void {
    let nativeRate = this._playbackRate;
    try {
      video.defaultPlaybackRate = nativeRate;
      video.playbackRate = nativeRate;
    } catch {
      nativeRate =
        [...PLAYBACK_RATES]
          .reverse()
          .find((rate) => rate < this._playbackRate) ?? 1;
      video.defaultPlaybackRate = nativeRate;
      video.playbackRate = nativeRate;
    }
    this._nativePlaybackRate = nativeRate;
    this._syncRateAcceleration();
  }

  private _syncRateAcceleration(): void {
    this._stopRateAcceleration();
    const video = this._video();
    if (
      !video ||
      video.paused ||
      this._playbackRate <= this._nativePlaybackRate
    ) {
      return;
    }
    const tick = (timestamp: number): void => {
      if (
        video.paused ||
        this._playbackRate <= this._nativePlaybackRate ||
        !video.isConnected
      ) {
        this._stopRateAcceleration();
        return;
      }
      const previous = this._rateAccelerationTimestamp ?? timestamp;
      const elapsed = Math.min(
        0.25,
        Math.max(0, (timestamp - previous) / 1000),
      );
      this._rateAccelerationTimestamp = timestamp;
      const duration = finiteMediaValue(video.duration);
      if (duration > 0) {
        video.currentTime = Math.min(
          duration,
          video.currentTime +
            elapsed * (this._playbackRate - this._nativePlaybackRate),
        );
      }
      this._rateAccelerationFrame = requestAnimationFrame(tick);
    };
    this._rateAccelerationFrame = requestAnimationFrame(tick);
  }

  private _stopRateAcceleration(): void {
    if (this._rateAccelerationFrame !== undefined) {
      cancelAnimationFrame(this._rateAccelerationFrame);
    }
    this._rateAccelerationFrame = undefined;
    this._rateAccelerationTimestamp = undefined;
  }

  private readonly _decreasePlaybackRate = (): void => {
    const index = PLAYBACK_RATES.indexOf(
      this._playbackRate as (typeof PLAYBACK_RATES)[number],
    );
    this._setPlaybackRate(PLAYBACK_RATES[Math.max(0, index - 1)] ?? 1);
  };

  private readonly _increasePlaybackRate = (): void => {
    const index = PLAYBACK_RATES.indexOf(
      this._playbackRate as (typeof PLAYBACK_RATES)[number],
    );
    this._setPlaybackRate(
      PLAYBACK_RATES[Math.min(PLAYBACK_RATES.length - 1, index + 1)] ?? 1,
    );
  };

  private readonly _selectPlaybackRate = (
    event: CustomEvent<{ readonly item?: HTMLElement & { value?: string } }>,
  ): void => {
    event.stopPropagation();
    const item = event.detail.item;
    this._setPlaybackRate(Number(item?.value ?? item?.getAttribute("value")));
  };

  private readonly _toggleFullscreen = async (): Promise<void> => {
    const video = this._video();
    const viewport = this._viewport();
    if (!mediaFullscreenSupported(viewport, video)) {
      this._reportControlError(
        this.localize("media_player.fullscreen_unsupported"),
      );
      return;
    }
    try {
      await toggleMediaFullscreen(viewport, video);
    } catch {
      this._reportControlError(this.localize("media_player.fullscreen_failed"));
    }
    this._syncControlState();
  };

  private readonly _togglePictureInPicture = async (): Promise<void> => {
    const video = this._video();
    if (!video) return;
    try {
      await togglePictureInPicture(video);
    } catch {
      this._reportControlError(this.localize("media_player.pip_failed"));
    }
    this._syncControlState();
  };

  private readonly _handleControl = (
    event: CustomEvent<MediaControlEventDetail<RecordedVideoControlAction>>,
  ): void => {
    event.stopPropagation();
    if (event.detail.action === "fullscreen") {
      void this._toggleFullscreen();
    } else {
      void this._togglePictureInPicture();
    }
  };

  private readonly _handleOverlayControlInteraction = (): void => {
    this._overlay.reveal();
  };

  private readonly _handleTransport = (
    event: CustomEvent<RecordedVideoTransportEventDetail>,
  ): void => {
    event.stopPropagation();
    const { action, value } = event.detail;
    if (action === "toggle_play") void this._togglePlayback();
    else if (action === "toggle_mute") this._toggleMute();
    else if (action === "seek" && value !== undefined) this._seek(value);
    else if (action === "volume" && value !== undefined) this._setVolume(value);
  };

  private readonly _handleTransportHold = (
    event: CustomEvent<RecordedVideoTransportHoldDetail>,
  ): void => {
    event.stopPropagation();
    if (event.detail.active) {
      this._transportHoldRelease ??= this._overlay.hold();
    } else this._releaseTransportHold();
  };

  private readonly _handleRecordingScrubber = async (
    event: CustomEvent<RecordingScrubberEventDetail>,
  ): Promise<void> => {
    event.stopPropagation();
    const timeline = this.request?.timeline;
    if (event.detail.action === "set_segment_start") {
      if (timeline && event.detail.timestamp !== undefined) {
        await this._restoreOriginalPlayback(this._previewTimestamp());
        this._segment.setStart(event.detail.timestamp, timeline);
      }
      return;
    }
    if (event.detail.action === "set_segment_end") {
      if (timeline && event.detail.timestamp !== undefined) {
        await this._restoreOriginalPlayback(this._previewTimestamp());
        this._segment.setEnd(event.detail.timestamp, timeline);
      }
      return;
    }
    if (event.detail.action === "toggle_play") {
      void this._togglePlayback();
      return;
    }
    if (!timeline || event.detail.timestamp === undefined) return;
    this._seek(
      recordingTimestampToMediaTime(
        event.detail.timestamp,
        this._duration,
        this._segmentPreviewTimeline ?? timeline,
      ),
    );
    if (event.detail.action === "seek_and_play") {
      const video = this._video();
      if (video) void playMediaElement(video).catch(() => this._reportError());
    }
  };

  private readonly _handleSegmentManager = async (
    event: CustomEvent<RecordingSegmentManagerAction>,
  ): Promise<void> => {
    event.stopPropagation();
    const timeline = this.request?.timeline;
    if (!timeline) return;
    if (event.detail === "cancel") {
      await this._restoreOriginalPlayback(this._segment.selection?.startTime);
      this._segment.cancel();
      this._emitSegmentState();
    } else if (event.detail === "reset") {
      await this._restoreOriginalPlayback(this._segment.selection?.startTime);
      this._segment.reset(timeline);
    } else if (event.detail === "download") {
      void this._segment.download(timeline);
    } else if (event.detail === "export") {
      const request = this.request;
      if (request) void this._segment.export(timeline, request.id);
    } else {
      if (this._segmentPreviewActive) {
        await this._restoreOriginalPlayback(this._previewTimestamp());
        return;
      }
      const selection = this._segment.beginPreview();
      if (!selection) return;
      const video = this._video();
      const request = this.request;
      if (!video || !request) return;
      const generation = ++this._segmentPreviewGeneration;
      const media = await this._segment.resolvePreview(timeline);
      if (
        !media ||
        generation !== this._segmentPreviewGeneration ||
        selection !== this._segment.selection
      ) {
        return;
      }
      this._segmentPreviewActive = true;
      this._segmentPreviewTimeline = segmentPreviewTimeline(
        timeline,
        selection,
      );
      this.requestUpdate();
      await this._playback.load(video, {
        ...request,
        id: `${request.id}:segment:${selection.startTime}:${selection.endTime}`,
        preferredTransport: media.preferred_transport,
        sources: media.playback_sources,
      });
      this._applyPlaybackRate(video);
      if (generation !== this._segmentPreviewGeneration) return;
      try {
        await playMediaElement(video);
      } catch {
        this._reportControlError(
          this.localize("recording_segments.preview_failed"),
        );
      }
    }
  };

  private readonly _handleSegmentPreviewEnded = (): void => {
    if (!this._segmentPreviewActive) return;
    this._syncControlState();
  };

  private async _restoreOriginalPlayback(timestamp?: number): Promise<void> {
    const wasActive = this._segmentPreviewActive;
    this._segmentPreviewActive = false;
    this._segmentPreviewTimeline = undefined;
    this._segmentPreviewGeneration += 1;
    if (!wasActive) return;
    const video = this._video();
    const request = this.request;
    const timeline = request?.timeline;
    if (!video || !request || !timeline) return;
    await this._playback.load(video, request);
    this._applyPlaybackRate(video);
    if (timestamp !== undefined) {
      video.currentTime = recordingTimestampToMediaTime(
        timestamp,
        finiteMediaValue(video.duration),
        timeline,
      );
    }
    video.pause();
    this._syncControlState();
  }

  private _previewTimestamp(): number | undefined {
    const timeline = this._segmentPreviewTimeline;
    if (!this._segmentPreviewActive || !timeline) return undefined;
    return mediaTimeToRecordingTimestamp(
      this._currentTime,
      this._duration,
      timeline,
    );
  }

  private _releaseTransportHold(): void {
    this._transportHoldRelease?.();
    this._transportHoldRelease = undefined;
  }

  private _reportError(): void {
    this.dispatchEvent(
      new CustomEvent(RECORDED_MEDIA_ERROR_EVENT, {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _emitSegmentState(): void {
    this.dispatchEvent(
      new CustomEvent(RECORDING_SEGMENT_STATE_EVENT, {
        bubbles: true,
        composed: true,
        detail: { active: this._segment.active },
      }),
    );
  }

  private _reportControlError(message: string): void {
    this.dispatchEvent(
      new CustomEvent(RECORDED_MEDIA_ERROR_EVENT, {
        bubbles: true,
        composed: true,
        detail: { message },
      }),
    );
  }

  private _dispatchExport(intent: RecordedMediaExportIntent): void {
    this.dispatchEvent(
      new CustomEvent<RecordedMediaExportIntent>(RECORDED_MEDIA_EXPORT_EVENT, {
        bubbles: true,
        composed: true,
        detail: intent,
      }),
    );
  }

  static styles = recordedVideoPlayerStyles;
}

function finiteMediaValue(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

function finiteVolume(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 1;
}

function formatPlaybackRate(value: number): string {
  return `${value}×`;
}

function stopPropagation(event: Event): void {
  event.stopPropagation();
}

function recordingTimestampToMediaTime(
  timestamp: number,
  mediaDuration: number,
  timeline: RecordingTimeline,
): number {
  const total = recordingTimelineMediaDuration(timeline);
  if (total <= 0) return 0;
  let offset = total;
  for (const span of timeline.spans) {
    if (timestamp <= span.startTime) {
      offset = span.mediaOffset;
      break;
    }
    if (timestamp < span.endTime) {
      offset = span.mediaOffset + timestamp - span.startTime;
      break;
    }
  }
  return offset * (mediaDuration > 0 ? mediaDuration / total : 1);
}

function mediaTimeToRecordingTimestamp(
  mediaTime: number,
  mediaDuration: number,
  timeline: RecordingTimeline,
): number {
  const total = recordingTimelineMediaDuration(timeline);
  if (total <= 0 || timeline.spans.length === 0) return timeline.startTime;
  const normalized = Math.max(
    0,
    Math.min(
      total,
      mediaTime * (mediaDuration > 0 ? total / mediaDuration : 1),
    ),
  );
  for (const span of timeline.spans) {
    const spanDuration = span.endTime - span.startTime;
    if (normalized <= span.mediaOffset + spanDuration) {
      return span.startTime + Math.max(0, normalized - span.mediaOffset);
    }
  }
  return timeline.spans[timeline.spans.length - 1]?.endTime ?? timeline.endTime;
}

function recordingTimelineMediaDuration(timeline: RecordingTimeline): number {
  const last = timeline.spans[timeline.spans.length - 1];
  return last ? last.mediaOffset + last.endTime - last.startTime : 0;
}

function segmentPreviewTimeline(
  timeline: RecordingTimeline,
  selection: RecordingSegmentSelection,
): RecordingTimeline {
  let mediaOffset = 0;
  const spans = timeline.selectionSpans.flatMap((span) => {
    const startTime = Math.max(span.startTime, selection.startTime);
    const endTime = Math.min(span.endTime, selection.endTime);
    if (endTime <= startTime) return [];
    const previewSpan = { startTime, endTime, mediaOffset };
    mediaOffset += endTime - startTime;
    return [previewSpan];
  });
  return {
    ...timeline,
    endTime: selection.endTime,
    markers: timeline.markers.filter(
      (marker) =>
        marker.endTime > selection.startTime &&
        marker.startTime < selection.endTime,
    ),
    spans,
    startTime: selection.startTime,
  };
}

if (!customElements.get(RECORDED_VIDEO_PLAYER_TAG)) {
  customElements.define(RECORDED_VIDEO_PLAYER_TAG, RecordedVideoPlayer);
}

declare global {
  interface HTMLElementTagNameMap {
    [RECORDED_VIDEO_PLAYER_TAG]: RecordedVideoPlayer;
  }
}
