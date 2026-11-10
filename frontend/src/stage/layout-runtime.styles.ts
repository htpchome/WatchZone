import { css } from "lit";

export const stageRuntimeStyles = css`
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
    gap: var(--wzc-stage-module-gap);
  }

  .stage-stack {
    display: grid;
    grid-template-rows: max-content minmax(0, 1fr);
    min-block-size: 0;
  }

  .stage-stack-navigation {
    align-items: center;
    display: flex;
    justify-content: flex-start;
    gap: var(--wzc-stage-stack-navigation-gap);
    padding-block: var(--wzc-stage-stack-navigation-padding);
  }

  .stage-stack-button {
    --wzc-round-button-size: var(--wzc-stage-stack-button-size);
    --wzc-round-button-icon-size: var(--wzc-stage-stack-icon-size);
    --wzc-round-button-color: var(--wzc-stage-stack-button-color);
    --wzc-round-button-background: var(--wzc-stage-stack-button-background);
    --wzc-round-button-border-color: transparent;
    --wzc-round-button-hover-background: var(
      --wzc-stage-stack-button-background
    );
    outline: none;
  }

  .stage-stack-button.active {
    --wzc-round-button-background: var(
      --wzc-stage-stack-button-active-background
    );
    --wzc-round-button-color: var(--wzc-stage-stack-button-active-color);
    --wzc-round-button-hover-background: var(
      --wzc-stage-stack-button-active-background
    );
    color: var(--wzc-stage-stack-button-active-color);
    opacity: 1;
  }

  .stage-stack-button.active > svg,
  .stage-stack-button.active > svg path {
    color: var(--wzc-stage-stack-button-active-color);
    fill: currentcolor;
    opacity: 1;
  }

  .stage-stack-button:focus-visible {
    outline: none;
  }

  .stage-stack-button:focus-visible:not(.active),
  .stage-stack-button.hovered:not(.active, :disabled) {
    color: var(--wzc-stage-stack-button-hover-color);
  }

  .stage-stack-button:active:not(.active) {
    --wzc-round-button-background: var(
      --wzc-stage-stack-button-active-background
    );
    --wzc-round-button-color: var(--wzc-stage-stack-button-active-color);
  }

  .stage-stack-content,
  .stage-stack-content > .module-slot,
  .stage-stack-content > .module-slot.placeable-ready > * {
    block-size: 100%;
    min-block-size: 0;
  }

  .module-composition {
    position: relative;
    display: grid;
    min-block-size: 0;
    container-type: inline-size;
  }

  .module-composition.has-components {
    grid-template: "overlay" minmax(0, 1fr) / minmax(0, 1fr);
  }

  .module-composition.has-components > .module-slot,
  .module-composition.has-components > .component-slot-content {
    grid-area: overlay;
  }

  .module-composition.has-components > .component-slot-overlay,
  .module-composition.has-components > .component-slot-controls {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
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
    z-index: 3;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: repeat(3, minmax(0, 1fr));
    box-sizing: border-box;
    padding-block-start: var(--wzc-camera-overlay-block-inset);
    padding-block-end: calc(
      var(--wzc-stage-resize-handle-block-size) +
        var(--wzc-camera-overlay-block-inset)
    );
    padding-inline-start: var(--wzc-camera-overlay-inline-inset);
    padding-inline-end: var(--wzc-camera-overlay-trailing-clearance);
  }

  .component-slot-overlay > .component-node {
    align-self: center;
    justify-self: center;
    inline-size: auto;
    block-size: auto;
  }

  .component-slot-overlay > .overlay-region-top-leading {
    grid-area: 1 / 1;
    align-self: start;
    justify-self: start;
  }

  .component-slot-overlay > .overlay-region-top-center {
    grid-area: 1 / 2;
    align-self: start;
  }

  .component-slot-overlay > .overlay-region-top-trailing {
    grid-area: 1 / 3;
    align-self: start;
    justify-self: end;
  }

  .component-slot-overlay > .overlay-region-center-leading {
    grid-area: 2 / 1;
    justify-self: start;
  }

  .component-slot-overlay > .overlay-region-center {
    grid-area: 2 / 2;
  }

  .component-slot-overlay > .overlay-region-center-trailing {
    grid-area: 2 / 3;
    justify-self: end;
  }

  .component-slot-overlay > .overlay-region-bottom-leading {
    grid-area: 3 / 1;
    align-self: end;
    justify-self: start;
  }

  .component-slot-overlay > .overlay-region-bottom-center {
    grid-area: 3 / 2;
    align-self: end;
  }

  .component-slot-overlay > .overlay-region-bottom-trailing {
    grid-area: 3 / 3;
    align-self: end;
    justify-self: end;
  }

  .component-slot-controls {
    z-index: 4;
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content minmax(0, 1fr);
    align-items: flex-end;
    box-sizing: border-box;
    min-inline-size: 0;
    padding: 0 var(--wzc-camera-control-inline-inset)
      var(--wzc-camera-control-bottom-inset);
    column-gap: var(--wzc-control-dock-gap);
  }

  .control-region {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-end;
    align-items: flex-end;
    box-sizing: border-box;
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
    justify-content: flex-end;
    padding-inline-end: calc(
      var(--wzc-camera-overlay-trailing-clearance) - var(
          --wzc-camera-control-inline-inset
        )
    );
  }

  .control-region > .component-node,
  .control-region > .component-node.placeable-ready > * {
    inline-size: auto;
    block-size: auto;
  }

  .module-slot {
    display: block;
  }

  .module-slot.placeable-loading.placeholder-camera {
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

  .activity-skeleton {
    align-content: start;
    box-sizing: border-box;
    block-size: 100%;
    max-block-size: calc(
      var(--wzc-media-day-header-block-size) + 5 *
        var(--wzc-event-tile-block-size) + 5 * var(--wzc-event-list-gap) +
        var(--wzc-event-list-padding)
    );
    min-block-size: calc(
      var(--wzc-media-day-header-block-size) + 3 *
        var(--wzc-event-tile-block-size) + 3 * var(--wzc-event-list-gap) +
        var(--wzc-event-list-padding)
    );
    gap: var(--wzc-event-list-gap);
    overflow: hidden;
    padding: 0 var(--wzc-event-list-padding) var(--wzc-event-list-padding);
  }

  .activity-skeleton-row {
    display: block;
    block-size: var(--wzc-event-tile-block-size);
    inline-size: 100%;
    background: var(--wzc-event-tile-background);
    border-radius: var(--wzc-event-tile-radius);
    box-shadow: var(--wzc-event-tile-shadow);
  }

  .activity-skeleton-heading {
    display: block;
    block-size: var(--wzc-media-day-header-block-size);
    inline-size: 100%;
  }

  .activity-skeleton.no-shadows .activity-skeleton-row {
    box-shadow: none;
  }

  .camera-navigation-skeleton {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    block-size: var(--wzc-camera-navigation-block-size);
    min-block-size: var(--wzc-camera-navigation-block-size);
    gap: var(--wzc-camera-navigation-gap);
    padding: var(--wzc-camera-navigation-padding);
    background: var(--wzc-camera-navigation-background);
  }

  .camera-navigation-skeleton.rounded {
    border-radius: var(--wzc-radius-card);
  }

  .camera-navigation-skeleton.square {
    border-radius: 0;
  }

  .camera-navigation-skeleton:not(.no-shadows) {
    box-shadow: var(--wzc-shadow-medium);
  }

  .camera-navigation-skeleton-item {
    display: block;
    block-size: var(--wzc-camera-navigation-item-size);
    inline-size: min(20%, 6rem);
    background: color-mix(
      in srgb,
      var(--wzc-camera-navigation-color) 10%,
      transparent
    );
    border-radius: var(--wzc-radius-pill);
  }

  .visually-hidden {
    position: absolute;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    inline-size: 1px;
    block-size: 1px;
    white-space: nowrap;
  }

  @container (max-width: 480px) {
    .component-slot-overlay {
      padding-block-end: 0.25rem;
    }

    .component-slot-controls {
      --wzc-camera-control-bottom-inset: 1.25rem;
    }
  }
`;
