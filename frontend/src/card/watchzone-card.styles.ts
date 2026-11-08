import { css } from "lit";

export const cardStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
  }

  ha-card {
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 0;
    overflow: clip;
    container-type: inline-size;
    color: var(--wzc-color-text-1);
    background: var(--wzc-card-background);
    border-color: var(--wzc-card-border-color);
    border-width: var(--wzc-card-border-width);
    border-radius: var(--wzc-card-radius);
    box-shadow: var(--wzc-card-outer-shadow);
    padding: var(--wzc-card-padding);
  }

  ha-card.square-outer-corners {
    --wzc-card-radius: 0px;
    border-radius: 0 !important;
  }

  ha-card.no-outer-shadow {
    --wzc-card-outer-shadow: none;
    box-shadow: none !important;
  }

  ha-card.no-outer-padding {
    padding: 0;
  }

  .shell {
    position: relative;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    align-items: stretch;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 0;
    padding: 0;
  }

  .stage-grid,
  .stage-placement,
  .stage-stack,
  .stage-stack-content,
  .module-composition,
  .module-slot,
  .component-slot,
  .component-node,
  .module-placeholder,
  .layout-empty {
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
  }

  .stage-grid {
    display: grid;
    grid-template-columns: repeat(
      var(--wzc-stage-grid-columns),
      minmax(0, 1fr)
    );
    grid-template-rows: var(--wzc-stage-grid-rows);
    align-content: start;
    align-items: stretch;
    gap: var(--wzc-card-padding);
  }

  .stage-stack {
    display: grid;
    grid-template-rows: max-content minmax(0, 1fr);
    min-block-size: 0;
  }

  .stage-stack-navigation {
    align-items: center;
    display: flex;
    justify-content: center;
    gap: var(--wzc-stage-stack-navigation-gap);
    padding-block: var(--wzc-stage-stack-navigation-padding);
  }

  .stage-stack-navigation button {
    align-items: center;
    background: var(--wzc-stage-stack-button-background);
    border: var(--wzc-stage-stack-button-border-width) solid
      var(--wzc-stage-stack-button-border-color);
    border-radius: var(--wzc-radius-button);
    color: var(--wzc-stage-stack-button-color);
    cursor: pointer;
    display: inline-flex;
    justify-content: center;
    min-block-size: var(--wzc-stage-stack-button-size);
    min-inline-size: var(--wzc-stage-stack-button-size);
    padding: var(--wzc-stage-stack-button-padding);
  }

  .stage-stack-navigation button.active {
    background: var(--wzc-stage-stack-button-active-background);
    color: var(--wzc-stage-stack-button-active-color);
  }

  .stage-stack-navigation button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .stage-stack-navigation svg {
    block-size: var(--wzc-stage-stack-icon-size);
    inline-size: var(--wzc-stage-stack-icon-size);
  }

  .stage-stack-content,
  .stage-stack-content > .module-slot,
  .stage-stack-content > .module-slot.placeable-ready > * {
    block-size: 100%;
    min-block-size: 0;
  }

  .module-composition {
    display: grid;
    min-block-size: 0;
  }

  .module-composition.has-components {
    grid-template: "overlay" minmax(0, 1fr) / minmax(0, 1fr);
  }

  .module-composition.has-components > .module-slot,
  .module-composition.has-components > .component-slot {
    grid-area: overlay;
  }

  .component-slot,
  .component-node {
    block-size: 100%;
    min-block-size: 0;
    pointer-events: none;
  }

  .component-slot-content,
  .component-slot-content > .component-node,
  .component-slot-content > .component-node.placeable-ready > * {
    block-size: auto;
  }

  .component-slot-overlay {
    display: grid;
    grid-template: "overlay" minmax(0, 1fr) / minmax(0, 1fr);
    z-index: 3;
  }

  .component-slot-overlay > .component-node {
    grid-area: overlay;
  }

  .component-slot-controls {
    z-index: 4;
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content minmax(0, 1fr);
    align-items: flex-end;
    box-sizing: border-box;
    min-inline-size: 0;
    padding: 0 var(--wzc-camera-control-safe-inline)
      calc(
        var(--wzc-stage-resize-handle-block-size) +
          max(0.5rem, env(safe-area-inset-bottom))
      );
    column-gap: var(--wzc-control-dock-gap);
  }

  .control-region {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-end;
    align-items: flex-end;
    min-inline-size: 0;
    gap: var(--wzc-control-dock-gap);
    pointer-events: none;
  }

  .control-region-leading {
    justify-content: flex-end;
  }

  .control-region-center {
    justify-content: center;
  }

  .control-region-trailing {
    justify-content: flex-start;
  }

  .control-region > .component-node,
  .control-region > .component-node.placeable-ready > * {
    inline-size: auto;
    block-size: auto;
  }

  .module-slot {
    display: block;
  }

  .module-slot.placeable-loading.reserve-aspect-ratio {
    aspect-ratio: var(--wzc-camera-stage-aspect-ratio);
    background: var(--wzc-camera-stage);
  }

  .module-slot > * {
    inline-size: 100%;
    min-inline-size: 0;
  }

  .module-slot.placeable-ready > *,
  .component-node.placeable-ready > * {
    block-size: 100%;
    min-block-size: 0;
  }

  .module-placeholder,
  .layout-empty {
    display: grid;
    place-items: center;
    min-block-size: 10rem;
    color: var(--wzc-color-text-2);
    text-align: center;
  }

  .module-placeholder {
    min-block-size: 100%;
  }

  .card-toast {
    z-index: 8;
  }
`;
