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

  .stage-container {
    display: grid;
    grid-template-columns: repeat(
      var(--wzc-stage-container-columns),
      minmax(0, 1fr)
    );
    grid-template-rows: var(--wzc-stage-container-rows);
    align-content: start;
    align-items: stretch;
    gap: var(--wzc-stage-module-gap);
  }

  .stage-placement[data-layout-node$="default-activity-navigation-module"] {
    margin-block-end: calc(-1 * var(--wzc-stage-module-gap));
  }

  .stage-stack {
    contain: var(--wzc-stage-flex-containment, none);
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-block-size: var(--wzc-stage-flex-stack-min, 0);
  }

  .stage-stack-content,
  .stage-stack-content > .module-slot,
  .stage-stack-content > .module-slot.placeable-ready > * {
    block-size: 100%;
    min-block-size: var(--wzc-stage-flex-content-min, 0);
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

  .module-composition[data-module-type="activity-navigation"] {
    grid-template-areas: "content";
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto;
  }

  .module-composition[data-module-type="activity-navigation"]
    > .component-slot-content {
    z-index: 1;
    display: grid;
    grid-template-columns:
      minmax(0, 1fr) calc(3 * var(--wzc-camera-control-size) + 2px)
      minmax(0, 1fr);
    align-items: center;
    align-self: stretch;
    column-gap: var(--wzc-control-dock-gap);
  }

  .module-composition[data-module-type="activity-navigation"]
    > .component-slot-content
    > .component-node {
    inline-size: max-content;
    block-size: auto;
    align-self: center;
  }

  .module-composition[data-module-type="activity-navigation"]
    > .component-slot-content
    > .component-node[data-component-type="light_control"] {
    grid-column: 1;
    justify-self: end;
  }

  .module-composition[data-module-type="activity-navigation"]
    > .component-slot-content
    > .component-node[data-component-type="two_way_talk"] {
    display: grid;
    grid-column: 2;
    inline-size: 100%;
    justify-items: center;
  }

  .stage-stack-content > .module-composition[data-module-type="ptz-panel"],
  .module-composition[data-module-type="ptz-panel"] > .component-slot-content,
  .module-composition[data-module-type="ptz-panel"]
    > .component-slot-content
    > .component-node,
  .module-composition[data-module-type="ptz-panel"]
    > .component-slot-content
    > .component-node.placeable-ready
    > * {
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

  .camera-overlay-grid {
    position: absolute;
    inset: 0;
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

  .camera-overlay-area-top
    > .component-node[data-component-type="slideshow"]:only-child {
    --wzc-slideshow-justify-items: center;
    grid-column: 1 / -1;
    justify-self: center;
    inline-size: var(--wzc-slideshow-control-inline-size);
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

  .stage-placement.placeable-loading.placeholder-control {
    padding-block: var(--wzc-stage-stack-navigation-padding);
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
    max-block-size: var(
      --wzc-activity-list-max-block-size,
      calc(
        var(--wzc-media-day-header-block-size) + 5 *
          var(--wzc-event-tile-block-size) + 5 * var(--wzc-event-list-gap) +
          var(--wzc-event-list-padding)
      )
    );
    min-block-size: var(
      --wzc-activity-list-min-block-size,
      calc(
        var(--wzc-media-day-header-block-size) + 3 *
          var(--wzc-event-tile-block-size) + 3 * var(--wzc-event-list-gap) +
          var(--wzc-event-list-padding)
      )
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
