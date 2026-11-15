import { css } from "lit";

import { responsiveWidths } from "../../styles/responsive-widths";

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
    gap: 0.5rem;
    padding: var(--wzc-recorded-media-dialog-padding);
    padding-block-start: max(
      0px,
      calc(var(--wzc-recorded-media-dialog-padding) - 0.25rem)
    );
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
    gap: 0.45rem 0.75rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin: 0;
  }

  .field {
    display: grid;
    gap: 0;
    min-inline-size: 0;
  }

  dt {
    color: var(--wzc-color-primary);
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-semibold);
    letter-spacing: 0.025em;
    line-height: 1.15;
    text-transform: uppercase;
  }

  dd {
    font-size: var(--wzc-font-size-small);
    line-height: 1.25;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .actions {
    box-sizing: border-box;
    justify-content: flex-end;
    min-block-size: var(--wzc-recorded-media-resize-handle-size);
    padding-inline-end: calc(
      var(--wzc-recorded-media-resize-handle-size) - var(
          --wzc-recorded-media-dialog-padding
        ) - var(--wzc-recorded-media-dialog-padding) +
        0.4rem
    );
  }

  @container (max-width: ${responsiveWidths.medium}) {
    .metadata {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container (max-width: ${responsiveWidths.compact}) {
    .information {
      gap: 0.4rem;
    }

    .metadata {
      gap: 0.35rem 0.5rem;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
`;
