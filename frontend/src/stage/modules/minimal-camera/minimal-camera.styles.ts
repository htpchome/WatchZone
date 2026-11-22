import { css } from "lit";
import {
  mediaOverlayBadgeSizingStyles,
  mediaOverlayBadgeSurfaceStyles,
  mediaOverlayControlButtonStyles,
} from "../../../ui/controls/overlay-control.styles";
import { cameraSuspendedPresentationStyles } from "../../camera-presentation/suspended-presentation.styles";

const minimalCameraComponentStyles = css`
  ${cameraSuspendedPresentationStyles}

  :host,
  .viewport,
  .media {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
  }

  .viewport {
    position: relative;
    overflow: hidden;
    aspect-ratio: var(--wzc-camera-stage-aspect-ratio);
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-camera-stage);
    border-radius: var(--wzc-live-radius);
    box-shadow: var(--wzc-live-shadow);
    -webkit-tap-highlight-color: transparent;
  }

  .viewport::after,
  .live-dialog-media::after {
    position: absolute;
    z-index: 3;
    inset: 0;
    border: var(--wzc-camera-activity-outline-width) solid transparent;
    border-radius: inherit;
    content: "";
    pointer-events: none;
  }

  .viewport.activity-alert::after,
  .live-dialog-media.activity-alert::after {
    border-color: var(--wzc-camera-alert-outline-color);
  }

  .viewport.activity-detection::after,
  .live-dialog-media.activity-detection::after {
    border-color: var(--wzc-camera-detection-outline-color);
  }

  .media,
  video,
  img,
  .video-host {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
  }

  video,
  img {
    display: block;
    object-fit: contain;
    background: transparent;
  }

  .video-host.webrtc {
    opacity: 0;
  }

  .video-host.webrtc.selected {
    opacity: 1;
  }

  .placeholder {
    display: grid;
    place-items: center;
    block-size: 100%;
    color: var(--wzc-media-placeholder-color);
  }

  .placeholder svg {
    inline-size: 16%;
    block-size: 16%;
  }

  .control-menu {
    position: absolute;
    z-index: 2;
    inset-block-start: 0.5rem;
    display: flex;
    gap: 0.5rem;
    --wzc-control-size: var(--wzc-camera-control-size);
    --wzc-control-icon-size: var(--wzc-camera-control-icon-size);
  }

  .control-menu.left {
    inset-inline-start: 0.5rem;
  }

  .control-menu.right {
    inset-inline-end: 0.5rem;
    flex-direction: row-reverse;
  }

  .control-menu.right .controls {
    flex-direction: row-reverse;
  }

  .controls {
    display: flex;
    gap: 0.5rem;
  }

  .controls[hidden] {
    display: none;
  }

  .interaction-surface {
    position: absolute;
    z-index: 1;
    inset: 0;
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .control-button.round {
    border-radius: 50%;
  }

  .audio-control {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    inline-size: var(--wzc-control-size);
    block-size: var(--wzc-control-size);
    min-inline-size: var(--wzc-control-size);
    overflow: hidden;
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-media-overlay-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: var(--wzc-radius-pill);
    box-shadow: var(--wzc-media-overlay-shadow);
  }

  .audio-control.expanded {
    inline-size: calc(var(--wzc-control-size) + 5rem);
  }

  .control-menu.right .audio-control {
    flex-direction: row-reverse;
  }

  .audio-control .volume-toggle {
    flex: 0 0 var(--wzc-control-size);
    background: transparent;
    border: 0;
    box-shadow: none;
  }

  .volume-slider {
    appearance: none;
    box-sizing: border-box;
    flex: 0 0 4.25rem;
    inline-size: 4.25rem;
    block-size: var(--wzc-control-size);
    min-inline-size: 0;
    margin: 0 0.5rem 0 0;
    padding: 0;
    opacity: 0;
    background: transparent;
    cursor: pointer;
    pointer-events: none;
    touch-action: none;
  }

  .control-menu.right .volume-slider {
    margin: 0 0 0 0.5rem;
  }

  .audio-control.expanded .volume-slider {
    opacity: 1;
    pointer-events: auto;
  }

  .volume-slider::-webkit-slider-runnable-track {
    block-size: 0.25rem;
    background: linear-gradient(
      to right,
      var(--wzc-media-volume-accent) 0%,
      var(--wzc-media-volume-accent) var(--wzc-media-volume-progress, 100%),
      var(--wzc-media-volume-track) var(--wzc-media-volume-progress, 100%),
      var(--wzc-media-volume-track) 100%
    );
    border-radius: var(--wzc-radius-pill);
  }

  .volume-slider::-webkit-slider-thumb {
    appearance: none;
    inline-size: 0.8rem;
    block-size: 0.8rem;
    margin-block-start: -0.275rem;
    background: var(--wzc-media-volume-accent);
    border: 0;
    border-radius: 50%;
  }

  .volume-slider::-moz-range-track {
    block-size: 0.25rem;
    background: var(--wzc-media-volume-track);
    border: 0;
    border-radius: var(--wzc-radius-pill);
  }

  .volume-slider::-moz-range-progress {
    block-size: 0.25rem;
    background: var(--wzc-media-volume-accent);
    border-radius: var(--wzc-radius-pill);
  }

  .volume-slider::-moz-range-thumb {
    inline-size: 0.8rem;
    block-size: 0.8rem;
    background: var(--wzc-media-volume-accent);
    border: 0;
    border-radius: 50%;
  }

  .volume-slider:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  .source-control {
    align-self: center;
  }

  .interaction-surface:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  .viewport:fullscreen,
  .viewport:-webkit-full-screen,
  .live-dialog-media:fullscreen,
  .live-dialog-media:-webkit-full-screen {
    border-radius: 0;
  }

  .live-dialog {
    box-sizing: border-box;
    container-type: inline-size;
    inline-size: min(64rem, calc(100vw - 1rem));
    max-block-size: calc(100dvh - 1rem);
    max-inline-size: calc(100vw - 1rem);
    margin: auto;
    padding: 0;
    overflow: hidden;
    color: var(--wzc-color-text-1);
    background: var(--wzc-dialog-background);
    border: 0;
    border-radius: var(--wzc-dialog-radius);
    box-shadow: var(--wzc-dialog-shadow);
    backdrop-filter: var(--wzc-dialog-backdrop-filter);
  }

  .live-dialog[open] {
    display: flex;
    flex-direction: column;
  }

  .live-dialog.companion-rotate-fullscreen {
    inset: 0;
    inline-size: 100vw;
    block-size: 100dvh;
    max-inline-size: none;
    max-block-size: none;
    margin: 0;
    border-radius: 0;
  }

  .live-dialog.companion-rotate-fullscreen .live-dialog-media {
    min-block-size: 0;
    flex: 1;
    aspect-ratio: auto;
  }

  .live-dialog.companion-rotate-fullscreen .live-dialog-footer,
  .live-dialog.companion-rotate-fullscreen .resize-handle {
    display: none;
  }

  .live-dialog.dragged {
    inset: auto;
    margin: 0;
    position: fixed;
  }

  .live-dialog::backdrop {
    background: var(--wzc-dialog-scrim-background);
    backdrop-filter: var(--wzc-dialog-scrim-backdrop-filter);
  }

  .live-dialog-header {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    min-block-size: 3.5rem;
    gap: 0.75rem;
    padding: 0.35rem 1rem 0.35rem 0.5rem;
    font-size: var(--wzc-font-size-medium);
    font-weight: var(--wzc-font-weight-semibold);
    cursor: move;
    touch-action: none;
    user-select: none;
  }

  .dialog-close {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--wzc-camera-control-size);
    block-size: var(--wzc-camera-control-size);
    padding: 0;
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
  }

  .dialog-close ha-icon {
    --mdc-icon-size: 1.5rem;
  }

  .dialog-close:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 1px;
  }

  .live-dialog-media {
    position: relative;
    box-sizing: border-box;
    --wzc-camera-control-size: var(--wzc-live-dialog-control-size);
    --wzc-camera-control-icon-size: var(--wzc-live-dialog-control-icon-size);
    --wzc-overlay-control-min-size: var(--wzc-camera-control-size);
    --wzc-round-button-size: var(--wzc-camera-control-size);
    inline-size: 100%;
    aspect-ratio: var(
      --wzc-minimal-live-dialog-aspect-ratio,
      var(--wzc-camera-stage-aspect-ratio)
    );
    overflow: hidden;
    background: var(--wzc-camera-stage);
  }

  .dialog-video-host,
  .dialog-video-host video {
    position: absolute;
    inset: 0;
    display: block;
    inline-size: 100%;
    block-size: 100%;
  }

  .dialog-video-host video {
    object-fit: contain;
    background: transparent;
  }

  .dialog-video-host.webrtc {
    opacity: 0;
  }

  .dialog-video-host.webrtc.selected {
    opacity: 1;
  }

  .live-dialog-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    box-sizing: border-box;
    min-block-size: 4.5rem;
    gap: 0.75rem;
    padding: 0.75rem calc(var(--wzc-recorded-media-resize-handle-size) + 0.5rem)
      0.75rem 1rem;
  }

  .snapshot-status {
    min-inline-size: 0;
    margin-inline-end: auto;
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-small);
  }

  .resize-handle {
    position: absolute;
    z-index: 3;
    inset-inline-end: 0;
    inset-block-end: 0;
    display: block;
    inline-size: var(--wzc-recorded-media-resize-handle-size);
    block-size: var(--wzc-recorded-media-resize-handle-size);
    padding: 0;
    color: var(--wzc-event-action-color);
    background: transparent;
    border: 0;
    cursor: nwse-resize;
    touch-action: none;
  }

  .resize-handle svg {
    position: absolute;
    inset-inline-end: 0.25rem;
    inset-block-end: 0.25rem;
    display: block;
    inline-size: 1.5rem;
    block-size: 1.5rem;
  }

  .resize-handle:focus-visible {
    color: var(--wzc-color-primary);
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .dialog-close:hover {
      color: var(--wzc-color-primary);
    }
  }
`;

export const minimalCameraStyles = [
  mediaOverlayControlButtonStyles,
  mediaOverlayBadgeSizingStyles,
  mediaOverlayBadgeSurfaceStyles,
  minimalCameraComponentStyles,
];
