import { css } from "lit";

export const reviewAnalysisDialogStyles = css`
  :host {
    color: var(--wzc-color-text-1);
    font-family: var(--wzc-font-family);
  }

  dialog {
    background: var(--wzc-color-background);
    border: 1px solid var(--wzc-color-border);
    border-radius: var(--wzc-radius-large);
    box-shadow: var(--wzc-shadow-medium);
    box-sizing: border-box;
    color: var(--wzc-color-text-1);
    inline-size: min(32rem, calc(100vw - 2rem));
    inset: auto;
    max-block-size: calc(100dvh - 2rem);
    margin: 0;
    overflow: auto;
    padding: 0;
    position: fixed;
  }

  dialog::backdrop {
    background: color-mix(in srgb, black 55%, transparent);
  }

  header {
    align-items: center;
    display: grid;
    gap: 0.35rem;
    grid-template-columns: auto minmax(0, 1fr);
    padding: 0.75rem 1rem 0.5rem;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 1.1rem;
    line-height: var(--wzc-line-height-condensed);
  }

  .close {
    align-items: center;
    appearance: none;
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-pill);
    color: var(--wzc-color-text-1);
    cursor: pointer;
    display: inline-flex;
    inline-size: 2.75rem;
    block-size: 2.75rem;
    justify-content: center;
    padding: 0;
  }

  .close ha-icon {
    --mdc-icon-size: 1.5rem;
  }

  .close:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  @media (hover: hover) {
    .close:hover {
      background: var(--wzc-color-surface-secondary);
    }
  }

  section {
    display: grid;
    gap: 0.85rem;
    padding: 0.5rem 1.5rem 1.5rem;
  }

  .field {
    display: grid;
    gap: 0.3rem;
  }

  h3 {
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-normal);
  }

  p {
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
`;
