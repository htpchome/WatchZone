import { css } from "lit";

import { responsiveWidths } from "../styles/responsive-widths";

export const cardStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
  }

  :host(.card-picker-preview-host) {
    block-size: auto !important;
    height: auto !important;
    align-self: start;
  }

  :host(.panel-view-natural-height) {
    block-size: auto;
    height: auto;
    align-self: start;
  }

  :host(.height-mode-auto) {
    block-size: auto;
    height: auto;
    align-self: start;
  }

  :host(.height-mode-fit-viewport) {
    --wzc-stage-flex-track-min: var(--wzc-stage-flex-stack-min-block-size);
    --wzc-stage-flex-stack-min: var(--wzc-stage-flex-stack-min-block-size);
    --wzc-stage-flex-content-min: var(--wzc-stage-flex-media-min-block-size);
    --wzc-stage-flex-containment: size;
    --wzc-activity-list-max-block-size: none;
    --wzc-recording-list-max-block-size: none;
    --wzc-export-list-max-block-size: none;
    block-size: auto;
    min-block-size: 0;
  }

  :host(.height-mode-fill-container) {
    --wzc-stage-flex-track-min: var(--wzc-stage-flex-stack-min-block-size);
    --wzc-stage-flex-stack-min: var(--wzc-stage-flex-stack-min-block-size);
    --wzc-stage-flex-content-min: var(--wzc-stage-flex-media-min-block-size);
    --wzc-stage-flex-containment: size;
    --wzc-activity-list-max-block-size: none;
    --wzc-recording-list-max-block-size: none;
    --wzc-export-list-max-block-size: none;
    block-size: 100%;
    min-block-size: 0;
  }

  ha-card {
    isolation: isolate;
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

  ha-card.card-picker-preview-shell {
    display: block;
    block-size: auto;
    min-block-size: 0;
    padding: 0;
  }

  ha-card.card-picker-preview-shell > wzc-card-picker-preview {
    display: block;
    block-size: auto;
  }

  :host(.panel-view-natural-height) ha-card,
  :host(.panel-view-natural-height) .shell,
  :host(.height-mode-auto) ha-card,
  :host(.height-mode-auto) .shell {
    block-size: auto;
    height: auto;
  }

  :host(.height-mode-fit-viewport) ha-card,
  :host(.height-mode-fill-container) ha-card {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-block-size: min-content;
  }

  :host(.height-mode-fit-viewport) ha-card {
    block-size: auto;
    height: auto;
    min-block-size: calc(
      var(
          --wzc-fit-viewport-block-size,
          calc(100dvh - var(--wzc-ha-header-height))
        ) +
        var(--wzc-mobile-bottom-underlap, 0px)
    );
  }

  :host(.mobile-edge-to-edge.height-mode-fit-viewport) {
    --wzc-mobile-bottom-underlap: var(--wzc-safe-area-inset-bottom, 0px);
    --wzc-media-safe-area-underlap: var(--wzc-safe-area-inset-bottom, 0px);
  }

  :host(.companion-edge-to-edge-fit-viewport.height-mode-fit-viewport) {
    --wzc-mobile-bottom-underlap: 0px;
    margin-block-end: calc(-1 * var(--wzc-safe-area-inset-bottom, 0px));
  }

  :host(.height-mode-fill-container) ha-card {
    block-size: 100%;
    height: 100%;
  }

  :host(.height-mode-fit-viewport) .shell,
  :host(.height-mode-fill-container) .shell {
    block-size: auto;
    height: auto;
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
    container-type: inline-size;
  }

  .card-toast {
    z-index: 8;
  }

  .backend-recovery {
    box-sizing: border-box;
    display: grid;
    place-items: center;
    min-inline-size: 0;
    min-block-size: 0;
    overflow: auto;
    padding: clamp(1rem, 4cqi, 2rem);
  }

  .backend-recovery-content {
    inline-size: min(100%, 42rem);
  }

  .backend-recovery h2,
  .backend-recovery h3,
  .backend-recovery p {
    margin-block-start: 0;
  }

  .backend-recovery h2 {
    margin-block-end: 0.75rem;
    color: var(--wzc-color-text-1);
    font-size: clamp(1.25rem, 5cqi, 1.75rem);
    line-height: 1.2;
  }

  .backend-recovery h3 {
    margin-block: 1.25rem 0.5rem;
    color: var(--wzc-color-text-1);
    font-size: 1rem;
  }

  .backend-recovery p,
  .backend-recovery li {
    color: var(--wzc-color-text-2);
    line-height: 1.5;
  }

  .backend-recovery ol {
    margin-block: 0 1.25rem;
    padding-inline-start: 1.5rem;
  }

  .backend-recovery li + li {
    margin-block-start: 0.35rem;
  }

  .backend-recovery .recovery-caution {
    padding: 0.75rem;
    color: var(--wzc-color-warning-text);
    background: var(--wzc-color-fill-warning-quiet);
    border: 1px solid var(--wzc-color-border-warning);
    border-radius: var(--wzc-radius-small);
  }

  .backend-recovery-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-block-start: 1.25rem;
  }

  .backend-support-information {
    margin-block-start: 1.25rem;
    color: var(--wzc-color-text-2);
  }

  .backend-support-information summary {
    cursor: pointer;
  }

  .backend-support-information dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 0.35rem 0.75rem;
    margin-block-end: 0;
  }

  .backend-support-information dt {
    color: var(--wzc-color-text-3);
  }

  .backend-support-information dd {
    min-inline-size: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }

  @container (max-width: ${responsiveWidths.narrow}) {
    .stage-grid {
      --wzc-camera-control-size: 1.875rem;
      --wzc-camera-control-icon-size: 1.15rem;
      --wzc-overlay-control-min-size: var(--wzc-camera-control-size);
      --wzc-round-button-size: var(--wzc-camera-control-size);
      --wzc-camera-control-inline-inset: 0.25rem;
      --wzc-camera-side-lane-inline-size: calc(
        var(--wzc-camera-control-inline-inset) + var(--wzc-camera-control-size)
      );
      --wzc-camera-overlay-block-inset: 0.2rem;
      --wzc-camera-overlay-top-row-size: calc(
        var(--wzc-camera-control-size) + var(--wzc-camera-overlay-block-inset) +
          var(--wzc-camera-overlay-block-inset)
      );
      --wzc-camera-overlay-metadata-row-size: 1.25rem;
      --wzc-control-dock-gap: 0.25rem;
      --wzc-camera-switcher-inline-size: 7.125rem;
      --wzc-light-panel-inline-size: 4.75rem;
      --wzc-light-panel-inline-start: 50%;
      --wzc-light-panel-inline-end: auto;
      --wzc-light-panel-block-end: -0.25rem;
      --wzc-light-panel-padding: 0.4rem;
      --wzc-light-panel-transform: translateX(-50%);
      --wzc-light-slider-block-size: 3.5rem;
      --wzc-light-slider-margin-block: 0.35rem;
      --wzc-slideshow-control-inline-size: calc(
        var(--wzc-camera-control-size) + 2.2rem
      );
      --wzc-carousel-navigation-icon-size: var(--wzc-camera-control-size);
      --wzc-camera-overlay-lower-row-size: max(
        var(--wzc-ptz-panel-size),
        var(--wzc-camera-control-size)
      );
      --wzc-camera-overlay-grid-columns: var(--wzc-camera-side-lane-inline-size)
        repeat(3, minmax(0, 1fr)) var(--wzc-camera-side-lane-inline-size);
      --wzc-camera-overlay-grid-rows: var(--wzc-camera-overlay-top-row-size)
        minmax(0, 1fr) var(--wzc-camera-overlay-lower-row-size)
        var(--wzc-camera-overlay-metadata-row-size);
    }
  }
`;
