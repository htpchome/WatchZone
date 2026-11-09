import { css } from "lit";

export const recordedVideoTransportStyles = css`
  :host {
    position: absolute;
    z-index: 3;
    inset-block-end: var(--wzc-recorded-transport-block-inset);
    inset-inline: var(--wzc-recorded-transport-inline-inset);
    display: block;
    color: var(--wzc-recorded-transport-color);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity var(--wzc-media-overlay-transition-duration) ease,
      visibility 0s linear var(--wzc-media-overlay-transition-duration);
  }

  :host([visible]) {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition-delay: 0s;
  }

  :host([viewport-edge]) {
    inset-block-end: max(
      var(--wzc-recorded-transport-block-inset),
      env(safe-area-inset-bottom, 0px)
    );
    inset-inline-start: max(
      var(--wzc-recorded-transport-inline-inset),
      env(safe-area-inset-left, 0px)
    );
    inset-inline-end: max(
      var(--wzc-recorded-transport-inline-inset),
      env(safe-area-inset-right, 0px)
    );
  }

  .transport {
    display: grid;
    grid-template-columns:
      var(--wzc-recorded-transport-control-size) minmax(2rem, 1fr)
      max-content var(--wzc-recorded-transport-control-size)
      minmax(3.25rem, 6rem) var(--wzc-recorded-transport-control-size);
    align-items: center;
    box-sizing: border-box;
    gap: var(--wzc-recorded-transport-gap);
    inline-size: 100%;
    padding: var(--wzc-recorded-transport-padding);
    color: inherit;
    background: var(--wzc-recorded-transport-background);
    border-radius: var(--wzc-radius-small);
    box-shadow: var(--wzc-media-overlay-shadow);
  }

  .transport-button {
    appearance: none;
    display: grid;
    box-sizing: border-box;
    place-items: center;
    inline-size: var(--wzc-recorded-transport-control-size);
    block-size: var(--wzc-recorded-transport-control-size);
    min-inline-size: 0;
    min-block-size: 0;
    padding: 0;
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-small);
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .transport-button svg {
    display: block;
    inline-size: var(--wzc-recorded-transport-icon-size);
    block-size: var(--wzc-recorded-transport-icon-size);
    pointer-events: none;
  }

  .transport-button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 1px;
  }

  .transport-button:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .time {
    min-inline-size: 4.75rem;
    font-size: var(--wzc-font-size-small);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    text-align: center;
    white-space: nowrap;
  }

  input[type="range"] {
    appearance: none;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: var(--wzc-recorded-transport-control-size);
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
    touch-action: none;
  }

  input[type="range"]::-webkit-slider-runnable-track {
    block-size: 0.25rem;
    background: linear-gradient(
      to right,
      var(--wzc-recorded-transport-accent) 0%,
      var(--wzc-recorded-transport-accent)
        var(--wzc-recorded-range-progress, 0%),
      var(--wzc-recorded-transport-track) var(--wzc-recorded-range-progress, 0%),
      var(--wzc-recorded-transport-track) 100%
    );
    border-radius: var(--wzc-radius-pill);
  }

  input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    inline-size: 0.8rem;
    block-size: 0.8rem;
    margin-block-start: -0.275rem;
    background: var(--wzc-recorded-transport-accent);
    border: 0;
    border-radius: 50%;
  }

  input[type="range"]::-moz-range-track {
    block-size: 0.25rem;
    background: var(--wzc-recorded-transport-track);
    border: 0;
    border-radius: var(--wzc-radius-pill);
  }

  input[type="range"]::-moz-range-progress {
    block-size: 0.25rem;
    background: var(--wzc-recorded-transport-accent);
    border-radius: var(--wzc-radius-pill);
  }

  input[type="range"]::-moz-range-thumb {
    inline-size: 0.8rem;
    block-size: 0.8rem;
    background: var(--wzc-recorded-transport-accent);
    border: 0;
    border-radius: 50%;
  }

  @media (hover: hover) and (pointer: fine) {
    .transport-button:hover:not(:disabled) {
      background: var(--wzc-recorded-media-control-hover-background);
    }
  }

  @media (max-width: 600px), (max-height: 500px) {
    :host {
      --wzc-recorded-transport-control-size: 1.75rem;
      --wzc-recorded-transport-icon-size: 1.1rem;
      --wzc-recorded-transport-gap: 0.25rem;
    }

    .transport {
      grid-template-columns:
        var(--wzc-recorded-transport-control-size) minmax(1.5rem, 1fr)
        max-content var(--wzc-recorded-transport-control-size)
        minmax(2.5rem, 4rem) var(--wzc-recorded-transport-control-size);
    }

    .time {
      min-inline-size: 4rem;
      font-size: 0.6875rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :host {
      transition: none;
    }
  }
`;
