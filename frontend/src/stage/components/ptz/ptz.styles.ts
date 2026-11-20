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

  :host([presentation="module"]) {
    inline-size: 100%;
    block-size: 100%;
  }

  .ptz-layer {
    display: grid;
    place-items: center;
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;
  }

  .ptz-layer.module {
    grid-template-rows: minmax(0, 1fr) auto;
    gap: var(--wzc-component-surface-gap);
  }

  .ptz-layer.module .ptz-control {
    --wzc-ptz-cell-size: calc(var(--wzc-ptz-module-dial-size) / 3);
    --wzc-ptz-button-size: calc(var(--wzc-ptz-module-dial-size) / 3);
    --wzc-ptz-icon-size: clamp(1.5rem, 7cqi, 3.5rem);
    grid-row: 1;
    inline-size: var(--wzc-ptz-module-dial-size);
    block-size: var(--wzc-ptz-module-dial-size);
    padding: 0;
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  .ptz-layer.module .center-mark {
    grid-area: 2 / 2;
    inline-size: calc(var(--wzc-ptz-module-dial-size) / 5);
    block-size: calc(var(--wzc-ptz-module-dial-size) / 5);
    background: currentcolor;
    border-radius: 50%;
  }

  .preset-list {
    grid-row: 2;
    display: flex;
    justify-content: center;
    gap: var(--wzc-control-dock-gap);
    max-inline-size: 100%;
    overflow-x: auto;
    pointer-events: auto;
    scrollbar-width: thin;
  }

  .preset-button {
    box-sizing: border-box;
    flex: 0 0 auto;
    min-block-size: var(--wzc-control-size);
    padding-inline: 1rem;
    color: var(--wzc-color-text-1);
    background: var(--wzc-color-surface-primary);
    border: 1px solid var(--wzc-color-border);
    border-radius: var(--wzc-radius-pill);
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .preset-button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .preset-button:active {
    background: var(--wzc-neutral-control-hover-background);
  }

  .ptz-control {
    position: relative;
    grid-column: 1;
    grid-row: 1;
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
    visibility: hidden;
    pointer-events: none;
    transform-origin: center;
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
    visibility: visible;
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
    position: relative;
    grid-column: 1;
    grid-row: 1;
    --wzc-round-button-size: var(--wzc-control-size);
    --wzc-round-button-background: var(--wzc-media-overlay-background);
    --wzc-round-button-border-color: var(--wzc-media-overlay-border-color);
    --wzc-round-button-hover-background: var(
      --wzc-neutral-control-hover-background
    );
    --wzc-round-button-icon-size: var(--wzc-camera-control-icon-size);
    --wzc-round-button-touch-action: manipulation;
    inline-size: var(--wzc-control-size);
    block-size: var(--wzc-control-size);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  button.ptz-trigger.visible {
    opacity: 1;
    visibility: visible;
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

    .preset-button:hover {
      background: var(--wzc-neutral-control-hover-background);
    }
  }

  @media (hover: none) {
    button:hover::before,
    button:active::before {
      background: transparent;
    }
  }
`;
