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

  :host([presentation="panel"]) {
    inline-size: 100%;
    block-size: 100%;
    pointer-events: auto;
  }

  .ptz-layer {
    display: grid;
    place-items: center;
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;
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

  .ptz-panel-presentation {
    box-sizing: border-box;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    place-items: center;
    gap: var(--wzc-ptz-panel-module-gap);
    inline-size: 100%;
    min-block-size: var(--wzc-ptz-panel-module-min-block-size);
    block-size: 100%;
    padding: var(--wzc-ptz-panel-module-padding);
    pointer-events: auto;
  }

  .ptz-panel-directional {
    box-sizing: border-box;
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-ptz-panel-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: 50%;
    display: grid;
    grid-template: repeat(3, 1fr) / repeat(3, 1fr);
    place-items: center;
    inline-size: var(--wzc-ptz-panel-module-control-size);
    block-size: var(--wzc-ptz-panel-module-control-size);
    padding: var(--wzc-ptz-panel-module-control-padding);
  }

  .ptz-panel-directional button {
    --wzc-round-button-size: var(--wzc-ptz-panel-module-cell-size);
    --wzc-round-button-icon-size: var(--wzc-ptz-panel-module-icon-size);
    inline-size: var(--wzc-ptz-panel-module-cell-size);
    block-size: var(--wzc-ptz-panel-module-cell-size);
  }

  .ptz-panel-center {
    grid-area: 2 / 2;
    display: grid;
    place-items: center;
    inline-size: var(--wzc-ptz-panel-module-cell-size);
    block-size: var(--wzc-ptz-panel-module-cell-size);
    opacity: 0.72;
  }

  .ptz-panel-center svg {
    inline-size: var(--wzc-ptz-panel-module-icon-size);
    block-size: var(--wzc-ptz-panel-module-icon-size);
  }

  .ptz-presets {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--wzc-ptz-preset-gap);
    inline-size: 100%;
  }

  button.ptz-preset {
    box-sizing: border-box;
    inline-size: auto;
    min-inline-size: var(--wzc-ptz-preset-min-inline-size);
    max-inline-size: 100%;
    block-size: var(--wzc-ptz-preset-block-size);
    padding-inline: var(--wzc-ptz-preset-inline-padding);
    color: var(--wzc-ptz-preset-color);
    background: var(--wzc-ptz-preset-background);
    border: 1px solid var(--wzc-ptz-preset-border-color);
    border-radius: var(--wzc-ptz-preset-radius);
    font: inherit;
    line-height: var(--wzc-line-height-condensed);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    touch-action: manipulation;
  }

  button.ptz-preset::before {
    display: none;
  }

  button.ptz-preset:disabled {
    color: var(--wzc-color-text-3);
    cursor: default;
  }

  .ptz-panel-toast {
    inline-size: min(24rem, 100%);
  }

  @media (hover: hover) and (pointer: fine) {
    button:hover::before {
      background: var(--wzc-neutral-control-hover-background);
    }

    button.ptz-preset:hover:not(:disabled) {
      background: var(--wzc-ptz-preset-hover-background);
    }
  }

  @media (hover: none) {
    button:hover::before,
    button:active::before {
      background: transparent;
    }
  }
`;
