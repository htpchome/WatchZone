import { css } from "lit";

export const mediaPlayerStyles = css`
  :host {
    background: var(--wzc-recorded-media-background);
    display: block;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 0;
  }

  .viewport {
    background: var(--wzc-recorded-media-background);
    block-size: 100%;
    inline-size: 100%;
    min-block-size: 0;
    overflow: hidden;
    position: relative;
    touch-action: pan-x pan-y;
  }

  .viewport:fullscreen,
  .viewport:-webkit-full-screen {
    block-size: 100%;
    inline-size: 100%;
  }

  .viewport:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  .media-surface {
    block-size: 100%;
    inline-size: 100%;
    transform-origin: center;
    transition: transform var(--wzc-zoom-transition-duration) ease;
    will-change: transform;
  }

  .media-surface.interacting {
    cursor: move;
    transition: none;
  }

  video {
    aspect-ratio: 16 / 9;
    background: var(--wzc-recorded-media-background);
    display: block;
    block-size: 100%;
    inline-size: 100%;
    max-block-size: 100%;
    object-fit: contain;
  }

  .controls {
    --wzc-round-button-size: var(--wzc-recorded-media-control-size);
    --wzc-round-button-icon-size: 58%;
    align-items: center;
    display: flex;
    flex-direction: column;
    gap: var(--wzc-control-dock-gap);
    inset-block-start: 50%;
    inset-inline-end: var(--wzc-camera-control-safe-inline);
    position: absolute;
    transform: translateY(-50%);
    z-index: 2;
  }

  @media (prefers-reduced-motion: reduce) {
    .media-surface {
      transition: none;
    }
  }
`;
