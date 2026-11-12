import { css } from "lit";

/** Shared visual and interaction contract for single-selection control bars. */
export const segmentedControlStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    min-inline-size: 0;
    --wzc-segmented-background: var(--wzc-selection-bar-background);
    --wzc-segmented-border: 0;
    --wzc-segmented-radius: var(--wzc-radius-pill);
    --wzc-segmented-gap: var(--wzc-selection-bar-gap);
    --wzc-segmented-padding: var(--wzc-selection-bar-padding);
    --wzc-segmented-option-min-block-size: 2rem;
    --wzc-segmented-option-padding-inline: 0.45rem;
    --wzc-segmented-option-color: var(--wzc-selection-bar-color);
    --wzc-segmented-selected-color: var(--wzc-selection-bar-active-color);
    --wzc-segmented-selected-background: var(
      --wzc-selection-bar-active-background
    );
    --wzc-segmented-selected-shadow: var(--wzc-selection-bar-active-shadow);
  }

  .segmented-control {
    display: flex;
    box-sizing: border-box;
    align-items: center;
    gap: var(--wzc-segmented-gap);
    inline-size: 100%;
    min-inline-size: 0;
    padding: var(--wzc-segmented-padding);
    overflow: hidden;
    color: var(--wzc-segmented-option-color);
    background: var(--wzc-segmented-background);
    border: var(--wzc-segmented-border);
    border-radius: var(--wzc-segmented-radius);
  }

  .segmented-control-option {
    flex: 1 1 0;
    box-sizing: border-box;
    min-inline-size: 0;
    min-block-size: var(--wzc-segmented-option-min-block-size);
    padding: 0.25rem var(--wzc-segmented-option-padding-inline);
    overflow: hidden;
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-pill);
    font: inherit;
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-medium);
    white-space: nowrap;
    text-overflow: ellipsis;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .option-content {
    align-items: center;
    display: inline-flex;
    gap: 0.25rem;
    max-inline-size: 100%;
  }

  .option-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .option-indicator {
    display: inline-flex;
    flex: 0 0 auto;
  }

  .option-indicator svg {
    block-size: 1em;
    inline-size: 1em;
  }

  .option-indicator.danger {
    color: var(--wzc-color-error);
  }

  .option-indicator.warning {
    color: var(--wzc-color-warning);
  }

  .segmented-control-option[aria-checked="true"],
  .segmented-control-option[aria-selected="true"] {
    color: var(--wzc-segmented-selected-color);
    background: var(--wzc-segmented-selected-background);
    box-shadow: var(--wzc-segmented-selected-shadow);
  }

  .segmented-control-option:disabled {
    color: var(--wzc-color-text-3);
    cursor: not-allowed;
  }

  .segmented-control-option:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  :host([appearance="navigation"]) .segmented-control-option {
    flex: 0 0 auto;
    font-size: inherit;
  }
`;
