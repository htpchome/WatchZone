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

  button {
    position: relative;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    padding: 0;
    color: var(--wzc-light-inactive-color);
    background: var(--wzc-round-control-background);
    border: 1px solid var(--wzc-round-control-border-color);
    cursor: pointer;
    touch-action: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    background-image: radial-gradient(
      circle,
      var(--wzc-round-control-hover-color) 0 50%,
      transparent 51%
    );
    background-position: center;
    background-repeat: no-repeat;
    background-size: 0 0;
    box-shadow: var(--wzc-round-control-shadow);
    transition: background-size var(--wzc-round-control-hover-duration) ease-out;
  }

  .light-button {
    isolation: isolate;
    inline-size: var(--wzc-camera-control-size);
    block-size: var(--wzc-camera-control-size);
    overflow: hidden;
    border-radius: 50%;
  }

  .light-button.on {
    color: var(--wzc-light-active-color);
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

  .light-button ha-icon,
  .power-button svg {
    display: block;
    inline-size: 1.35rem;
    block-size: 1.35rem;
    pointer-events: none;
  }

  .light-button:disabled,
  .power-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .dimmer-panel {
    display: grid;
    grid-template:
      "name value" auto
      "slider slider" auto
      "power power" auto /
      minmax(0, 1fr) min-content;
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
    justify-self: start;
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
    inline-size: 4.75rem;
    block-size: clamp(10rem, 34cqi, 14rem);
    margin: 0.6rem 0 0.35rem;
    --control-slider-background: var(--wzc-light-slider-background);
    --control-slider-background-opacity: 1;
    --control-slider-border-radius: 2rem;
    --control-slider-color: var(--wzc-light-slider-color);
    --control-slider-thickness: 4.75rem;
  }

  .power-button {
    grid-area: power;
    inline-size: 2.5rem;
    block-size: 2.5rem;
    margin-block-start: 0.35rem;
    color: var(--wzc-media-overlay-color);
    background-color: var(--wzc-media-overlay-surface);
    border-color: var(--wzc-media-overlay-border-color);
    border-radius: 50%;
  }

  .power-button.on {
    color: var(--wzc-light-power-active-color);
  }

  button:focus-visible {
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
      background-size: 200% 200%;
    }
  }

  @media (hover: none) {
    button:hover,
    button:active {
      background-size: 0 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .light-stack,
    .light-button::before,
    button {
      transition: none;
    }
  }
`;
