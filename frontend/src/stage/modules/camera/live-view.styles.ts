import { css } from "lit";

export const cameraLiveViewStyles = css`
  :host {
    display: block;
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
    color: var(--wzc-color-text-1);
  }

  .viewport {
    position: relative;
    display: grid;
    grid-template-areas:
      "left top top top right"
      "left media media media right"
      "left lower lower lower right"
      "metadata metadata metadata metadata metadata";
    grid-template-columns: var(--wzc-camera-overlay-grid-columns);
    grid-template-rows: var(--wzc-camera-overlay-grid-rows);
    inline-size: 100%;
    block-size: 100%;
    overflow: hidden;
    background: var(--wzc-live-background);
    border-radius: var(--wzc-live-radius, var(--wzc-radius-large, 8px));
    box-shadow: var(--wzc-live-shadow, none);
  }

  .viewport:fullscreen,
  .viewport:-webkit-full-screen {
    inline-size: 100vw;
    block-size: 100vh;
    aspect-ratio: auto;
    border-radius: 0;
  }

  .media-surface {
    position: relative;
    grid-column: 1 / -1;
    grid-row: 1 / -1;
    inline-size: 100%;
    block-size: 100%;
    overflow: hidden;
    transform-origin: center;
    /* Vertical motion remains page scroll; horizontal motion belongs to the
       camera carousel. This also prevents native double-tap zoom from racing
       the shared display-zoom gesture. */
    touch-action: pan-y;
    user-select: none;
    will-change: transform;
    transition: transform var(--wzc-zoom-transition-duration) ease;
  }

  .media-surface.pannable {
    cursor: move;
    touch-action: none;
  }

  .media-surface.interacting,
  .media-surface.stage-resize-active {
    cursor: move;
    transition: none;
  }

  .generic-fallback,
  .fallback-image,
  .suspended-presentation {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
  }

  .generic-fallback {
    display: grid;
    place-items: center;
    color: var(--wzc-placeholder-color, var(--wzc-color-text-2));
    background: var(
      --wzc-placeholder-background,
      var(--wzc-color-surface-secondary)
    );
  }

  .generic-fallback svg {
    inline-size: clamp(3rem, 14cqi, 6rem);
    block-size: auto;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 2.25;
    opacity: 0.55;
  }

  .fallback-image {
    color: var(--wzc-placeholder-color, var(--wzc-media-placeholder-color));
    display: block;
    object-fit: var(--wzc-live-fit, contain);
    background: var(--wzc-live-background);
    -webkit-user-drag: none;
  }

  .suspended-presentation {
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1.5rem;
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-camera-suspended-background);
    text-align: center;
  }

  .suspended-presentation > span:last-child {
    color: color-mix(in srgb, var(--wzc-media-overlay-color) 72%, transparent);
    font-size: var(--wzc-font-size-small);
  }

  .suspended-icon {
    display: grid;
    place-items: center;
    inline-size: 3rem;
    block-size: 3rem;
    color: var(--wzc-camera-suspended-icon-color);
    background: transparent;
    border: 1px solid var(--wzc-camera-suspended-icon-border-color);
    border-radius: 50%;
    font-size: 1.75rem;
  }

  .suspended-icon svg {
    inline-size: 1.75rem;
    block-size: 1.75rem;
  }

  .suspended-presentation strong {
    font-weight: var(--wzc-font-weight-semibold);
  }

  .fallback-host,
  .webrtc-host,
  video {
    position: absolute;
    inset: 0;
    display: block;
    inline-size: 100%;
    block-size: 100%;
  }

  .fallback-host[hidden] {
    display: none;
  }

  .fallback-host.candidate {
    opacity: 0;
    pointer-events: none;
  }

  video.webrtc.candidate {
    opacity: 0;
    pointer-events: none;
  }

  .fallback-host video,
  video {
    object-fit: var(--wzc-live-fit, contain);
    background: inherit;
    pointer-events: none;
  }

  .source-indicator {
    grid-area: top;
    align-self: start;
    justify-self: end;
    z-index: 1;
    inline-size: max-content;
    max-inline-size: none;
    margin-block-start: 0.5rem;
    margin-inline-end: 0.5rem;
    display: inline-flex;
    --wzc-badge-color: var(
      --wzc-live-indicator-color,
      var(--wzc-media-overlay-color)
    );
    --wzc-badge-background: var(
      --wzc-live-indicator-background,
      var(--wzc-media-overlay-background)
    );
    --wzc-badge-border-color: var(
      --wzc-live-indicator-border-color,
      var(--wzc-media-overlay-border-color)
    );
    --wzc-badge-shadow: var(
      --wzc-live-indicator-shadow,
      var(--wzc-media-overlay-shadow)
    );
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity var(--wzc-media-overlay-transition-duration) ease,
      visibility 0s linear var(--wzc-media-overlay-transition-duration);
  }

  .source-indicator.visible {
    opacity: 1;
    visibility: visible;
    transition-delay: 0s;
  }

  .viewport:fullscreen .source-indicator,
  .viewport:-webkit-full-screen .source-indicator {
    margin-block-start: max(0.5rem, env(safe-area-inset-top, 0px));
    margin-inline-end: calc(0.5rem + env(safe-area-inset-right, 0px));
  }

  .player-tools {
    grid-column: 5;
    grid-row: 1 / -1;
    align-self: stretch;
    justify-self: stretch;
    z-index: 2;
  }

  .connection-spinner {
    box-sizing: border-box;
    inline-size: 0.7rem;
    block-size: 0.7rem;
    border: 2px solid color-mix(in srgb, currentColor 35%, transparent);
    border-block-start-color: currentColor;
    border-radius: 50%;
    animation: wzc-connection-spin 0.8s linear infinite;
  }

  @keyframes wzc-connection-spin {
    to {
      transform: rotate(1turn);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .connection-spinner,
    .source-indicator,
    .media-surface {
      animation: none;
      transition: none;
    }
  }
`;
