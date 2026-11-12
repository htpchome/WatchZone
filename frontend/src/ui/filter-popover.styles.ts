import { css } from "lit";

/** Shared filter trigger, popover, option-chip, and footer presentation. */
export const filterPopoverStyles = css`
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
    color: var(--wzc-filter-trigger-color);
    display: flex;
    inline-size: var(--wzc-filter-trigger-size);
    block-size: var(--wzc-filter-trigger-size);
    justify-content: center;
    padding: 0;
  }
  .filter-trigger svg {
    block-size: var(--wzc-filter-trigger-icon-size);
    inline-size: var(--wzc-filter-trigger-icon-size);
  }
  .filter-trigger.selected,
  .filter-trigger:hover {
    color: var(--wzc-filter-trigger-active-color);
  }
  .filter-trigger:disabled {
    color: var(--wzc-filter-trigger-color);
    cursor: default;
  }
  .filter-trigger:focus-visible,
  .reset:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }
  .popover {
    backdrop-filter: var(--wzc-activity-popover-backdrop-filter);
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
    font-weight: var(--wzc-font-weight-semibold);
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
    font-weight: var(--wzc-font-weight-semibold);
    padding: 0;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.3rem;
    padding-block-start: 0.35rem;
  }
  .chip {
    align-items: center;
    cursor: pointer;
    display: inline-flex;
    min-block-size: 2.25rem;
    position: relative;
  }
  .chip input {
    block-size: 1px;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    inline-size: 1px;
    overflow: hidden;
    position: absolute;
    white-space: nowrap;
  }
  .chip span {
    align-items: center;
    background: var(--wzc-color-surface-secondary);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-pill);
    box-sizing: border-box;
    color: var(--wzc-color-text-2);
    display: inline-flex;
    font-size: var(--wzc-font-size-small);
    min-block-size: 1.75rem;
    padding: 0.2rem 0.65rem;
  }
  .chip input:checked + span {
    background: var(--wzc-color-primary);
    border-color: var(--wzc-color-primary);
    color: var(--wzc-color-text-reversed);
  }
  .chip input:focus-visible + span {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }
  @media (hover: hover) {
    .chip:hover span {
      border-color: var(--wzc-color-primary);
    }
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
