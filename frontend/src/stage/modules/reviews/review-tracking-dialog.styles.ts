import { css } from "lit";

export const reviewTrackingDialogStyles = css`
  .tracking {
    --wzc-tracking-accent: var(--wzc-color-warning);
    display: grid;
    gap: 1rem;
    padding: 0.25rem 1rem 1rem;
  }

  .tracking.alert {
    --wzc-tracking-accent: var(--wzc-color-error);
  }

  .summary {
    background: var(--wzc-color-surface-secondary);
    border: 1px solid var(--wzc-color-border);
    border-radius: var(--wzc-radius-medium);
    display: grid;
    gap: 0.75rem;
    grid-template-columns: auto minmax(0, 1fr);
    padding: 0.8rem;
  }

  .classification-dot {
    background: var(--wzc-tracking-accent);
    border-radius: 50%;
    block-size: 0.7rem;
    inline-size: 0.7rem;
    margin-block-start: 0.2rem;
  }

  .summary-content {
    display: grid;
    gap: 0.3rem;
    min-inline-size: 0;
  }

  .analysis-summary {
    align-items: center;
    display: flex;
    gap: 0.35rem;
    min-inline-size: 0;
  }

  .analysis-summary ha-icon {
    --mdc-icon-size: 1rem;
    flex: 0 0 auto;
  }

  .analysis-summary span {
    overflow-wrap: anywhere;
  }

  .summary-date,
  .summary-meta,
  .object-range {
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-small);
  }

  .status {
    align-items: center;
    display: flex;
    gap: 0.65rem;
    justify-content: center;
    min-block-size: 7rem;
  }

  .status ha-spinner {
    block-size: 1.5rem;
    inline-size: 1.5rem;
  }

  .status.error {
    color: var(--wzc-color-error);
    flex-wrap: wrap;
  }

  .retry {
    background: transparent;
    border: 1px solid currentcolor;
    border-radius: var(--wzc-radius-medium);
    color: inherit;
    cursor: pointer;
    padding: 0.4rem 0.7rem;
  }

  .retry:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .empty {
    color: var(--wzc-color-text-2);
    padding: 2rem 1rem;
    text-align: center;
  }

  .objects {
    display: grid;
    gap: 1rem;
  }

  .tracked-object {
    min-inline-size: 0;
  }

  .tracked-object h3 {
    align-items: center;
    display: grid;
    font-size: 1rem;
    gap: 0.5rem;
    grid-template-columns: auto minmax(0, auto) minmax(0, 1fr);
  }

  .object-icon {
    align-items: center;
    background: var(--wzc-event-secondary-color);
    border-radius: 50%;
    color: var(--wzc-color-text-reversed);
    display: inline-flex;
    block-size: 1.5rem;
    inline-size: 1.5rem;
    justify-content: center;
  }

  .object-icon svg {
    block-size: 0.9rem;
    inline-size: 0.9rem;
  }

  .object-range {
    justify-self: start;
  }

  .lifecycle {
    border-inline-start: 2px solid
      color-mix(in srgb, var(--wzc-tracking-accent) 60%, transparent);
    display: grid;
    gap: 0.2rem;
    margin-block-start: 0.35rem;
    margin-inline-start: 0.7rem;
    padding-block: 0.15rem;
    padding-inline-start: 0.8rem;
  }

  .lifecycle-item {
    min-inline-size: 0;
    position: relative;
  }

  .timeline-dot {
    background: var(--wzc-tracking-accent);
    border-radius: 50%;
    block-size: 0.5rem;
    inline-size: 0.5rem;
    inset-block-start: 50%;
    inset-inline-start: -1.1rem;
    position: absolute;
    transform: translateY(-50%);
  }

  .lifecycle-event {
    align-items: center;
    appearance: none;
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-small);
    color: var(--wzc-color-text-1);
    cursor: pointer;
    display: grid;
    font: inherit;
    gap: 0.75rem;
    grid-template-columns: minmax(0, 1fr) auto;
    inline-size: 100%;
    min-block-size: 2.1rem;
    padding: 0.35rem 0.45rem;
    text-align: start;
  }

  .lifecycle-event time {
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-small);
  }

  .lifecycle-event:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 0;
  }

  .lifecycle-item.active .lifecycle-event {
    background: var(--wzc-color-surface-secondary);
  }

  @media (hover: hover) {
    .lifecycle-event:hover {
      background: var(--wzc-color-surface-secondary);
    }
  }

  .event-metrics {
    background: var(--wzc-color-background);
    border: 1px solid var(--wzc-color-border);
    border-radius: var(--wzc-radius-small);
    box-shadow: var(--wzc-shadow-small);
    display: grid;
    font-size: var(--wzc-font-size-small);
    gap: 0.25rem;
    inset-inline-start: 0.45rem;
    max-inline-size: calc(100% - 0.9rem);
    min-inline-size: 9rem;
    padding: 0.55rem 0.7rem;
    position: absolute;
    z-index: 3;
  }

  .event-metrics.below {
    inset-block-start: calc(100% - 0.15rem);
  }

  .event-metrics.above {
    inset-block-end: calc(100% - 0.15rem);
  }

  .event-metrics span {
    display: block;
  }

  @media (max-width: 420px) {
    .tracking {
      padding-inline: 0.65rem;
    }

    .tracked-object h3 {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .object-range {
      grid-column: 2;
    }
  }
`;
