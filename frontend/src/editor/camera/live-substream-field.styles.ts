import { css } from "lit";

export const liveSubstreamFieldStyles = css`
  :host {
    display: grid;
    gap: 0.5rem;
  }

  details {
    padding: 0.625rem 0.75rem;
    color: var(--wzc-color-text-2);
    background: var(--wzc-color-surface-secondary);
    border-radius: var(--wzc-radius-medium);
  }

  summary {
    color: var(--wzc-color-text-1);
    font-weight: var(--wzc-font-weight-medium);
    cursor: pointer;
  }

  p {
    margin: 0.5rem 0 0;
    line-height: 1.4;
  }
`;
