import { css } from "lit";

/** Private styles for the Stage activity-calendar navigation adjunct. */
export const activityCalendarStyles = css`
  :host {
    display: block;
    margin-inline-start: auto;
    position: relative;
  }

  button {
    appearance: none;
    box-sizing: border-box;
    color: inherit;
    cursor: pointer;
    font: inherit;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .calendar-trigger {
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

  .calendar-trigger svg {
    block-size: var(--wzc-stage-stack-icon-size);
    inline-size: var(--wzc-stage-stack-icon-size);
  }

  .calendar-trigger.selected,
  .calendar-trigger:hover {
    color: var(--wzc-stage-stack-button-hover-color);
  }

  .calendar-trigger:focus-visible,
  .month-button:focus-visible,
  .day:focus-visible,
  .reset:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .popover {
    background: var(--wzc-activity-calendar-background);
    border: 1px solid var(--wzc-activity-calendar-border-color);
    border-radius: var(--wzc-activity-calendar-radius);
    box-shadow: var(--wzc-activity-calendar-shadow);
    color: var(--wzc-color-text-1);
    inline-size: min(19rem, calc(100vw - 2rem));
    inset-block-start: calc(100% + 0.25rem);
    inset-inline-end: 0;
    padding: 0.75rem;
    position: absolute;
    z-index: 10;
  }

  .header {
    align-items: center;
    display: grid;
    grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
  }

  .month-title {
    font-weight: 600;
    margin: 0;
    text-align: center;
  }

  .month-button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-small);
    display: flex;
    inline-size: 2.75rem;
    block-size: 2.75rem;
    justify-content: center;
    padding: 0;
  }

  .month-button:disabled {
    cursor: default;
    opacity: 0.35;
  }

  .month-button:not(:disabled):hover {
    background: var(--wzc-color-surface-secondary);
  }

  .month-button svg {
    block-size: 1.5rem;
    inline-size: 1.5rem;
  }

  .weekdays,
  .days {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .weekday {
    color: var(--wzc-color-text-2);
    font-size: 0.75rem;
    font-weight: 600;
    padding-block: 0.35rem;
    text-align: center;
  }

  .day {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 50%;
    display: flex;
    inline-size: 2.25rem;
    block-size: 2.25rem;
    justify-content: center;
    justify-self: center;
    padding: 0;
    position: relative;
  }

  .day:hover:not(:disabled) {
    background: var(--wzc-color-surface-secondary);
  }

  .day.selected {
    background: var(--wzc-color-primary);
    color: var(--wzc-color-text-reversed);
  }

  .day:disabled {
    cursor: default;
    opacity: 0.35;
  }

  .day.marked::after {
    background: var(--wzc-color-primary);
    border-radius: 50%;
    block-size: 0.25rem;
    content: "";
    inline-size: 0.25rem;
    inset-block-end: 0.18rem;
    inset-inline-start: calc(50% - 0.125rem);
    position: absolute;
  }

  .day.selected.marked::after {
    background: var(--wzc-color-text-reversed);
  }

  .blank {
    block-size: 2.25rem;
  }

  .footer {
    border-block-start: 1px solid var(--wzc-activity-calendar-border-color);
    display: flex;
    justify-content: flex-end;
    margin-block-start: 0.5rem;
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
