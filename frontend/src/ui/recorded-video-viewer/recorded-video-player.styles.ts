import { css } from "lit";

export const recordedVideoPlayerStyles = css`
  :host {
    background: var(--wzc-recorded-media-background);
    aspect-ratio: 16 / 9;
    block-size: auto;
    display: block;
    inline-size: 100%;
  }

  :host([recording-timeline]) {
    aspect-ratio: auto;
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

  @media (prefers-reduced-motion: reduce) {
    video {
      transition: none;
    }
  }
`;
