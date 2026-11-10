import { css } from "lit";

export const mediaDayHeaderStyles = css`
  :host {
    position: sticky;
    z-index: 5;
    inset-block-start: 0;
    display: flex;
    align-items: center;
    justify-content: center;
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

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
