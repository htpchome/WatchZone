import { css } from "lit";

export const recordingScrubberStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    padding: 0.45rem 0.5rem 0.35rem;
    color: var(--wzc-recording-scrubber-text);
    background: var(--wzc-recording-scrubber-surface);
    font-family: var(--wzc-font-family);
  }

  .scrubber {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr);
    align-items: start;
    gap: 0.45rem;
  }

  .playback {
    appearance: none;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: 2rem;
    block-size: 2rem;
    margin-block-start: 1.15rem;
    padding: 0;
    color: var(--wzc-recording-scrubber-text);
    background: transparent;
    border: 1px solid var(--wzc-recording-scrubber-pointer-outline);
    border-radius: 50%;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .playback svg {
    inline-size: 1.1rem;
    block-size: 1.1rem;
  }

  .playback:focus-visible,
  .range:focus-visible,
  .marker:focus-visible {
    outline: 2px solid var(--wzc-recording-scrubber-pointer-outline);
    outline-offset: 2px;
  }

  .timeline {
    position: relative;
    min-inline-size: 0;
    padding-block-start: 1.15rem;
  }

  .track {
    position: relative;
    block-size: var(--wzc-recording-scrubber-track-block-size);
    overflow: visible;
    background: repeating-linear-gradient(
      135deg,
      var(--wzc-recording-scrubber-gap) 0 0.28rem,
      var(--wzc-recording-scrubber-gap-stripe) 0.28rem 0.48rem
    );
    border-radius: var(--wzc-recording-scrubber-radius);
  }

  .span,
  .marker,
  .tick,
  .pointer {
    position: absolute;
  }

  .span {
    z-index: 1;
    inset-block: 0;
    background: var(--wzc-recording-scrubber-track);
  }

  .span.first {
    border-start-start-radius: var(--wzc-recording-scrubber-radius);
    border-end-start-radius: var(--wzc-recording-scrubber-radius);
  }

  .span.last {
    border-start-end-radius: var(--wzc-recording-scrubber-radius);
    border-end-end-radius: var(--wzc-recording-scrubber-radius);
  }

  .tick {
    z-index: 2;
    inset-block: 0;
    inline-size: 1px;
    background: var(--wzc-recording-scrubber-tick);
    pointer-events: none;
  }

  .marker {
    appearance: none;
    z-index: 4;
    inset-block: 0.18rem;
    min-inline-size: 0.48rem;
    padding: 0;
    border: 0;
    border-radius: 0.5rem;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .marker.alert {
    background: var(--wzc-recording-scrubber-alert);
  }

  .marker.detection {
    background: var(--wzc-recording-scrubber-detection);
  }

  .range {
    appearance: none;
    position: absolute;
    z-index: 3;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    margin: 0;
    padding: 0;
    opacity: 0;
    cursor: pointer;
    touch-action: none;
  }

  .pointer {
    z-index: 5;
    inset-block: -0.28rem;
    inline-size: 2px;
    background: var(--wzc-recording-scrubber-pointer);
    border-inline: 1px solid var(--wzc-recording-scrubber-pointer-outline);
    pointer-events: none;
    transform: translateX(-50%);
  }

  .pointer-time {
    position: absolute;
    inset-block-end: calc(100% + 0.16rem);
    inset-inline-start: 50%;
    padding: 0.08rem 0.28rem;
    color: var(--wzc-recording-scrubber-text);
    background: var(--wzc-recording-scrubber-pointer);
    border: 1px solid var(--wzc-recording-scrubber-pointer-outline);
    border-radius: 0.25rem;
    font-size: 0.625rem;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    white-space: nowrap;
    transform: translateX(-50%);
  }

  .labels {
    position: relative;
    block-size: 1.05rem;
    margin-block-start: 0.15rem;
  }

  .label {
    position: absolute;
    inset-block-start: 0;
    font-size: 0.625rem;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    white-space: nowrap;
    transform: translateX(-50%);
  }

  .label:first-child {
    transform: none;
  }

  .label:last-child {
    transform: translateX(-100%);
  }

  .preview {
    position: absolute;
    z-index: 8;
    inset-block-end: calc(100% + 0.35rem);
    inline-size: min(12rem, calc(100% - 0.5rem));
    overflow: hidden;
    color: var(--wzc-recording-scrubber-text);
    background: var(--wzc-recording-scrubber-preview-surface);
    border: 1px solid var(--wzc-recording-scrubber-preview-border);
    border-radius: var(--wzc-recording-scrubber-radius);
    box-shadow: var(--wzc-recording-scrubber-preview-shadow);
    pointer-events: none;
    transform: translateX(-50%);
  }

  .preview img {
    display: block;
    inline-size: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
  }

  .preview-label {
    display: block;
    padding: 0.25rem 0.4rem;
    font-size: 0.6875rem;
    font-weight: var(--wzc-font-weight-semibold);
  }

  @media (hover: hover) and (pointer: fine) {
    .playback:hover {
      background: var(--wzc-recording-scrubber-hover);
    }

    .marker:hover {
      filter: brightness(0.94);
    }
  }
`;
