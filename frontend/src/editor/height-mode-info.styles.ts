import { css } from "lit";

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

  ha-selector + ha-selector {
    margin-block-start: 0.5rem;
  }

  .boolean-option {
    margin-block-start: 0.5rem;
  }
`;
