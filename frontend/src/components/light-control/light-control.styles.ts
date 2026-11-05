import { css } from "lit";

export const lightControlStyles = css`
  :host {
    display: block;
    position: relative;
    z-index: 4;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 0;
    pointer-events: none;
  }

  .light-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .light-stack {
    position: absolute;
    inset-inline-end: calc(50% + var(--wzc-light-microphone-offset));
    inset-block-end: calc(
      var(--wzc-stage-resize-handle-block-size) +
        max(0.5rem, env(safe-area-inset-bottom))
    );
    display: grid;
    justify-items: end;
    gap: var(--wzc-light-control-gap);
    opacity: 0;
    transition: opacity var(--wzc-media-overlay-transition-duration) ease;
    pointer-events: none;
  }

  .light-stack.visible {
    opacity: 1;
  }

  .light-buttons {
    display: flex;
    gap: var(--wzc-light-control-gap);
    pointer-events: auto;
  }

  .light-button {
    touch-action: none;
  }

  .light-button::before {
    position: absolute;
    z-index: 0;
    inset-inline: 0;
    inset-block-end: 0;
    block-size: var(--wzc-light-level);
    background: var(--wzc-light-fill-color);
    content: "";
    transition: block-size var(--wzc-light-transition-duration) ease;
  }

  .light-icon {
    position: relative;
    z-index: 2;
    display: block;
    inline-size: 1.25rem;
    block-size: 1.25rem;
    pointer-events: none;
  }

  .light-icon ha-icon {
    position: absolute;
    z-index: auto;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
  }

  .light-icon-unfilled {
    color: var(--wzc-color-primary);
    clip-path: inset(0 0 var(--wzc-light-level) 0);
  }

  .light-icon-filled {
    color: var(--wzc-media-overlay-surface);
    clip-path: inset(calc(100% - var(--wzc-light-level)) 0 0 0);
  }

  .power-button svg {
    inline-size: 1.35rem;
    block-size: 1.35rem;
  }

  .dimmer-panel {
    display: grid;
    grid-template:
      "name" auto
      "value" auto
      "slider" minmax(7rem, 1fr)
      "power" auto /
      minmax(0, 1fr);
    justify-items: center;
    gap: 0.35rem;
    box-sizing: border-box;
    inline-size: var(--wzc-light-panel-inline-size);
    block-size: clamp(
      13rem,
      calc(100cqb - var(--wzc-stage-resize-handle-block-size) - 1rem),
      19rem
    );
    padding: 0.7rem;
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-light-panel-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: var(--wzc-radius-large);
    box-shadow: var(--wzc-media-overlay-shadow);
    pointer-events: auto;
  }

  .dimmer-name {
    grid-area: name;
    justify-self: center;
    overflow: hidden;
    max-inline-size: 100%;
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .brightness-value {
    grid-area: value;
    color: var(--wzc-color-primary);
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-semibold);
  }

  ha-control-slider {
    grid-area: slider;
    inline-size: min(6rem, 100%);
    block-size: 100%;
    min-block-size: 7rem;
    --control-slider-color: var(--wzc-light-slider-color);
    --control-slider-background: var(--wzc-light-slider-background);
    --control-slider-background-opacity: 100%;
    --control-slider-border-radius: var(--wzc-radius-pill);
    --control-slider-thickness: min(6rem, 100%);
    cursor: pointer;
    touch-action: none;
  }

  .power-button {
    grid-area: power;
    inline-size: 2.5rem;
    block-size: 2.5rem;
    margin-block-start: 0.2rem;
  }

  .power-button.on {
    color: var(--wzc-media-overlay-color);
  }

  ha-control-slider:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .light-toast {
    position: absolute;
    inset-inline: 1rem;
    inset-block-end: calc(
      var(--wzc-stage-resize-handle-block-size) +
        var(--wzc-camera-control-size) + 1rem
    );
    margin-inline: auto;
    inline-size: min(22rem, calc(100% - 2rem));
  }

  @media (prefers-reduced-motion: reduce) {
    .light-stack,
    .light-button::before {
      transition: none;
    }
  }
`;
