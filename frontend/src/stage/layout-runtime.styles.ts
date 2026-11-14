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

  .stage-stack-accessories {
    align-items: center;
    display: flex;
    gap: var(--wzc-stage-stack-navigation-gap);
    margin-inline-start: auto;
  }

  .stage-stack-accessories > * {
    margin-inline-start: 0;
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

  .stage-stack-button:first-child {
    margin-inline-start: var(--wzc-stage-stack-navigation-padding);
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
    grid-template-areas:
      "left top top top right"
      "left media media media right"
      "left lower lower lower right"
      "metadata metadata metadata metadata metadata";
    grid-template-columns: var(--wzc-camera-overlay-grid-columns);
    grid-template-rows: var(--wzc-camera-overlay-grid-rows);
    min-block-size: 0;
    container-type: inline-size;
  }

  .module-composition.has-components > .module-slot,
  .module-composition.has-components > .component-slot-content {
    grid-column: 1 / -1;
    grid-row: 1 / -1;
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

  .camera-overlay-grid {
    grid-column: 1 / -1;
    grid-row: 1 / -1;
    z-index: 3;
    display: grid;
    grid-template-areas:
      "left top top top right"
      "left media media media right"
      "left lower lower lower right"
      "metadata metadata metadata metadata metadata";
    grid-template-columns: var(--wzc-camera-overlay-grid-columns);
    grid-template-rows: var(--wzc-camera-overlay-grid-rows);
    box-sizing: border-box;
    min-inline-size: 0;
    min-block-size: 0;
    pointer-events: none;
  }

  .camera-overlay-area {
    box-sizing: border-box;
    min-inline-size: 0;
    min-block-size: 0;
    pointer-events: none;
  }

  .camera-overlay-area > .component-node {
    inline-size: auto;
    block-size: auto;
  }

  .camera-overlay-area-top {
    grid-area: top;
    display: grid;
    grid-template-columns:
      minmax(0, 1fr) var(--wzc-slideshow-control-inline-size)
      var(--wzc-control-dock-gap) var(--wzc-camera-switcher-inline-size)
      var(--wzc-control-dock-gap) var(--wzc-slideshow-control-inline-size)
      minmax(0, 1fr);
    align-items: center;
    padding-block: var(--wzc-camera-overlay-block-inset);
  }

  .camera-overlay-area-top
    > .component-node[data-component-type="camera_switcher"] {
    grid-column: 4;
    justify-self: stretch;
  }

  .camera-overlay-area-top > .component-node[data-component-type="slideshow"] {
    grid-column: 2;
    justify-self: stretch;
  }

  .camera-overlay-area-left {
    grid-area: left;
    display: grid;
    align-items: stretch;
    justify-items: center;
  }

  .camera-overlay-area-media {
    grid-area: media;
    display: grid;
    place-items: center;
  }

  .camera-overlay-area-right {
    grid-area: right;
    display: grid;
    place-items: center;
  }

  .camera-overlay-area-lower {
    grid-area: lower;
    --wzc-camera-control-size: var(--wzc-camera-lower-control-size);
    --wzc-camera-control-icon-size: var(--wzc-camera-lower-control-icon-size);
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content minmax(0, 1fr);
    align-items: end;
    gap: var(--wzc-control-dock-gap);
  }

  .lower-control-group {
    display: grid;
    grid-auto-columns: max-content;
    grid-auto-flow: column;
    align-items: end;
    gap: var(--wzc-control-dock-gap);
    min-inline-size: 0;
    pointer-events: none;
  }

  .lower-control-group > .component-node {
    inline-size: auto;
    block-size: auto;
  }

  .lower-control-group.leading {
    grid-column: 1;
    justify-self: end;
  }

  .lower-control-group.center {
    grid-column: 2;
    justify-self: center;
  }

  .lower-control-group.trailing {
    grid-column: 3;
    justify-self: end;
  }

  .camera-overlay-area-metadata {
    grid-area: metadata;
    display: grid;
    align-items: center;
  }

  .control-placeholder {
    display: block;
    inline-size: var(--wzc-camera-control-size);
    block-size: var(--wzc-camera-control-size);
    pointer-events: none;
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

  .module-slot.placeable-ready > * {
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
    margin-block-end: calc(
      var(--wzc-media-day-header-gap) - var(--wzc-event-list-gap)
    );
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
`;
