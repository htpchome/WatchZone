import { css } from "lit";

export const draggableDialogStyles = css`
  :host {
    display: contents;
  }

  dialog {
    background: var(--wzc-recorded-media-header-background);
    border: var(--wzc-recorded-media-dialog-border);
    border-radius: var(--wzc-recorded-media-dialog-radius);
    box-shadow: var(--wzc-recorded-media-dialog-shadow);
    box-sizing: border-box;
    color: var(--wzc-color-text-1);
    grid-template-rows: max-content max-content;
    inline-size: min(52rem, calc(100vw - 1rem));
    inset: 0;
    margin: auto;
    max-block-size: calc(100dvh - 1rem);
    max-inline-size: calc(100vw - 1rem);
    min-block-size: var(--wzc-recorded-media-dialog-min-block-size);
    min-inline-size: var(--wzc-recorded-media-dialog-min-inline-size);
    overflow: hidden;
    padding: 0;
    position: fixed;
    z-index: 1001;
  }

  dialog[open] {
    display: grid;
  }

  dialog.dragged {
    inset: auto;
    margin: 0;
    position: fixed;
  }

  .header {
    align-items: center;
    background: var(--wzc-recorded-media-header-background);
    cursor: move;
    display: flex;
    gap: 0.75rem;
    justify-content: flex-start;
    min-block-size: 3rem;
    padding: 0.35rem 1rem 0.35rem 0.5rem;
    touch-action: none;
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
    background: var(--wzc-recorded-media-header-background);
    box-sizing: border-box;
    display: grid;
    padding: 0 var(--wzc-recorded-media-dialog-padding)
      var(--wzc-recorded-media-dialog-bottom-padding);
    position: relative;
  }

  wzc-recorded-video-player {
    aspect-ratio: 16 / 9;
    block-size: auto;
    inline-size: 100%;
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
    padding: 0;
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
    --mdc-icon-size: 1.25rem;
    display: block;
  }

  @media (hover: hover) and (pointer: fine) {
    .close:hover {
      background: var(--wzc-recorded-media-close-hover-background);
      color: var(--wzc-recorded-media-close-color);
    }
  }
`;
