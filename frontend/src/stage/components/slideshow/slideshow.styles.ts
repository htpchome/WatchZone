import { css } from "lit";

import { mediaOverlayButtonStyles } from "../../../ui/media-overlay/button.styles";

const slideshowPrivateStyles = css`
  :host {
    display: grid;
    justify-items: var(--wzc-slideshow-justify-items, end);
    inline-size: 100%;
    pointer-events: none;
  }

  button {
    align-items: center;
    box-shadow: var(--wzc-media-overlay-shadow);
    display: grid;
    grid-auto-flow: column;
    gap: var(--wzc-overlay-control-gap);
    inline-size: var(--wzc-control-size);
    opacity: 0;
    visibility: hidden;
    padding: 0 var(--wzc-overlay-control-inline-padding);
    pointer-events: none;
  }

  button.visible {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  button:not(.active) {
    grid-auto-flow: row;
    padding: 0;
    place-items: center;
  }

  button.active {
    background: var(--wzc-media-overlay-hover-background);
    inline-size: 100%;
  }

  button.active.dimmed {
    opacity: var(--wzc-media-overlay-dimmed-opacity);
  }

  svg {
    block-size: var(--wzc-control-icon-size);
    inline-size: var(--wzc-control-icon-size);
  }

  .status {
    font-size: var(--wzc-overlay-control-status-size);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }
`;

export const slideshowStyles = [
  mediaOverlayButtonStyles,
  slideshowPrivateStyles,
];
