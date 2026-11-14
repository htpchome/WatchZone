import { css } from "lit";

/** Shared square icon action used by activity tiles and recorded-media details. */
export const activityActionStyles = css`
  .wzc-activity-action {
    align-items: center;
    background: var(--wzc-event-action-background);
    border: 1px solid transparent;
    border-radius: var(--wzc-radius-medium);
    color: var(--wzc-event-action-color);
    display: inline-flex;
    justify-content: center;
    min-block-size: var(--wzc-event-action-size);
    min-inline-size: var(--wzc-event-action-size);
    padding: 0;
    transition:
      border-color var(--wzc-media-overlay-transition-duration) ease,
      color var(--wzc-media-overlay-transition-duration) ease;
  }

  .wzc-activity-action > :is(ha-icon, svg) {
    transition: transform var(--wzc-media-overlay-transition-duration) ease;
  }

  .wzc-activity-action:active:not(:disabled) {
    background: var(--wzc-color-fill-primary);
    color: var(--wzc-color-primary);
  }

  .wzc-activity-action:active:not(:disabled) > :is(ha-icon, svg) {
    transform: scale(0.96);
  }

  @media (hover: hover) and (pointer: fine) {
    .wzc-activity-action:hover:not(:disabled) {
      border-color: var(--wzc-color-primary);
      color: var(--wzc-color-primary);
    }

    .wzc-activity-action:hover:not(:disabled) > :is(ha-icon, svg) {
      transform: scale(1.08);
    }
  }
`;
