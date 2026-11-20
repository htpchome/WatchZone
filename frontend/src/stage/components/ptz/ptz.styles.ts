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

  .circle-pad {
    position: relative;
    box-sizing: border-box;
    overflow: hidden;
    color: var(--wzc-ptz-pad-color);
    background: var(--wzc-ptz-pad-background);
    border: 0;
    border-radius: 50%;
    box-shadow: var(--wzc-ptz-pad-shadow);
  }

  .ptz-control {
    grid-column: 1;
    grid-row: 1;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform-origin: center;
    --wzc-ptz-pad-background: var(--wzc-ptz-overlay-pad-background);
    --wzc-ptz-pad-color: var(--wzc-ptz-overlay-pad-color);
    --wzc-ptz-pad-button-background: var(
      --wzc-ptz-overlay-pad-button-background
    );
    --wzc-ptz-pad-center-background: var(
      --wzc-ptz-overlay-pad-center-background
    );
    --wzc-ptz-pad-divider-color: var(--wzc-ptz-overlay-pad-divider-color);
    --wzc-ptz-pad-hover-background: var(--wzc-ptz-overlay-pad-hover-background);
    --wzc-ptz-pad-active-background: var(
      --wzc-ptz-overlay-pad-active-background
    );
    --wzc-ptz-pad-active-color: var(--wzc-ptz-overlay-pad-active-color);
    --wzc-ptz-pad-shadow: var(--wzc-ptz-overlay-pad-shadow);
  }

  .ptz-control.expanded {
    inline-size: var(--wzc-ptz-panel-size);
    block-size: var(--wzc-ptz-panel-size);
  }

  .ptz-control.collapsed {
    inline-size: var(--wzc-control-size);
    block-size: var(--wzc-control-size);
  }

  .ptz-control.expanded.visible {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  button {
    margin: 0;
    font: inherit;
    -webkit-tap-highlight-color: transparent;
  }

  .wedge {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    padding: 0;
    color: inherit;
    background: var(--wzc-ptz-pad-button-background);
    border: 0;
    cursor: pointer;
    touch-action: none;
  }

  .wedge.up {
    clip-path: polygon(0.5% 0, 99.5% 0, 50% 49.5%);
  }

  .wedge.right {
    clip-path: polygon(100% 0.5%, 100% 99.5%, 50.5% 50%);
  }

  .wedge.down {
    clip-path: polygon(99.5% 100%, 0.5% 100%, 50% 50.5%);
  }

  .wedge.left {
    clip-path: polygon(0 99.5%, 0 0.5%, 49.5% 50%);
  }

  .wedge svg {
    position: absolute;
    z-index: 1;
    inline-size: var(--wzc-ptz-pad-arrow-size);
    block-size: var(--wzc-ptz-pad-arrow-size);
    pointer-events: none;
  }

  .wedge.up svg {
    inset-block-start: var(--wzc-ptz-pad-arrow-offset);
    inset-inline-start: 50%;
    translate: -50% 0;
  }

  .wedge.right svg {
    inset-block-start: 50%;
    inset-inline-end: var(--wzc-ptz-pad-arrow-offset);
    translate: 0 -50%;
  }

  .wedge.down svg {
    inset-block-end: var(--wzc-ptz-pad-arrow-offset);
    inset-inline-start: 50%;
    translate: -50% 0;
  }

  .wedge.left svg {
    inset-block-start: 50%;
    inset-inline-start: var(--wzc-ptz-pad-arrow-offset);
    translate: 0 -50%;
  }

  .wedge:active,
  .center-toggle:active,
  .center-half:active {
    color: var(--wzc-ptz-pad-active-color);
    background: var(--wzc-ptz-pad-active-background);
  }

  .wedge:focus-visible,
  .center-toggle:focus-visible,
  .center-half:focus-visible {
    background: var(--wzc-ptz-pad-hover-background);
    outline: none;
  }

  .center-toggle,
  .center-hub {
    position: absolute;
    z-index: 2;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    translate: -50% -50%;
    inline-size: var(--wzc-ptz-pad-center-size);
    block-size: var(--wzc-ptz-pad-center-size);
    overflow: hidden;
    color: inherit;
    background: var(--wzc-ptz-pad-center-background);
    border: 0;
    border-radius: 50%;
  }

  .center-toggle {
    display: grid;
    place-items: center;
    padding: 0;
    cursor: pointer;
    touch-action: manipulation;
  }

  .center-toggle svg {
    inline-size: var(--wzc-ptz-pad-center-icon-size);
    block-size: var(--wzc-ptz-pad-center-icon-size);
    pointer-events: none;
  }

  .center-hub {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--wzc-ptz-pad-divider-color);
  }

  .center-half {
    flex: 1;
    inline-size: 100%;
    min-block-size: 0;
    padding: 0;
    color: inherit;
    background: var(--wzc-ptz-pad-center-background);
    border: 0;
    font-size: var(--wzc-ptz-pad-zoom-font-size);
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    touch-action: none;
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

  .ptz-toast {
    position: absolute;
    inset-inline: 1rem;
    inset-block-end: calc(var(--wzc-ptz-panel-size) + 1rem);
    margin-inline: auto;
    inline-size: min(22rem, calc(100% - 2rem));
  }

  .ptz-panel-presentation {
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto auto;
    align-content: start;
    justify-items: center;
    gap: var(--wzc-ptz-panel-module-gap);
    inline-size: 100%;
    min-block-size: var(--wzc-ptz-panel-module-min-block-size);
    block-size: 100%;
    padding: var(--wzc-ptz-panel-module-padding);
    pointer-events: auto;
  }

  .ptz-panel-directional {
    inline-size: var(--wzc-ptz-panel-module-control-size);
    block-size: var(--wzc-ptz-panel-module-control-size);
    --wzc-ptz-pad-background: var(--wzc-ptz-module-pad-background);
    --wzc-ptz-pad-color: var(--wzc-ptz-module-pad-color);
    --wzc-ptz-pad-button-background: var(
      --wzc-ptz-module-pad-button-background
    );
    --wzc-ptz-pad-center-background: var(
      --wzc-ptz-module-pad-center-background
    );
    --wzc-ptz-pad-divider-color: var(--wzc-ptz-module-pad-divider-color);
    --wzc-ptz-pad-hover-background: var(--wzc-ptz-module-pad-hover-background);
    --wzc-ptz-pad-active-background: var(
      --wzc-ptz-module-pad-active-background
    );
    --wzc-ptz-pad-active-color: var(--wzc-ptz-module-pad-active-color);
    --wzc-ptz-pad-shadow: var(--wzc-ptz-module-pad-shadow);
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
    line-height: var(--wzc-line-height-condensed);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    touch-action: manipulation;
  }

  button.ptz-preset:disabled {
    color: var(--wzc-color-text-3);
    cursor: default;
  }

  .ptz-panel-toast {
    inline-size: min(24rem, 100%);
  }

  @media (hover: hover) and (pointer: fine) {
    .wedge:hover,
    .center-toggle:hover,
    .center-half:hover {
      background: var(--wzc-ptz-pad-hover-background);
    }

    button.ptz-preset:hover:not(:disabled) {
      background: var(--wzc-ptz-preset-hover-background);
    }
  }
`;
