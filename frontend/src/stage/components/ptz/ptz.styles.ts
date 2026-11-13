import { css } from "lit";

export const ptzStyles = css`
  :host {
    display: block;
    position: relative;
    z-index: 4;
    inline-size: var(--wzc-ptz-panel-size);
    block-size: var(--wzc-ptz-panel-size);
    min-block-size: 0;
    pointer-events: none;
  }

  .ptz-layer {
    position: relative;
    inset-inline-start: var(--wzc-ptz-right-rail-overlap);
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;
    outline: var(--wzc-overlay-debug-border);
    outline-offset: -1px;
  }

  .ptz-control {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    box-sizing: border-box;
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-ptz-panel-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: 50%;
    display: grid;
    grid-template:
      repeat(3, var(--wzc-ptz-cell-size, 1.7rem)) /
      repeat(3, var(--wzc-ptz-cell-size, 1.7rem));
    place-items: center;
    place-content: center;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, -50%);
    transform-origin: center;
  }

  .ptz-control.user-toggled {
    transition:
      opacity var(--wzc-media-overlay-transition-duration) ease,
      inline-size var(--wzc-media-overlay-transition-duration) ease,
      block-size var(--wzc-media-overlay-transition-duration) ease,
      padding var(--wzc-media-overlay-transition-duration) ease;
  }

  .ptz-control.expanded {
    inline-size: var(--wzc-ptz-panel-size);
    block-size: var(--wzc-ptz-panel-size);
    padding: var(--wzc-ptz-panel-padding, 0.18rem);
  }

  .ptz-control.collapsed {
    inline-size: var(--wzc-control-size);
    block-size: var(--wzc-control-size);
    padding: 0;
  }

  .ptz-control.expanded.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .ptz-control.collapsed .direction,
  .ptz-control.collapsed .collapse {
    opacity: 0;
  }

  button {
    --wzc-round-button-size: var(--wzc-ptz-cell-size, 1.7rem);
    --wzc-round-button-background: transparent;
    --wzc-round-button-border-color: transparent;
    --wzc-round-button-hover-background: transparent;
    --wzc-round-button-icon-size: var(--wzc-ptz-icon-size);
    --wzc-round-button-touch-action: none;
    inline-size: var(--wzc-ptz-cell-size, 1.7rem);
    block-size: var(--wzc-ptz-cell-size, 1.7rem);
    min-inline-size: 0;
    min-block-size: 0;
    color: inherit;
    transition: opacity var(--wzc-media-overlay-transition-duration) ease;
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

  button.collapse {
    z-index: 2;
    grid-area: 2 / 2;
  }

  button.collapse::before {
    display: none;
  }

  button.ptz-trigger {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    --wzc-round-button-size: var(--wzc-control-size);
    --wzc-round-button-background: transparent;
    --wzc-round-button-border-color: transparent;
    --wzc-round-button-hover-background: var(
      --wzc-neutral-control-hover-background
    );
    --wzc-round-button-icon-size: var(--wzc-camera-control-icon-size);
    --wzc-round-button-touch-action: manipulation;
    inline-size: var(--wzc-control-size);
    block-size: var(--wzc-control-size);
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, -50%);
  }

  button.ptz-trigger.user-toggled {
    transition: opacity var(--wzc-media-overlay-transition-duration) ease;
  }

  button.ptz-trigger.visible {
    opacity: 1;
    pointer-events: auto;
  }

  button.ptz-trigger::before {
    display: none;
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
      var(--wzc-stage-resize-handle-block-size) +
        var(--wzc-ptz-cell-size, 1.7rem) + var(--wzc-ptz-cell-size, 1.7rem) +
        var(--wzc-ptz-cell-size, 1.7rem) + 2rem
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
    .ptz-control,
    button.ptz-trigger {
      transition: none;
    }
  }
`;
