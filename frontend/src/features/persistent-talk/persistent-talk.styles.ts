import { css } from "lit";

import { responsiveWidths } from "../../styles/responsive-widths";

export const persistentTalkStyles = css`
  :host {
    display: contents;
    font-family: var(--wzc-font-family);
  }

  .persistent-talk {
    box-sizing: border-box;
    position: fixed;
    z-index: 2147483647;
    inset-block: auto max(0.5rem, var(--wzc-safe-area-inset-bottom));
    inset-inline: auto;
    left: var(--wzc-persistent-talk-center-x, 50%);
    margin: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.65rem;
    inline-size: min(
      42rem,
      calc(var(--wzc-persistent-talk-available-width, 100vw) - 1rem)
    );
    min-block-size: 4rem;
    padding: 0.45rem 0.65rem;
    color: var(--wzc-color-text-1);
    background: var(--wzc-popover-background, Canvas);
    backdrop-filter: var(--wzc-popover-backdrop-filter, none);
    border: 1px solid var(--wzc-color-border);
    border-radius: var(--wzc-radius-pill);
    box-shadow: var(--wzc-shadow-medium);
    transform: translateX(-50%);
    overflow: visible;
  }

  .dismiss,
  .navigate {
    --wzc-round-button-background: var(--wzc-capability-control-background);
    --wzc-round-button-border-color: transparent;
    --wzc-round-button-color: var(--wzc-capability-control-color);
    --wzc-round-button-hover-background: var(
      --wzc-capability-control-hover-background
    );
  }

  .identity {
    min-inline-size: 0;
    max-inline-size: 10rem;
    line-height: 1.12;
  }

  .title,
  .camera-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title {
    font-size: var(--wzc-font-size-medium);
    font-weight: var(--wzc-font-weight-medium);
  }

  .camera-name {
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-medium);
  }

  .controls {
    position: absolute;
    inset-inline-start: 50%;
    transform: translateX(-50%);
  }

  @media (max-width: ${responsiveWidths.compact}) {
    .persistent-talk {
      left: 50%;
      inset-block-end: 0.5rem;
      inline-size: calc(100vw - 1rem);
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 0.4rem;
      padding: 0.4rem 0.5rem;
      border-radius: var(--wzc-radius-large);
      padding-inline: max(0.5rem, var(--wzc-safe-area-inset-left))
        max(0.5rem, var(--wzc-safe-area-inset-right));
    }

    .identity {
      grid-column: 2;
      grid-row: 1;
      display: flex;
      inline-size: max-content;
      max-inline-size: min(10rem, 100%);
      align-items: baseline;
      gap: 0.35rem;
      justify-self: start;
    }

    .controls {
      position: absolute;
      inset-inline-start: auto;
      inset-block-start: 50%;
      left: var(--wzc-persistent-talk-compact-controls-left, 50%);
      transform: translateY(-50%);
    }

    .navigate {
      grid-column: 3;
      grid-row: 1;
    }
  }
`;
