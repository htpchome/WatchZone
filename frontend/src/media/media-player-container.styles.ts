import { css } from "lit";

export const mediaPlayerContainerStyles = css`
  :host {
    display: contents;
  }

  dialog {
    background: var(--wzc-recorded-media-dialog-background);
    border: var(--wzc-recorded-media-dialog-border);
    border-radius: var(--wzc-recorded-media-dialog-radius);
    box-shadow: var(--wzc-recorded-media-dialog-shadow);
    box-sizing: border-box;
    color: var(--wzc-color-text-1);
    grid-template-rows: max-content minmax(0, 1fr);
    inline-size: min(52rem, 90vw);
    max-block-size: 90dvh;
    max-inline-size: 90vw;
    min-block-size: var(--wzc-recorded-media-dialog-min-block-size);
    min-inline-size: var(--wzc-recorded-media-dialog-min-inline-size);
    overflow: hidden;
    padding: 0;
    position: relative;
  }

  dialog[open] {
    display: grid;
  }

  dialog::backdrop {
    background: var(--wzc-recorded-media-backdrop);
  }

  dialog.dragged {
    margin: 0;
    position: fixed;
  }

  .header {
    align-items: center;
    background: var(--wzc-recorded-media-header-background);
    cursor: move;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    min-block-size: 3rem;
    padding: 0.35rem 0.5rem 0.35rem 1rem;
    touch-action: none;
    user-select: none;
  }

  .title {
    font-size: var(--wzc-font-size-medium);
    font-weight: var(--wzc-font-weight-semibold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close {
    align-items: center;
    appearance: none;
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-button);
    color: var(--wzc-color-text-2);
    cursor: pointer;
    display: inline-flex;
    justify-content: center;
    min-block-size: 2.5rem;
    min-inline-size: 2.5rem;
    padding: 0;
  }

  .close:hover,
  .close:focus-visible {
    background: var(--wzc-recorded-media-control-hover-background);
    color: var(--wzc-color-primary);
  }

  .close:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 1px;
  }

  .close ha-icon {
    --mdc-icon-size: 1.5rem;
  }

  .body {
    background: var(--wzc-recorded-media-background);
    box-sizing: border-box;
    display: grid;
    min-block-size: 0;
    padding: var(--wzc-recorded-media-dialog-padding);
    padding-block-end: max(
      var(--wzc-recorded-media-dialog-padding),
      var(--wzc-recorded-media-resize-handle-size)
    );
    position: relative;
  }

  wzc-media-player {
    block-size: 100%;
    min-block-size: 0;
  }

  wzc-toast-region {
    z-index: 2;
  }

  .resize-handle {
    align-items: flex-end;
    appearance: none;
    background: transparent;
    border: 0;
    bottom: 0;
    color: var(--wzc-color-text-2);
    cursor: nwse-resize;
    display: flex;
    height: var(--wzc-recorded-media-resize-handle-size);
    justify-content: flex-end;
    padding: 0.2rem;
    position: absolute;
    right: 0;
    touch-action: none;
    width: var(--wzc-recorded-media-resize-handle-size);
    z-index: 3;
  }

  .resize-handle:hover,
  .resize-handle:focus-visible {
    color: var(--wzc-color-primary);
  }

  .resize-handle:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  .resize-handle ha-icon {
    --mdc-icon-size: 1rem;
  }
`;
