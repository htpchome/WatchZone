import { css } from "lit";

export const generalSettingsInfoStyles = css`
  :host {
    display: block;
    color: var(--wzc-color-text-1);
  }

  .system-summary {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.85rem;
    color: var(--wzc-color-text-1);
    background: var(--wzc-color-fill-primary);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-large);
  }

  .system-summary-icon {
    display: grid;
    place-items: center;
    align-self: start;
    inline-size: 1.5rem;
    block-size: 1.5rem;
    color: var(--wzc-color-primary);
  }

  .system-summary-icon svg,
  .timezone-value svg {
    inline-size: 100%;
    block-size: 100%;
  }

  .system-summary-content {
    min-inline-size: 0;
  }

  .system-summary dl {
    display: grid;
    gap: 0.2rem;
    margin: 0.4rem 0 0;
    font-size: var(--wzc-font-size-small);
  }

  .system-summary dl > div {
    display: grid;
    grid-template-columns: minmax(8rem, 1fr) minmax(0, 1fr);
    gap: 0.75rem;
  }

  .system-summary dt {
    color: var(--wzc-color-text-2);
  }

  .system-summary dd {
    min-inline-size: 0;
    margin: 0;
    overflow-wrap: anywhere;
    font-weight: var(--wzc-font-weight-medium);
  }

  .timezone-summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 1rem;
    margin-block: 1rem;
    padding-block: 0.75rem;
    border-block: 1px solid var(--wzc-color-border);
  }

  .timezone-copy {
    display: grid;
    gap: 0.25rem;
  }

  .timezone-copy small {
    color: var(--wzc-color-text-2);
  }

  .timezone-copy a {
    color: var(--wzc-color-primary);
  }

  .timezone-value {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.45rem;
    max-inline-size: 18rem;
    text-align: end;
  }

  .timezone-value svg {
    flex: 0 0 auto;
    inline-size: 1.25rem;
    block-size: 1.25rem;
    color: var(--wzc-color-text-2);
  }

  @container (max-width: 30rem) {
    .timezone-summary {
      grid-template-columns: 1fr;
    }

    .timezone-value {
      justify-content: flex-start;
      max-inline-size: none;
      text-align: start;
    }
  }
`;
