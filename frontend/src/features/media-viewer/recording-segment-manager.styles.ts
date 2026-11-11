import { css } from "lit";

export const recordingSegmentManagerStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    color: var(--wzc-recording-scrubber-text);
    background: var(--wzc-recording-segment-panel);
    border: 1px solid var(--wzc-recording-segment-panel-border);
    font-family: var(--wzc-font-family);
  }

  .manager {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.65rem 1rem;
    padding: 0.65rem 0.75rem;
  }

  .copy {
    min-inline-size: 0;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: 0.8rem;
    line-height: 1.25;
  }

  p {
    margin-block-start: 0.18rem;
    font-size: 0.6875rem;
    line-height: 1.3;
  }

  .selection {
    margin-block-start: 0.5rem;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    font-weight: var(--wzc-font-weight-semibold);
  }

  .duration {
    margin-inline-start: 0.45rem;
    font-weight: var(--wzc-font-weight-normal);
  }

  .actions {
    display: flex;
    align-items: end;
    justify-content: end;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    min-block-size: 2.35rem;
    padding: 0.35rem 0.65rem;
    color: var(--wzc-recording-scrubber-text);
    background: var(--wzc-recording-segment-button);
    border: 1px solid var(--wzc-recording-segment-button-border);
    border-radius: var(--wzc-radius-control);
    font: inherit;
    font-size: 0.72rem;
    font-weight: var(--wzc-font-weight-semibold);
    cursor: pointer;
  }

  button svg {
    inline-size: 1rem;
    block-size: 1rem;
  }

  button.primary {
    color: var(--wzc-recording-segment-primary-text);
    background: var(--wzc-recording-segment-primary);
    border-color: var(--wzc-recording-segment-primary);
  }

  button.cancel {
    color: var(--wzc-recording-segment-cancel);
    border-color: var(--wzc-recording-segment-cancel);
  }

  button:disabled {
    cursor: default;
    opacity: 0.5;
  }

  button:focus-visible {
    outline: 2px solid var(--wzc-recording-scrubber-pointer-outline);
    outline-offset: 2px;
  }

  @media (max-width: 40rem) {
    .manager {
      grid-template-columns: 1fr;
    }

    .actions {
      justify-content: stretch;
    }

    button {
      flex: 1 1 calc(50% - 0.4rem);
    }
  }
`;
