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
  }

  .viewport:fullscreen,
  .viewport:-webkit-full-screen {
    inline-size: 100vw;
    block-size: 100vh;
    aspect-ratio: auto;
    border-radius: 0;
  }

  .generic-fallback,
  .fallback-image {
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
    display: block;
    object-fit: var(--wzc-live-fit, contain);
    background: var(--wzc-live-background);
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

  .source-indicator {
    position: absolute;
    z-index: 1;
    inset-block-start: max(0.5rem, env(safe-area-inset-top, 0px));
    inset-inline-end: calc(0.5rem + env(safe-area-inset-right, 0px));
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
    .connection-spinner {
      animation: none;
    }
  }
`;
