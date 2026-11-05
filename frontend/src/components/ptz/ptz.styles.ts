import { css } from "lit";

export const ptzStyles = css`
  :host {
    display: block;
    position: relative;
    z-index: 4;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 0;
    pointer-events: none;
  }

  .ptz-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .ptz-control {
    display: grid;
    position: absolute;
    inset-inline-end: calc(
      var(--wzc-camera-control-safe-inline) + var(--wzc-camera-control-size) +
        var(--wzc-ptz-inline-gap)
    );
    inset-block-end: calc(
      var(--wzc-stage-resize-handle-block-size) +
        max(var(--wzc-ptz-safe-block), env(safe-area-inset-bottom))
    );
    grid-template:
      repeat(3, var(--wzc-ptz-button-size)) /
      repeat(3, var(--wzc-ptz-button-size));
    place-items: center;
    box-sizing: border-box;
    padding: var(--wzc-ptz-panel-padding);
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-ptz-panel-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: 50%;
    box-shadow: var(--wzc-round-control-shadow);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--wzc-media-overlay-transition-duration) ease;
  }

  .ptz-control.visible {
    opacity: 1;
    pointer-events: auto;
  }

  button {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: var(--wzc-ptz-button-size);
    block-size: var(--wzc-ptz-button-size);
    padding: var(--wzc-ptz-icon-padding);
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    background-image: radial-gradient(
      circle,
      var(--wzc-round-control-hover-color) 0 50%,
      transparent 51%
    );
    background-position: center;
    background-repeat: no-repeat;
    background-size: 0 0;
    transition: background-size var(--wzc-round-control-hover-duration) ease-out;
  }

  button.up {
    grid-area: 1 / 2;
  }

  button.left {
    grid-area: 2 / 1;
  }

  button.right {
    grid-area: 2 / 3;
  }

  button.down {
    grid-area: 3 / 2;
  }

  button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 1px;
  }

  button svg {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;
  }

  .ptz-toast {
    position: absolute;
    inset-inline: 1rem;
    inset-block-end: calc(
      var(--wzc-stage-resize-handle-block-size) + var(--wzc-ptz-button-size) +
        var(--wzc-ptz-button-size) + var(--wzc-ptz-button-size) + 2rem
    );
    margin-inline: auto;
    inline-size: min(22rem, calc(100% - 2rem));
  }

  @media (hover: hover) and (pointer: fine) {
    button:hover {
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
    .ptz-control {
      transition: none;
    }

    button {
      transition: none;
    }
  }
`;
