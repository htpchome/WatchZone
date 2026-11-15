import { css } from "lit";
import {
  mediaOverlayBadgeSizingStyles,
  mediaOverlayControlButtonStyles,
} from "../../../ui/overlay-control.styles";

const minimalCameraComponentStyles = css`
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
    background: var(--wzc-camera-stage);
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
  }

  .control-menu.left {
    inset-inline-start: 0.5rem;
  }

  .control-menu.right {
    inset-inline-end: 0.5rem;
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
    background: var(--wzc-camera-stage);
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
  minimalCameraComponentStyles,
];
