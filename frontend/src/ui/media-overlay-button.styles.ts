import { css } from "lit";

/** Shared theme-aware button surface for controls placed over camera media. */
export const mediaOverlayButtonStyles = css`
  .wzc-media-overlay-button {
    appearance: none;
    background: var(--wzc-media-overlay-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: var(--wzc-media-overlay-radius);
    box-sizing: border-box;
    color: var(--wzc-media-overlay-color);
    cursor: pointer;
    font: inherit;
    min-block-size: 2rem;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .wzc-media-overlay-button:focus-visible {
    background: var(--wzc-media-overlay-hover-background);
    outline: 2px solid var(--wzc-media-overlay-color);
    outline-offset: -2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .wzc-media-overlay-button:hover {
      background: var(--wzc-media-overlay-hover-background);
    }
  }
`;
