import { css } from "lit";

/** Shared structure for compact, single-selection control bars. */
export const segmentedControlStyles = css`
  .segmented-control {
    display: flex;
    box-sizing: border-box;
    align-items: stretch;
    min-inline-size: 0;
  }

  .segmented-control-option {
    box-sizing: border-box;
    min-inline-size: 0;
    font: inherit;
    white-space: nowrap;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .segmented-control-option:disabled {
    cursor: not-allowed;
  }
`;
