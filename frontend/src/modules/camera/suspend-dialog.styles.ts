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
    background: var(--wzc-color-background);
    border: 1px solid var(--wzc-color-border);
    border-radius: var(--wzc-radius-large);
    box-shadow: var(--wzc-shadow-medium);
  }

  dialog::backdrop {
    background: color-mix(in srgb, black 55%, transparent);
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
    color: var(--wzc-color-on-warning);
    background: color-mix(
      in srgb,
      var(--wzc-color-fill-warning) 70%,
      transparent
    );
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
    inline-size: 2.75rem;
    block-size: 1.5rem;
    accent-color: var(--wzc-color-primary);
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
    border-radius: var(--wzc-radius-button);
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

  button:disabled,
  input:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;
