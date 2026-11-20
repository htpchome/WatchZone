import { css } from "lit";

export const lightControlStyles = css`
  :host {
    display: block;
    position: relative;
    z-index: 4;
    inline-size: max-content;
    pointer-events: none;
  }

  :host {
    --wzc-round-button-color: var(--wzc-capability-control-color);
    --wzc-round-button-background: var(--wzc-capability-control-background);
    --wzc-round-button-border-color: var(--wzc-capability-control-border-color);
    --wzc-round-button-hover-background: var(
      --wzc-capability-control-hover-background
    );
  }

  :host([presentation="overlay"]) {
    --wzc-round-button-color: var(--wzc-media-overlay-color);
    --wzc-round-button-background: var(--wzc-media-overlay-background);
    --wzc-round-button-border-color: var(--wzc-media-overlay-border-color);
    --wzc-round-button-hover-background: var(
      --wzc-neutral-control-hover-background
    );
  }

  .light-layer {
    position: relative;
    pointer-events: none;
  }

  .light-stack {
    position: relative;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .light-stack.visible {
    opacity: 1;
    visibility: visible;
  }

  .light-buttons {
    display: grid;
    grid-auto-columns: max-content;
    grid-auto-flow: column;
    gap: var(--wzc-light-control-gap);
    pointer-events: none;
  }

  .light-stack.visible .light-buttons {
    pointer-events: auto;
  }

  .light-button {
    isolation: isolate;
    overflow: hidden;
    --wzc-round-button-touch-action: none;
  }

  .light-fill {
    position: absolute;
    z-index: -1;
    inset-inline: 0;
    inset-block-end: 0;
    block-size: var(--wzc-light-level);
    background: var(--wzc-light-fill-color);
    pointer-events: none;
  }

  .dimmer-panel {
    display: grid;
    position: absolute;
    inset-inline-start: var(--wzc-light-panel-inline-start, auto);
    inset-inline-end: var(--wzc-light-panel-inline-end, 0);
    inset-block-end: var(
      --wzc-light-panel-block-end,
      calc(100% + var(--wzc-light-control-gap))
    );
    grid-template:
      "name" auto
      "slider" minmax(7rem, 1fr)
      "power" auto /
      1fr;
    justify-items: center;
    box-sizing: border-box;
    inline-size: var(--wzc-light-panel-inline-size);
    padding: var(--wzc-light-panel-padding, 0.65rem);
    color: var(--wzc-light-panel-color);
    backdrop-filter: var(--wzc-light-panel-backdrop-filter);
    background: var(--wzc-light-panel-background);
    border: 1px solid var(--wzc-light-panel-border-color);
    border-radius: var(--wzc-light-panel-radius);
    box-shadow: var(--wzc-light-panel-shadow);
    pointer-events: auto;
    transform: var(--wzc-light-panel-transform, none);
    z-index: 1;
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
    margin-block: var(--wzc-light-slider-margin-block, 0.65rem);
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
    inset-inline-start: 50%;
    inset-block-end: calc(100% + var(--wzc-control-dock-gap));
    inline-size: min(22rem, calc(100cqi - 2rem));
    transform: translateX(-50%);
  }

  @media (hover: hover) and (pointer: fine) {
    :host([presentation="overlay"]) button:hover:not(:disabled) {
      background-color: var(--wzc-neutral-control-hover-background);
    }

    :host(:not([presentation="overlay"])) button:hover:not(:disabled) {
      color: var(--wzc-capability-control-hover-color);
      background-color: var(--wzc-capability-control-hover-background);
    }
  }

  :host(:not([presentation="overlay"])) button:active:not(:disabled) {
    color: var(--wzc-capability-control-active-color);
    background-color: var(--wzc-capability-control-active-background);
  }

  @media (hover: none) {
    :host([presentation="overlay"]) button:hover,
    :host([presentation="overlay"]) button:active {
      background-color: var(--wzc-media-overlay-background);
    }
  }
`;
