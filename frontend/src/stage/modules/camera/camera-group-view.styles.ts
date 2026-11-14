import { css } from "lit";

export const cameraGroupViewStyles = css`
  :host,
  .group,
  .feeds,
  .feed,
  wzc-camera-view {
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
  }

  :host,
  .group,
  .feed,
  wzc-camera-view {
    display: block;
  }

  :host {
    container-type: inline-size;
  }

  .group {
    position: relative;
    display: grid;
    grid-template-areas:
      "left top top top right"
      "left media media media right"
      "left lower lower lower right"
      "metadata metadata metadata metadata metadata";
    grid-template-columns: var(--wzc-camera-overlay-grid-columns);
    grid-template-rows: var(--wzc-camera-overlay-grid-rows);
    container-type: size;
    aspect-ratio: var(
      --wzc-camera-stage-runtime-aspect-ratio,
      var(--wzc-camera-stage-aspect-ratio)
    );
    overflow: hidden;
    background: var(--wzc-camera-stage);
  }

  .feeds {
    grid-column: 1 / -1;
    grid-row: 1 / -1;
    display: grid;
  }

  .feeds.side-by-side {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .feeds.stacked {
    grid-template-rows: repeat(2, minmax(0, 1fr));
  }

  .feed {
    position: relative;
    overflow: hidden;
    container-type: size;
  }

  .feed wzc-camera-view {
    --wzc-live-indicator-inline-end: max(
      0.5rem,
      calc(50cqi - 88.8889cqb + 0.5rem)
    );
  }

  .feed::after {
    position: absolute;
    z-index: 6;
    inset: 0;
    border: var(--wzc-camera-activity-outline-width) solid transparent;
    content: "";
    pointer-events: none;
  }

  .feed.activity-alert::after {
    border-color: var(--wzc-camera-alert-outline-color);
  }

  .feed.activity-detection::after {
    border-color: var(--wzc-camera-detection-outline-color);
  }

  .feeds.side-by-side .feed + .feed {
    border-inline-start: 1px solid var(--wzc-color-border-subtle);
  }

  .feeds.stacked .feed + .feed {
    border-block-start: 1px solid var(--wzc-color-border-subtle);
  }

  .feed.hidden {
    display: none;
  }

  .feed-actions {
    grid-area: left;
    z-index: 7;
    display: grid;
    grid-template-rows: repeat(2, minmax(0, 1fr));
    align-items: start;
    justify-items: center;
    gap: 0.25rem;
    padding-block: var(--wzc-camera-overlay-block-inset);
    container-type: size;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--wzc-media-overlay-transition-duration) ease;
  }

  .feed-actions.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .feed-action {
    position: relative;
    grid-auto-flow: column;
    grid-template-columns: auto auto;
    gap: 0.12rem;
  }

  .feed-action-set {
    display: grid;
    gap: 0.25rem;
    justify-items: center;
  }

  .feed-action-set[data-feed-index="1"] {
    align-self: end;
  }

  .feed-action svg {
    inline-size: min(var(--wzc-control-icon-size), 1.25rem);
    block-size: min(var(--wzc-control-icon-size), 1.25rem);
  }

  .feed-action.selected {
    --wzc-control-border-color: var(--wzc-color-primary);
  }

  .position-label {
    color: currentcolor;
    font-size: var(--wzc-overlay-control-label-size);
    font-weight: var(--wzc-font-weight-bold);
    line-height: 1;
    pointer-events: none;
  }

  .feeds.solo {
    display: block;
  }

  .group-controls {
    grid-area: right;
    align-self: stretch;
    justify-self: stretch;
    z-index: 4;
    pointer-events: none;
  }

  .group-controls > * {
    pointer-events: auto;
  }

  .stage-resize-handle {
    grid-area: metadata;
    place-self: end center;
    z-index: 7;
  }

  .group.stage-resizing .stage-resize-handle {
    opacity: var(--wzc-stage-resize-handle-active-opacity);
  }

  .group:fullscreen .stage-resize-handle,
  .group:-webkit-full-screen .stage-resize-handle {
    display: none;
  }

  @container (max-width: 599px) {
    .feeds {
      display: block;
    }

    .feed:not(.visible-mobile) {
      display: none;
    }
  }
`;
