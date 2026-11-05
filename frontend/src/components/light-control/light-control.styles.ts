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
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-media-overlay-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    cursor: pointer;
    touch-action: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .light-button {
    isolation: isolate;
    inline-size: var(--wzc-camera-control-size);
    block-size: var(--wzc-camera-control-size);
    overflow: hidden;
    border-radius: 50%;
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

  .light-button svg,
  .power-button svg,
  .close-dimmer svg {
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
      "name close" auto
      "slider slider" auto
      "power power" auto /
      minmax(0, 1fr) auto;
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

  input[type="range"] {
    grid-area: slider;
    inline-size: clamp(5rem, 20cqi, 8rem);
    block-size: 2rem;
    margin: 0.4rem;
    accent-color: var(--wzc-light-fill-color);
    cursor: pointer;
    direction: rtl;
    touch-action: none;
    writing-mode: vertical-lr;
  }

  .power-button {
    grid-area: power;
    inline-size: 2.5rem;
    block-size: 2.5rem;
    margin-block-start: 0.35rem;
    border-radius: 50%;
  }

  .power-button.on {
    color: var(--wzc-light-power-active-color);
  }

  .close-dimmer {
    grid-area: close;
    inline-size: 2rem;
    block-size: 2rem;
    background: transparent;
    border: 0;
    border-radius: 50%;
  }

  button:focus-visible,
  input[type="range"]:focus-visible {
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
      background-color: var(--wzc-media-overlay-hover-background);
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
