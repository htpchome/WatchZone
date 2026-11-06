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
    isolation: isolate;
    overflow: hidden;
    --wzc-round-button-touch-action: none;
  }

  .light-button::before {
    position: absolute;
    z-index: -1;
    inset-inline: 0;
    inset-block-end: 0;
    block-size: var(--wzc-light-level);
    background: var(--wzc-light-fill-color);
    content: "";
    transition: block-size var(--wzc-light-transition-duration) ease;
  }

  .dimmer-panel {
    display: grid;
    grid-template:
      "name" auto
      "slider" minmax(7rem, 1fr)
      "power" auto /
      1fr;
    justify-items: center;
    box-sizing: border-box;
    inline-size: var(--wzc-light-panel-inline-size);
    padding: 0.65rem;
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

  ha-control-slider {
    grid-area: slider;
    inline-size: var(--wzc-light-slider-thickness);
    block-size: var(--wzc-light-slider-block-size);
    margin-block: 0.65rem;
    --control-slider-background: var(--wzc-light-slider-background);
    --control-slider-background-opacity: 1;
    --control-slider-border-radius: var(--wzc-radius-large);
    --control-slider-color: var(--wzc-light-fill-color);
    --control-slider-thickness: var(--wzc-light-slider-thickness);
    --control-slider-tooltip-font-size: var(--wzc-font-size-small);
  }

  .power-button {
    grid-area: power;
    margin-block-start: 0.35rem;
    --wzc-round-button-size: 2.5rem;
  }

  .power-button.on {
    color: var(--wzc-light-power-active-color);
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

  @media (hover: hover) and (pointer: fine) {
    button:hover:not(:disabled) {
      background-color: var(--wzc-neutral-control-hover-background);
    }
  }

  @media (hover: none) {
    button:hover,
    button:active {
      background-color: var(--wzc-media-overlay-background);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .light-stack,
    .light-button::before {
      transition: none;
    }
  }
`;
