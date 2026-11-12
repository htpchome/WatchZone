import { css } from "lit";

export const reviewExportDialogStyles = css`
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
    padding: 0;
    position: fixed;
    opacity: 1;
    backdrop-filter: var(--wzc-dialog-backdrop-filter);
  }

  dialog::backdrop {
    background: var(--wzc-dialog-scrim-background);
    backdrop-filter: var(--wzc-dialog-scrim-backdrop-filter);
  }

  form,
  section,
  label {
    display: grid;
  }

  header {
    padding: 1rem 1.25rem 0.5rem;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 1.1rem;
  }

  section {
    gap: 1rem;
    padding: 0.5rem 1.25rem 1rem;
  }

  p {
    color: var(--wzc-color-text-2);
    line-height: 1.45;
  }

  label {
    gap: 0.4rem;
  }

  label span {
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-semibold);
  }

  input {
    background: var(--wzc-color-surface);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-medium);
    box-sizing: border-box;
    color: var(--wzc-color-text-1);
    font: inherit;
    min-block-size: 2.75rem;
    padding: 0.5rem 0.7rem;
  }

  input:focus-visible,
  .wzc-button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  footer {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    padding: 0 1.25rem 1.25rem;
  }

  button {
    background: var(--wzc-color-surface);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-medium);
    color: var(--wzc-color-text-1);
    font: inherit;
    min-block-size: 2.75rem;
    padding: 0.5rem 0.9rem;
  }
`;
