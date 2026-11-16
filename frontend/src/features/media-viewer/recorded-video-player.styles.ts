import { css } from "lit";

export const recordedVideoPlayerStyles = css`
  :host {
    background: var(--wzc-recorded-media-background);
    aspect-ratio: 16 / 9;
    block-size: auto;
    display: block;
    inline-size: 100%;
    min-block-size: 0;
    min-inline-size: 0;
  }

  :host([recording-timeline]) {
    aspect-ratio: auto;
    background: var(--wzc-recording-scrubber-surface);
  }

  .viewport {
    background: var(--wzc-recorded-media-background);
    aspect-ratio: 16 / 9;
    block-size: auto;
    inline-size: 100%;
    min-block-size: 0;
    min-inline-size: 0;
    overflow: hidden;
    position: relative;
    /* Match live media: vertical motion remains page scroll at 1x while the
       shared gesture owner receives double-tap and two-contact pinch input. */
    touch-action: pan-y;
  }

  .viewport.pannable {
    touch-action: none;
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
    inset: 0;
    display: block;
    block-size: 100%;
    inline-size: 100%;
    max-block-size: 100%;
    object-fit: contain;
    pointer-events: none;
    position: absolute;
    transform-origin: center;
    transition: transform var(--wzc-zoom-transition-duration) ease;
    user-select: none;
  }

  video.interacting {
    cursor: move;
    transition: none;
  }

  .player-tools {
    position: absolute;
    z-index: 2;
    inset-block: 0;
    inset-inline-end: var(--wzc-camera-control-inline-inset);
    inline-size: var(--wzc-camera-side-lane-inline-size);
    display: grid;
    place-items: center;
    container-type: size;
  }

  .playback-options {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    padding: 0.5rem;
  }

  .rate-label {
    color: var(--wzc-recorded-rate-color);
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-semibold);
  }

  .rate-control {
    display: grid;
    grid-template-columns: 2rem minmax(2.75rem, max-content) 2rem;
    align-items: center;
    min-block-size: 2rem;
    color: var(--wzc-recorded-rate-color);
    background: var(--wzc-recorded-rate-background);
    border: 1px solid var(--wzc-recorded-rate-border);
    border-radius: var(--wzc-radius-pill);
    box-shadow: var(--wzc-recorded-rate-shadow);
  }

  .rate-control button {
    appearance: none;
    display: grid;
    place-items: center;
    block-size: 100%;
    min-block-size: 2rem;
    min-inline-size: 0;
    padding: 0;
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-pill);
    cursor: pointer;
    font: inherit;
    font-size: 1.1rem;
    line-height: 1;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .rate-control button:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .rate-control button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  .rate-select {
    --mdc-select-fill-color: transparent;
    --mdc-select-idle-line-color: transparent;
    --mdc-select-hover-line-color: transparent;
    --mdc-select-dropdown-icon-color: var(--wzc-recorded-rate-color);
    --mdc-select-ink-color: var(--wzc-recorded-rate-color);
    display: block;
    min-inline-size: 4.25rem;
    color: var(--wzc-recorded-rate-color);
    font-size: var(--wzc-font-size-small);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    line-height: 1;
    text-align: center;
    white-space: nowrap;
  }

  wzc-recording-segment-manager {
    inline-size: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    video {
      transition: none;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .rate-control button:hover:not(:disabled) {
      color: var(--wzc-color-primary);
      background: var(--wzc-recorded-media-control-hover-background);
    }
  }
`;
