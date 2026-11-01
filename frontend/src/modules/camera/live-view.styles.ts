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
    place-items: center;
    inline-size: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: var(--wzc-live-background);
    border-radius: var(--wzc-live-radius, var(--wzc-radius-large, 8px));
    box-shadow: var(--wzc-live-shadow, none);
    container-type: size;
  }

  .viewport:fullscreen,
  .viewport:-webkit-full-screen {
    --wzc-safe-area-inset-block-start: env(safe-area-inset-top, 0px);
    --wzc-safe-area-inset-block-end: env(safe-area-inset-bottom, 0px);
    --wzc-safe-area-inset-inline-start: env(safe-area-inset-left, 0px);
    --wzc-safe-area-inset-inline-end: env(safe-area-inset-right, 0px);

    inline-size: 100vw;
    block-size: 100vh;
    aspect-ratio: auto;
    border-radius: 0;
  }

  .generic-fallback,
  .fallback-image {
    position: absolute;
    z-index: 0;
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
    display: block;
    object-fit: var(--wzc-live-fit, contain);
    background: var(--wzc-live-background);
  }

  .hls-host,
  video {
    position: absolute;
    z-index: 1;
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

  .hls-host.native-edge-isolation {
    overflow: hidden;
    border-radius: inherit;
    isolation: isolate;
  }

  .hls-host.native-edge-isolation video {
    inset: -1px;
    inline-size: calc(100% + 2px);
    block-size: calc(100% + 2px);
    max-inline-size: none;
    max-block-size: none;
    border: 0;
    outline: 0;
  }

  .source-indicator {
    position: absolute;
    z-index: 3;
    inset-block-start: calc(
      var(--wzc-media-overlay-safe-block) +
        var(--wzc-safe-area-inset-block-start)
    );
    inset-inline-end: calc(
      var(--wzc-media-overlay-safe-inline) +
        var(--wzc-safe-area-inset-inline-end)
    );
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.5rem;
    color: var(--wzc-live-indicator-color, var(--wzc-media-overlay-color));
    background: var(
      --wzc-live-indicator-background,
      var(--wzc-media-overlay-background)
    );
    border: 1px solid
      var(
        --wzc-live-indicator-border-color,
        var(--wzc-media-overlay-border-color)
      );
    border-radius: var(
      --wzc-live-indicator-radius,
      var(--wzc-media-overlay-radius)
    );
    box-shadow: var(
      --wzc-live-indicator-shadow,
      var(--wzc-media-overlay-shadow)
    );
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-semibold);
    line-height: var(--wzc-line-height-condensed);
    pointer-events: none;
    max-inline-size: calc(100% - 2 * var(--wzc-media-overlay-safe-inline));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: inset-inline-end var(--wzc-transition-fast) ease;
  }

  .source-indicator.controls-visible {
    inset-inline-end: calc(
      var(--wzc-media-overlay-safe-inline) +
        var(--wzc-safe-area-inset-inline-end) + var(--wzc-media-control-size) +
        var(--wzc-media-overlay-lane-gap)
    );
    max-inline-size: calc(
      100% - 2 *
        var(--wzc-media-overlay-safe-inline) - var(
          --wzc-media-control-size
        ) - var(--wzc-media-overlay-lane-gap)
    );
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
    .source-indicator {
      animation: none;
      transition: none;
    }
  }

  @container (max-width: 480px) {
    .source-indicator,
    watchzone-camera-controls {
      --wzc-media-control-size: 2.35rem;
      --wzc-media-control-icon-size: 1.4rem;
    }
  }

  @container (max-height: 360px) {
    .source-indicator,
    watchzone-camera-controls {
      --wzc-media-control-size: 2.25rem;
      --wzc-media-control-icon-size: 1.3rem;
      --wzc-media-control-gap: 0.125rem;
    }
  }

  @container (max-height: 240px) {
    .source-indicator,
    watchzone-camera-controls {
      --wzc-media-control-size: 1.875rem;
      --wzc-media-control-icon-size: 1.15rem;
      --wzc-media-control-gap: 0.1rem;
    }
  }

  .status {
    position: absolute;
    z-index: 3;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    padding: 1rem;
    text-align: center;
    pointer-events: none;
  }

  .status-content {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    max-inline-size: min(28rem, 90%);
    padding: 0.5rem 0.75rem;
    color: var(--wzc-color-text-1);
    background: color-mix(
      in srgb,
      var(--wzc-status-background, var(--wzc-color-background)) 82%,
      transparent
    );
    border: 1px solid var(--wzc-status-border-color, var(--wzc-color-border));
    border-radius: var(--wzc-radius-large);
    backdrop-filter: blur(2px);
  }

  .error {
    color: var(--wzc-color-error);
  }

  .error .status-content {
    color: inherit;
  }

  button {
    min-block-size: 2.5rem;
    padding-inline: 1rem;
    color: var(--wzc-color-text-1);
    background: var(--wzc-color-fill-primary);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-button);
    font: inherit;
    cursor: pointer;
    pointer-events: auto;
  }
`;
