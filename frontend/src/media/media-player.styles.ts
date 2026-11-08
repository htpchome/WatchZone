import { css } from "lit";

export const mediaPlayerStyles = css`
  :host {
    background: var(--wzc-recorded-media-background);
    aspect-ratio: 16 / 9;
    block-size: auto;
    display: block;
    inline-size: 100%;
  }

  .viewport {
    background: var(--wzc-recorded-media-background);
    aspect-ratio: 16 / 9;
    block-size: auto;
    inline-size: 100%;
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

  video {
    background: var(--wzc-recorded-media-background);
    display: block;
    block-size: 100%;
    inline-size: 100%;
    max-block-size: 100%;
    object-fit: contain;
    transform-origin: center;
    transition: transform var(--wzc-zoom-transition-duration) ease;
    will-change: transform;
  }

  video.interacting {
    cursor: move;
    transition: none;
  }

  .controls {
    --wzc-control-size: var(--wzc-recorded-media-control-size);
    --wzc-control-icon-size: 1.4rem;
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
    video {
      transition: none;
    }
  }
`;
