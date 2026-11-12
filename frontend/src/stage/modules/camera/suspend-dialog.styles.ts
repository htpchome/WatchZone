import { css } from "lit";

export const cameraSuspendDialogStyles = css`
  :host {
    color: var(--wzc-color-text-1);
    font-family: var(--wzc-font-family);
  }

  dialog {
    box-sizing: border-box;
    inline-size: min(32rem, calc(100vw - 2rem));
    max-block-size: calc(100vh - 2rem);
    padding: 0;
    overflow: auto;
    color: var(--wzc-color-text-1);
    background: var(--wzc-dialog-background);
    border: 1px solid var(--wzc-color-border);
    border-radius: var(--wzc-dialog-radius);
    box-shadow: var(--wzc-dialog-shadow);
    opacity: 1;
    backdrop-filter: var(--wzc-dialog-backdrop-filter);
  }

  dialog::backdrop {
    background: var(--wzc-dialog-scrim-background);
    backdrop-filter: var(--wzc-dialog-scrim-backdrop-filter);
  }

  form {
    display: grid;
    gap: 1rem;
    padding: clamp(1rem, 5cqi, 1.5rem);
  }

  h2,
  p {
    margin: 0;
  }

  header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 0.75rem;
  }

  .heading-copy {
    display: grid;
    gap: 0.35rem;
  }

  .dialog-icon {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: 2.5rem;
    block-size: 2.5rem;
    border: 1px solid currentColor;
    border-radius: 50%;
  }

  .dialog-icon.suspend {
    color: var(--wzc-color-error);
    background: var(--wzc-color-fill-error-quiet);
  }

  .dialog-icon.resume {
    color: var(--wzc-color-success);
    background: var(--wzc-color-fill-success-quiet);
  }

  .dialog-icon svg {
    inline-size: 1.5rem;
    block-size: 1.5rem;
    fill: currentColor;
  }

  h2 {
    font-size: 1.25rem;
    line-height: var(--wzc-line-height-condensed);
  }

  p {
    color: var(--wzc-color-text-2);
    line-height: 1.45;
  }

  .warning {
    padding: 0.75rem;
    color: var(--wzc-color-warning-text);
    background: var(--wzc-color-fill-warning-quiet);
    border: 1px solid var(--wzc-color-border-warning);
    border-radius: var(--wzc-radius-medium);
  }

  .timer-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-block-size: 2.75rem;
  }

  .timer-toggle input {
    position: relative;
    box-sizing: border-box;
    inline-size: 2.75rem;
    block-size: 1.5rem;
    margin: 0;
    appearance: none;
    background: var(--wzc-color-surface-secondary);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-pill);
    cursor: pointer;
    transition:
      background var(--wzc-media-overlay-transition-duration) ease,
      border-color var(--wzc-media-overlay-transition-duration) ease;
  }

  .timer-toggle input::before {
    position: absolute;
    inset-block-start: 0.1875rem;
    inset-inline-start: 0.1875rem;
    inline-size: 1rem;
    block-size: 1rem;
    content: "";
    background: var(--wzc-color-text-2);
    border-radius: 50%;
    transition: inset-inline-start var(--wzc-media-overlay-transition-duration)
      ease;
  }

  .timer-toggle input:checked {
    background: var(--wzc-color-primary);
    border-color: var(--wzc-color-primary);
  }

  .timer-toggle input:checked::before {
    inset-inline-start: calc(100% - 1.1875rem);
    background: var(--wzc-color-text-reversed);
  }

  .timer-toggle input:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .duration {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  label {
    display: grid;
    gap: 0.35rem;
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-small);
  }

  input[type="number"] {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 2.75rem;
    padding-inline: 0.75rem;
    color: var(--wzc-color-text-1);
    background: var(--wzc-color-surface);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-medium);
    font: inherit;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-block-start: 0.25rem;
  }

  button {
    min-block-size: 2.5rem;
    padding-inline: 1rem;
    color: var(--wzc-color-text-1);
    background: transparent;
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-medium);
    font: inherit;
    cursor: pointer;
  }

  button.primary {
    color: var(--wzc-color-on-error);
    background: var(--wzc-color-fill-error);
    border-color: var(--wzc-color-border-danger);
  }

  button.resume {
    color: var(--wzc-color-on-success);
    background: var(--wzc-color-fill-success);
    border-color: var(--wzc-color-success);
  }

  button[type="button"] {
    background: var(--wzc-color-surface-secondary);
  }

  button:disabled,
  input:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;
