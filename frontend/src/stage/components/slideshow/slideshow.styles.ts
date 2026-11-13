import { css } from "lit";

import { mediaOverlayButtonStyles } from "../../../ui/media-overlay-button.styles";

const slideshowPrivateStyles = css`
  :host {
    display: block;
    pointer-events: none;
  }

  button {
    align-items: center;
    box-shadow: var(--wzc-media-overlay-shadow);
    display: flex;
    gap: 0.32rem;
    opacity: 0;
    padding: 0.3rem 0.48rem;
    pointer-events: none;
    transition:
      opacity var(--wzc-media-overlay-transition-duration) ease,
      background var(--wzc-media-overlay-transition-duration) ease;
  }

  button.visible {
    opacity: 1;
    pointer-events: auto;
  }

  button.active {
    background: var(--wzc-media-overlay-hover-background);
  }

  button.active.dimmed {
    opacity: var(--wzc-media-overlay-dimmed-opacity);
  }

  svg {
    block-size: 1.1rem;
    inline-size: 1.1rem;
  }

  .status {
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
`;

export const slideshowStyles = [
  mediaOverlayButtonStyles,
  slideshowPrivateStyles,
];
