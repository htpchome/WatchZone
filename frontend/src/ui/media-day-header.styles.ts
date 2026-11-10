import { css } from "lit";

export const mediaDayHeaderStyles = css`
  :host {
    z-index: 5;
    display: grid;
    grid-template-columns:
      var(--wzc-media-day-navigation-size) minmax(0, 1fr)
      var(--wzc-media-day-navigation-size);
    align-items: center;
    box-sizing: border-box;
    block-size: var(--wzc-media-day-header-block-size);
    min-block-size: var(--wzc-media-day-header-block-size);
    color: var(--wzc-media-day-header-color);
    background: var(--wzc-media-day-header-background);
    font-family: var(--wzc-font-family);
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-semibold);
    line-height: var(--wzc-line-height-condensed);
    pointer-events: none;
  }

  slot {
    display: grid;
    place-items: center;
  }

  ::slotted(*) {
    pointer-events: auto;
  }

  .label {
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
