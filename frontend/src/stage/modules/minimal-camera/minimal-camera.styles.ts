import { css } from "lit";

export const minimalCameraStyles = css`
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

  .viewport::after {
    position: absolute;
    z-index: 3;
    inset: 0;
    border: var(--wzc-camera-activity-outline-width) solid transparent;
    border-radius: inherit;
    content: "";
    pointer-events: none;
  }

  .viewport.activity-alert::after {
    border-color: var(--wzc-camera-alert-outline-color);
  }

  .viewport.activity-detection::after {
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

  .controls {
    position: absolute;
    z-index: 2;
    inset-block-start: 0.5rem;
    inset-inline-start: 50%;
    display: flex;
    gap: 0.75rem;
    transform: translateX(-50%);
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

  .control {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: var(--wzc-camera-control-size);
    block-size: var(--wzc-camera-control-size);
    padding: 0;
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-media-overlay-surface);
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    touch-action: manipulation;
  }

  .control svg {
    inline-size: var(--wzc-camera-control-icon-size);
    block-size: var(--wzc-camera-control-icon-size);
  }

  .control:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .interaction-surface:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  .viewport:fullscreen,
  .viewport:-webkit-full-screen {
    border-radius: 0;
  }
`;
