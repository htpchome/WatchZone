import { css } from "lit";

export const companionPhoneLandscapeStyles = css`
  :host(.companion-phone-orientation-overlay) {
    position: fixed !important;
    z-index: 1000;
    inset: 0 !important;
    inline-size: 100vw !important;
    block-size: 100dvh !important;
    margin: 0 !important;
  }

  :host(.companion-phone-orientation-transitioning) {
    --wzc-activity-thumbnail-outline-width: 0px;
    --wzc-camera-activity-outline-width: 0px;
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

  :host(.companion-phone-orientation-overlay.height-mode-fit-viewport) ha-card {
    block-size: 100%;
    height: 100%;
    min-block-size: 0;
    border-radius: 0;
    box-shadow: none;
  }

  :host(.companion-phone-landscape.height-mode-fit-viewport) ha-card {
    padding-block: env(safe-area-inset-top, 0px)
      var(--wzc-safe-area-inset-bottom);
    padding-inline: var(--wzc-companion-landscape-inline-inset);
  }

  :host(.companion-phone-orientation-overlay.height-mode-fit-viewport) .shell {
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
    grid-template-rows: max-content max-content max-content;
    height: 100%;
  }

  :host(.companion-phone-landscape) .stage-placement {
    min-block-size: 0 !important;
  }

  :host(.companion-phone-landscape)
    .stage-placement[data-layout-node$="default-camera-module"] {
    margin-block-start: calc(var(--wzc-stage-module-gap) + 0.5rem);
  }

  :host(.companion-phone-landscape)
    .stage-placement[data-layout-node$="default-activity-navigation-module"] {
    justify-self: end;
    inline-size: max-content;
    max-inline-size: 100%;
    margin-block-end: 0;
  }

  :host(.companion-phone-landscape)
    .stage-placement[data-layout-node$="default-activity-stack"] {
    margin-block-start: calc(var(--wzc-stage-module-gap) + 0.125rem);
  }

  :host(.companion-phone-landscape.landscape-camera-overlay-active)
    .stage-grid {
    grid-template-rows:
      var(--wzc-companion-camera-base-block-size) max-content
      max-content;
  }

  :host(.companion-phone-landscape.landscape-camera-overlay-active)
    .stage-placement[data-layout-node$="default-camera-module"] {
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

  :host(.companion-phone-landscape.landscape-camera-overlay-settling)
    .stage-placement[data-layout-node$="default-camera-module"],
  :host(.companion-phone-landscape.landscape-camera-overlay-settling)
    .companion-camera-pull-handle {
    transition:
      inset-block-start 240ms cubic-bezier(0.2, 0.8, 0.2, 1),
      inset-inline-start 240ms cubic-bezier(0.2, 0.8, 0.2, 1),
      inline-size 240ms cubic-bezier(0.2, 0.8, 0.2, 1),
      block-size 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .companion-camera-pull-handle {
    position: fixed;
    z-index: 21;
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
    -webkit-tap-highlight-color: transparent;
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

  @media (prefers-reduced-motion: reduce) {
    :host(.companion-phone-landscape.landscape-camera-overlay-settling)
      .stage-placement[data-layout-node$="default-camera-module"],
    :host(.companion-phone-landscape.landscape-camera-overlay-settling)
      .companion-camera-pull-handle {
      transition: none;
    }
  }
`;
