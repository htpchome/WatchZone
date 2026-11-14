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

  @container (max-width: 599px) {
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
