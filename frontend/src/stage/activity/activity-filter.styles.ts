import { css } from "lit";

/** Private styles for the Stage activity-filter navigation adjunct. */
export const activityFilterStyles = css`
  :host {
    display: block;
    margin-inline-start: auto;
    position: relative;
  }

  button,
  input {
    font: inherit;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  button {
    appearance: none;
    box-sizing: border-box;
    color: inherit;
    cursor: pointer;
  }

  .filter-trigger {
    align-items: center;
    background: transparent;
    border: 0;
    color: var(--wzc-stage-stack-button-color);
    display: flex;
    inline-size: var(--wzc-stage-stack-button-size);
    block-size: var(--wzc-stage-stack-button-size);
    justify-content: center;
    padding: 0;
  }

  .filter-trigger svg {
    block-size: var(--wzc-stage-stack-icon-size);
    inline-size: var(--wzc-stage-stack-icon-size);
  }

  .filter-trigger.selected,
  .filter-trigger:hover {
    color: var(--wzc-stage-stack-button-hover-color);
  }

  .filter-trigger:disabled {
    color: var(--wzc-stage-stack-button-color);
    cursor: default;
  }

  .filter-trigger:focus-visible,
  .reset:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .popover {
    background: var(--wzc-activity-popover-background);
    border: 1px solid var(--wzc-activity-popover-border-color);
    border-radius: var(--wzc-activity-popover-radius);
    box-shadow: var(--wzc-activity-popover-shadow);
    color: var(--wzc-color-text-1);
    inline-size: min(20rem, calc(100vw - 2rem));
    inset: auto;
    margin: 0;
    max-block-size: calc(100dvh - 2rem);
    overflow-y: auto;
    padding: 0.75rem;
    position: fixed;
    z-index: 11;
  }

  .title {
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 0.5rem;
  }

  fieldset {
    border: 0;
    border-block-start: 1px solid var(--wzc-activity-popover-border-color);
    margin: 0;
    padding: 0.6rem 0 0.35rem;
  }

  legend {
    font-size: 0.82rem;
    font-weight: 600;
    padding: 0;
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.75rem;
    padding-block-start: 0.35rem;
  }

  label {
    align-items: center;
    cursor: pointer;
    display: inline-flex;
    font-size: 0.82rem;
    gap: 0.3rem;
    min-block-size: 2rem;
  }

  input {
    accent-color: var(--wzc-color-primary);
    block-size: 1rem;
    inline-size: 1rem;
    margin: 0;
  }

  .footer {
    border-block-start: 1px solid var(--wzc-activity-popover-border-color);
    display: flex;
    justify-content: flex-end;
    margin-block-start: 0.25rem;
    padding-block-start: 0.5rem;
  }

  .reset {
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-small);
    color: var(--wzc-color-primary);
    min-block-size: 2.5rem;
    padding-inline: 0.75rem;
  }

  .reset:hover:not(:disabled) {
    background: var(--wzc-color-surface-secondary);
  }

  .reset:disabled {
    cursor: default;
    opacity: 0.45;
  }
`;
