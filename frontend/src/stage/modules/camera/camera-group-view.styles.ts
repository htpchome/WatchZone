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
    aspect-ratio: var(
      --wzc-camera-stage-runtime-aspect-ratio,
      var(--wzc-camera-stage-aspect-ratio)
    );
    overflow: hidden;
    background: var(--wzc-camera-stage);
  }

  .feeds {
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
    position: absolute;
    z-index: 7;
    inset-inline-start: var(--wzc-camera-control-inline-inset);
    inset-block-start: 50%;
    display: flex;
    gap: 0.25rem;
    transform: translateY(-50%);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--wzc-media-overlay-transition-duration) ease;
  }

  .feed-actions.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .feed-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    min-inline-size: var(--wzc-camera-control-size);
    min-block-size: var(--wzc-camera-control-size);
    block-size: var(--wzc-camera-control-size);
    padding-inline: 0.45rem;
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-media-overlay-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: var(--wzc-radius-pill);
    box-shadow: var(--wzc-media-overlay-shadow);
    cursor: pointer;
    touch-action: manipulation;
  }

  .feed-action.selected {
    border-color: var(--wzc-color-primary);
  }

  .feed-action svg {
    inline-size: 1rem;
    block-size: 1rem;
  }

  .feeds.solo {
    display: block;
  }

  .feed-selector {
    position: absolute;
    z-index: 5;
    inset-inline-start: var(--wzc-camera-control-inline-inset);
    inset-block-start: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.15rem;
    min-inline-size: var(--wzc-camera-control-size);
    block-size: var(--wzc-camera-control-size);
    padding-inline: 0.45rem;
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-media-overlay-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: var(--wzc-radius-pill);
    box-shadow: var(--wzc-media-overlay-shadow);
    opacity: 0;
    transform: translateY(-50%);
    cursor: pointer;
    pointer-events: none;
    transition: opacity var(--wzc-media-overlay-transition-duration) ease;
  }

  .feed-selector.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .feed-selector[hidden] {
    display: none;
  }

  .feed-selector svg {
    inline-size: 1.25rem;
    block-size: 1.25rem;
  }

  .group-controls {
    position: absolute;
    z-index: 4;
    inset: 0;
    pointer-events: none;
  }

  .group-controls > * {
    pointer-events: auto;
  }

  .stage-resize-handle {
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
