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
  }

  ha-card.square-outer-corners {
    --wzc-card-radius: 0px;
    border-radius: 0 !important;
  }

  ha-card.no-outer-shadow {
    --wzc-card-outer-shadow: none;
    box-shadow: none !important;
  }

  ha-card.no-outer-padding .shell {
    padding: 0;
  }

  .shell {
    box-sizing: border-box;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    align-items: stretch;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 0;
    padding: var(--wzc-card-padding);
    overflow: hidden;
  }

  .stage-grid,
  .stage-placement,
  .module-composition,
  .module-slot,
  .component-slot,
  .component-node,
  .module-placeholder,
  .module-error,
  .layout-empty,
  .layout-error {
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
  .module-error,
  .layout-empty,
  .layout-error {
    display: grid;
    place-items: center;
    min-block-size: 10rem;
    color: var(--wzc-color-text-2);
    text-align: center;
  }

  .module-placeholder {
    min-block-size: 100%;
  }

  .module-error,
  .layout-error {
    gap: 0.75rem;
    color: var(--wzc-color-error);
  }

  button {
    min-block-size: 2.5rem;
    padding-inline: 1rem;
    color: var(--wzc-color-text-1);
    background: var(--wzc-color-fill-primary);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-button);
    font: inherit;
    cursor: pointer;
  }
`;
