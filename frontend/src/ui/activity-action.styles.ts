import { css } from "lit";

/** Shared square icon action used by activity tiles and recorded-media details. */
export const activityActionStyles = css`
  .wzc-activity-action {
    align-items: center;
    background: var(--wzc-event-action-background);
    border: 0;
    border-radius: var(--wzc-media-action-radius);
    color: var(--wzc-event-action-color);
    display: inline-flex;
    justify-content: center;
    min-block-size: var(--wzc-event-action-size);
    min-inline-size: var(--wzc-event-action-size);
    padding: 0;
    transition: color var(--wzc-media-overlay-transition-duration) ease;
  }

  .wzc-activity-action:active:not(:disabled) {
    background: var(--wzc-color-fill-primary);
    color: var(--wzc-color-primary);
  }

  @media (hover: hover) and (pointer: fine) {
    .wzc-activity-action:hover:not(:disabled) {
      color: var(--wzc-color-primary);
      outline: 1px solid var(--wzc-color-primary);
      outline-offset: -1px;
    }
  }
`;
