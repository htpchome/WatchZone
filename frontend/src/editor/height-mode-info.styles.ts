import { css } from "lit";

import { responsiveWidths } from "../styles/responsive-widths";

export const heightModeInfoStyles = css`
  details {
    margin-block: 0.75rem;
    padding: 0.65rem 0.75rem;
    color: var(--wzc-color-text-2);
    background: var(--wzc-color-fill-primary);
    border-radius: var(--wzc-radius-small);
  }

  summary {
    color: var(--wzc-color-text-1);
    cursor: pointer;
    font-weight: var(--wzc-font-weight-medium);
  }

  dl {
    margin-block-end: 0;
  }

  dt {
    color: var(--wzc-color-text-1);
    font-weight: var(--wzc-font-weight-medium);
  }

  dd {
    margin: 0.2rem 0 0.65rem;
    line-height: var(--wzc-line-height-normal);
  }
`;

export const heightModeSelectorStyles = css`
  :host,
  ha-selector {
    display: block;
  }

  :host {
    container-type: inline-size;
  }

  ha-selector + ha-selector {
    margin-block-start: 0.5rem;
  }

  .appearance-grid {
    display: grid;
    margin-block-start: 0.75rem;
    border-block-start: 1px solid var(--wzc-color-border);
  }

  .appearance-header,
  .appearance-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 5.25rem 5.25rem;
    align-items: center;
  }

  .appearance-header {
    min-block-size: 2.25rem;
    color: var(--wzc-color-text-2);
    text-align: center;
  }

  .device-heading {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
  }

  .device-info {
    display: grid;
    place-items: center;
    inline-size: 1rem;
    block-size: 1rem;
    color: var(--wzc-color-text-2);
    cursor: help;
  }

  .device-info svg {
    inline-size: 100%;
    block-size: 100%;
  }

  .device-info:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
    border-radius: 50%;
  }

  .device-tooltip {
    position: absolute;
    z-index: 2;
    inset-block-start: calc(100% + 0.25rem);
    inset-inline-end: 0;
    display: none;
    inline-size: 14rem;
    padding: 0.5rem 0.6rem;
    color: var(--wzc-popover-color, var(--wzc-color-text-1));
    background: var(--wzc-popover-background);
    border: 1px solid var(--wzc-color-border);
    border-radius: var(--wzc-popover-radius);
    box-shadow: var(--wzc-popover-shadow);
    text-align: start;
    line-height: var(--wzc-line-height-normal);
  }

  .device-info:hover ~ .device-tooltip,
  .device-info:focus ~ .device-tooltip {
    display: block;
  }

  .appearance-row {
    min-block-size: 3.4rem;
    border-block-start: 1px solid var(--wzc-color-border);
  }

  .appearance-label {
    min-inline-size: 0;
    padding-inline-end: 0.5rem;
    color: var(--wzc-color-text-1);
  }

  .device-boolean-option,
  .not-applicable {
    justify-self: center;
  }

  .device-boolean-option {
    display: block;
    inline-size: max-content;
    margin: 0;
  }

  .not-applicable {
    color: var(--wzc-color-text-3);
  }

  @container (max-width: ${responsiveWidths.compact}) {
    .appearance-header,
    .appearance-row {
      grid-template-columns: minmax(0, 1fr) 4.25rem 4.25rem;
    }

    .device-heading {
      gap: 0.2rem;
    }
  }
`;
