import { css } from "lit";

export const recordedMediaDialogContentStyles = css`
  .header {
    align-items: center;
    background: transparent;
    display: flex;
    gap: 0.75rem;
    justify-content: flex-start;
    min-block-size: 3rem;
    padding: 0.35rem 1rem 0.35rem 0.5rem;
    user-select: none;
  }

  .title {
    flex: 1;
    font-size: var(--wzc-font-size-medium);
    font-weight: var(--wzc-font-weight-semibold);
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close {
    align-items: center;
    appearance: none;
    background: var(--wzc-recorded-media-close-background);
    border: 0;
    border-radius: 50%;
    color: var(--wzc-recorded-media-close-color);
    cursor: pointer;
    display: inline-flex;
    justify-content: center;
    flex: none;
    min-block-size: var(--wzc-recorded-media-close-size);
    min-inline-size: var(--wzc-recorded-media-close-size);
    padding: 0;
  }

  .close:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 1px;
  }

  .close ha-icon {
    --mdc-icon-size: 1.5rem;
  }

  .body {
    align-content: start;
    background: transparent;
    box-sizing: border-box;
    display: grid;
    flex: 0 1 auto;
    gap: 0.8rem;
    min-block-size: 0;
    overflow: auto;
    overflow-anchor: none;
    overscroll-behavior: contain;
    padding: 0 var(--wzc-recorded-media-dialog-padding);
    position: relative;
  }

  .footer-actions {
    align-items: center;
    box-sizing: border-box;
    display: flex;
    flex-wrap: nowrap;
    flex: none;
    gap: var(--wzc-media-action-gap);
    justify-content: flex-end;
    min-block-size: var(--wzc-recorded-media-footer-min-block-size);
    padding-inline: var(--wzc-recorded-media-dialog-padding);
  }

  .footer-actions .wzc-activity-action {
    background: transparent;
    min-block-size: var(--wzc-recorded-media-footer-action-size);
    min-inline-size: var(--wzc-recorded-media-footer-action-size);
  }

  .footer-actions .wzc-activity-action ha-icon {
    --mdc-icon-size: var(--wzc-recorded-media-footer-action-icon-size);
  }

  .footer-actions .segment-action.active {
    background: var(--wzc-color-fill-primary);
    color: var(--wzc-color-primary);
  }

  .media-container {
    align-content: start;
    display: grid;
    min-inline-size: 0;
    overflow-anchor: none;
  }

  wzc-recorded-snapshot-player,
  wzc-recorded-video-player {
    block-size: auto;
    inline-size: 100%;
  }

  wzc-toast-region {
    z-index: 2;
  }

  @media (hover: hover) and (pointer: fine) {
    .close:hover {
      background: var(--wzc-recorded-media-close-hover-background);
      color: var(--wzc-recorded-media-close-color);
    }
  }
`;
