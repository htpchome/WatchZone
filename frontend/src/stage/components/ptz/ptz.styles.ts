import { css } from "lit";

export const ptzStyles = css`
  :host {
    display: block;
    position: relative;
    z-index: 4;
    inline-size: max-content;
    block-size: max-content;
    min-block-size: 0;
    pointer-events: none;
  }

  .ptz-layer {
    position: relative;
    pointer-events: none;
  }

  .ptz-control {
    display: grid;
    position: relative;
    grid-template:
      repeat(3, var(--wzc-ptz-cell-size)) /
      repeat(3, var(--wzc-ptz-cell-size));
    place-items: center;
    box-sizing: border-box;
    padding: var(--wzc-ptz-panel-padding);
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-ptz-panel-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: 50%;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--wzc-media-overlay-transition-duration) ease;
  }

  .ptz-control.visible {
    opacity: 1;
    pointer-events: auto;
  }

  button {
    --wzc-round-button-size: var(--wzc-ptz-cell-size);
    --wzc-round-button-background: transparent;
    --wzc-round-button-border-color: transparent;
    --wzc-round-button-hover-background: transparent;
    --wzc-round-button-icon-size: var(--wzc-ptz-icon-size);
    --wzc-round-button-touch-action: none;
    inline-size: var(--wzc-ptz-cell-size);
    block-size: var(--wzc-ptz-cell-size);
    min-inline-size: 0;
    min-block-size: 0;
    color: inherit;
  }

  button::before {
    position: absolute;
    z-index: 0;
    inline-size: var(--wzc-ptz-button-size);
    block-size: var(--wzc-ptz-button-size);
    background: transparent;
    border-radius: 50%;
    content: "";
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

  button svg {
    display: block;
    position: relative;
    z-index: 1;
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;
  }

  .ptz-toast {
    position: absolute;
    inset-inline: 1rem;
    inset-block-end: calc(
      var(--wzc-stage-resize-handle-block-size) + var(--wzc-ptz-cell-size) +
        var(--wzc-ptz-cell-size) + var(--wzc-ptz-cell-size) + 2rem
    );
    margin-inline: auto;
    inline-size: min(22rem, calc(100% - 2rem));
  }

  @media (hover: hover) and (pointer: fine) {
    button:hover::before {
      background: var(--wzc-neutral-control-hover-background);
    }
  }

  @media (hover: none) {
    button:hover::before,
    button:active::before {
      background: transparent;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ptz-control {
      transition: none;
    }
  }
`;
