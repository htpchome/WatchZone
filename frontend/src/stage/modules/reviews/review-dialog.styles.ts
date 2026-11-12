import { css } from "lit";

/** Shared Reviews-owned modal frame for analysis and tracking presentations. */
export const reviewDialogBaseStyles = css`
  :host {
    color: var(--wzc-color-text-1);
    font-family: var(--wzc-font-family);
  }

  dialog {
    background: var(--wzc-dialog-background);
    border: 1px solid var(--wzc-color-border);
    border-radius: var(--wzc-dialog-radius);
    box-shadow: var(--wzc-dialog-shadow);
    box-sizing: border-box;
    color: var(--wzc-color-text-1);
    inline-size: min(34rem, calc(100vw - 2rem));
    inset: auto;
    margin: 0;
    max-block-size: calc(100dvh - 2rem);
    overflow: auto;
    padding: 0;
    position: fixed;
    opacity: 1;
    backdrop-filter: var(--wzc-dialog-backdrop-filter);
  }

  dialog::backdrop {
    background: var(--wzc-dialog-scrim-background);
    backdrop-filter: var(--wzc-dialog-scrim-backdrop-filter);
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
    block-size: 2.75rem;
    color: var(--wzc-color-text-1);
    cursor: pointer;
    display: inline-flex;
    inline-size: 2.75rem;
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
`;
