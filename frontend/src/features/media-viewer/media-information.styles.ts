import { css } from "lit";

export const mediaInformationStyles = css`
  :host {
    container-type: inline-size;
    display: block;
    min-inline-size: 0;
  }

  .information {
    background: var(--wzc-task-dialog-background);
    border-radius: var(--wzc-task-dialog-radius);
    display: grid;
    gap: 0.8rem;
    padding: var(--wzc-recorded-media-dialog-padding);
  }

  .badges,
  .actions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .badges wzc-badge {
    --wzc-badge-font-size: var(--wzc-event-badge-font-size);
    --wzc-badge-padding: var(--wzc-event-badge-padding);
  }

  .metadata {
    display: grid;
    gap: 0.7rem 1rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin: 0;
  }

  .field {
    display: grid;
    gap: 0.15rem;
    min-inline-size: 0;
  }

  dt {
    color: var(--wzc-color-primary);
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-semibold);
    letter-spacing: 0.025em;
    text-transform: uppercase;
  }

  dd {
    font-size: var(--wzc-font-size-small);
    line-height: 1.35;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .actions {
    justify-content: flex-end;
    padding-inline-end: var(--wzc-recorded-media-resize-handle-size);
  }

  @container (max-width: 36rem) {
    .metadata {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (max-width: 22rem) {
    .metadata {
      grid-template-columns: 1fr;
    }
  }
`;
