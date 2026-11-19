import { css } from "lit";

export const draggableDialogStyles = css`
  :host {
    display: contents;
  }

  dialog {
    backdrop-filter: var(--wzc-dialog-backdrop-filter);
    background: var(--wzc-dialog-background);
    border: var(--wzc-recorded-media-dialog-border);
    border-radius: var(--wzc-recorded-media-dialog-radius);
    box-shadow: var(--wzc-recorded-media-dialog-shadow);
    box-sizing: border-box;
    color: var(--wzc-color-text-1);
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

  dialog:popover-open,
  dialog[open] {
    display: flex;
    flex-direction: column;
  }

  dialog:popover-open::backdrop {
    background: transparent;
    pointer-events: none;
  }

  dialog.dragged {
    inset: auto;
    margin: 0;
    position: fixed;
  }

  .header {
    cursor: move;
    touch-action: none;
  }

  .footer-actions {
    padding-inline-end: calc(
      var(--wzc-recorded-media-resize-handle-size) + 0.4rem
    );
  }

  .resize-handle {
    appearance: none;
    background: transparent;
    border: 0;
    bottom: 0;
    color: var(--wzc-event-action-color);
    cursor: nwse-resize;
    height: var(--wzc-recorded-media-resize-handle-size);
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

  .resize-handle svg {
    block-size: 1.5rem;
    bottom: 0.25rem;
    display: block;
    inline-size: 1.5rem;
    position: absolute;
    right: 0.25rem;
  }
`;
