import { css } from "lit";

export const companionPhoneLandscapeStyles = css`
  :host(.companion-phone-orientation-transitioning) .stage-grid {
    pointer-events: none;
  }

  :host(.companion-phone-orientation-transitioning)
    .stage-container[data-layout-node$="default-camera-surface"],
  :host(.companion-phone-orientation-transitioning)
    .stage-container[data-layout-node$="default-activity-surface"] {
    will-change: transform;
  }

  :host(.companion-phone-landscape) {
    position: fixed !important;
    z-index: 1000;
    inset: 0 !important;
    inline-size: 100vw !important;
    block-size: 100dvh !important;
    margin: 0 !important;
  }

  :host(.companion-phone-landscape.height-mode-fit-viewport) {
    --wzc-activity-list-max-block-size: calc(
      var(--wzc-media-day-header-block-size) + 3 *
        var(--wzc-event-tile-block-size) + 2 * var(--wzc-event-list-gap) +
        var(--wzc-media-day-header-gap) + var(--wzc-event-list-padding)
    );
    --wzc-activity-list-min-block-size: var(--wzc-activity-list-max-block-size);
    --wzc-companion-landscape-inline-inset: max(
      0.25rem,
      calc(env(safe-area-inset-left, 0px) - 0.375rem),
      calc(env(safe-area-inset-right, 0px) - 0.375rem)
    );
    --wzc-camera-square-radius: var(--wzc-radius-card);
    --wzc-export-list-max-block-size: calc(
      var(--wzc-media-day-header-block-size) + 3 *
        var(--wzc-export-tile-block-size) + 2 * var(--wzc-export-list-gap) + 2 *
        var(--wzc-export-list-padding)
    );
    --wzc-export-list-min-block-size: var(--wzc-export-list-max-block-size);
    --wzc-media-safe-area-underlap: 0px;
    --wzc-recording-list-max-block-size: calc(
      var(--wzc-media-day-header-block-size) + 3 *
        var(--wzc-recording-tile-block-size) + 2 *
        var(--wzc-recording-list-gap) + var(--wzc-media-day-header-gap) +
        var(--wzc-recording-list-padding)
    );
    --wzc-recording-list-min-block-size: var(
      --wzc-recording-list-max-block-size
    );
    --wzc-review-state-block-size: 1.5rem;
    --wzc-review-state-border-radius: 50%;
    --wzc-review-state-gap: 0;
    --wzc-review-state-inline-size: 1.5rem;
    --wzc-review-state-inset-block-end: 0.12rem;
    --wzc-review-state-inset-inline-start: calc(
      var(--wzc-event-thumbnail-inline-size) + var(--wzc-event-tile-gap)
    );
    --wzc-review-state-justify-content: center;
    --wzc-review-state-label-display: none;
    --wzc-review-state-margin-block-start: 0;
    --wzc-review-state-min-block-size: 1.5rem;
    --wzc-review-state-padding: 0;
    --wzc-review-state-position: absolute;
    --wzc-stage-resize-handle-visibility: hidden;
    --wzc-stage-flex-track-min: 0px;
    --wzc-stage-flex-stack-min: 0px;
    --wzc-stage-flex-content-min: 0px;
  }

  :host(.companion-phone-landscape.height-mode-fit-viewport) ha-card {
    box-sizing: border-box;
    block-size: 100%;
    height: 100%;
    min-block-size: 0;
    padding-block: env(safe-area-inset-top, 0px) 0;
    padding-inline: var(--wzc-companion-landscape-inline-inset);
    border-radius: 0;
    box-shadow: none;
  }

  :host(.companion-phone-landscape.height-mode-fit-viewport) .shell {
    block-size: 100%;
    height: 100%;
    min-block-size: 0;
  }

  :host(.companion-phone-landscape) .stage-grid {
    position: relative;
    align-self: start;
    block-size: 100%;
    column-gap: calc(var(--wzc-stage-module-gap) + 0.25rem);
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
  }

  :host(.companion-phone-landscape) .stage-placement {
    min-block-size: 0 !important;
  }

  :host(.companion-phone-landscape)
    .stage-placement[data-layout-node$="default-camera-module"] {
    margin-block-start: calc(var(--wzc-stage-module-gap) + 0.5rem + 1px);
  }

  :host(.companion-phone-landscape)
    .stage-placement[data-layout-node$="default-activity-navigation-module"] {
    align-self: end;
    inline-size: 100%;
    max-inline-size: 100%;
    margin-block-end: 1rem;
  }

  :host(.companion-phone-landscape)
    .stage-placement[data-layout-node$="default-activity-stack"] {
    margin-block-start: calc(var(--wzc-stage-module-gap) + 0.125rem);
  }

  :host(.companion-phone-landscape)
    .stage-container[data-layout-node$="default-camera-surface"],
  :host(.companion-phone-landscape)
    .stage-container[data-layout-node$="default-activity-surface"] {
    block-size: 100%;
    min-block-size: 0;
  }

  :host(.companion-phone-landscape.landscape-camera-overlay-active)
    .stage-container[data-layout-node$="default-camera-surface"] {
    z-index: 30;
    grid-template-rows:
      var(--wzc-companion-camera-base-block-size) max-content
      minmax(0, 1fr);
  }

  :host(.companion-phone-landscape.landscape-camera-overlay-active)
    .stage-placement[data-layout-node$="default-camera-module"] {
    --wzc-camera-stage-runtime-aspect-ratio: auto;
    --wzc-live-fit: contain;
    position: absolute;
    z-index: 20;
    inset-block-start: var(--wzc-companion-camera-overlay-top);
    inset-inline-start: var(--wzc-companion-camera-overlay-left);
    box-sizing: border-box;
    inline-size: var(--wzc-companion-camera-overlay-inline-size);
    block-size: var(--wzc-companion-camera-overlay-block-size);
    margin: 0;
  }

  :host(.companion-phone-landscape.landscape-camera-overlay-expanded)
    .stage-placement[data-layout-node$="default-camera-module"] {
    --wzc-camera-square-radius: 0px;
  }

  :host(.companion-phone-landscape.landscape-camera-overlay-dragging)
    .stage-placement[data-layout-node$="default-camera-module"],
  :host(.companion-phone-landscape.landscape-camera-overlay-settling)
    .stage-placement[data-layout-node$="default-camera-module"] {
    --wzc-camera-activity-outline-width: 0px;
  }

  :host(.companion-phone-landscape) .companion-camera-pull-handle {
    position: fixed;
    z-index: 31;
    inset-block-start: var(--wzc-companion-camera-pull-block-start);
    inset-inline-start: var(--wzc-companion-camera-pull-inline-start);
    box-sizing: border-box;
    inline-size: 2.75rem;
    block-size: 8.5rem;
    padding: 0;
    touch-action: none;
    transform: translate(-50%, -50%);
    color: var(--wzc-color-text-2);
    background: transparent;
    border: 0;
    cursor: ew-resize;
    opacity: 0;
    visibility: hidden;
    -webkit-tap-highlight-color: transparent;
  }

  :host(.companion-phone-landscape.companion-camera-pull-ready)
    .companion-camera-pull-handle {
    visibility: visible;
  }

  .companion-camera-pull-handle::before {
    display: block;
    box-sizing: border-box;
    inline-size: 3px;
    block-size: 8rem;
    margin: auto;
    background: currentcolor;
    border: 0;
    border-radius: 1.5px;
    content: "";
  }

  .companion-camera-pull-handle:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }
`;
