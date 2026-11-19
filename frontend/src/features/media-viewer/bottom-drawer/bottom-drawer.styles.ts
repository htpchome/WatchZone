import { css } from "lit";

export const bottomDrawerStyles = css`
  :host {
    display: contents;
  }

  dialog {
    backdrop-filter: var(--wzc-dialog-backdrop-filter);
    background: var(--wzc-dialog-background);
    border: var(--wzc-recorded-media-dialog-border);
    border-block-end: 0;
    border-radius: var(--wzc-recorded-media-dialog-radius)
      var(--wzc-recorded-media-dialog-radius) 0 0;
    box-shadow: var(--wzc-recorded-media-dialog-shadow);
    box-sizing: border-box;
    color: var(--wzc-color-text-1);
    inset: auto auto 0 0;
    margin: 0;
    max-block-size: calc(
      var(--wzc-recorded-media-drawer-viewport-height, 100dvh) - env(
          safe-area-inset-top,
          0px
        ) -
        0.5rem
    );
    max-inline-size: 100vw;
    min-block-size: var(--wzc-recorded-media-dialog-min-block-size);
    min-inline-size: min(
      var(--wzc-recorded-media-dialog-min-inline-size),
      100vw
    );
    overflow: hidden;
    padding: 0 0 env(safe-area-inset-bottom, 0px);
    position: fixed;
  }

  dialog[open] {
    display: flex;
    flex-direction: column;
  }

  dialog::backdrop {
    background: transparent;
  }

  .drawer-handle {
    appearance: none;
    background: transparent;
    border: 0;
    box-sizing: border-box;
    cursor: grab;
    flex: none;
    inline-size: 100%;
    min-block-size: 1.5rem;
    padding: 0.45rem 0;
    touch-action: none;
  }

  .drawer-handle::before {
    background: var(--wzc-color-border);
    border-radius: 999px;
    content: "";
    display: block;
    block-size: 0.25rem;
    inline-size: 2.5rem;
    margin: auto;
  }

  .drawer-handle:active {
    cursor: grabbing;
  }

  .drawer-handle:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  .header {
    flex: none;
  }

  .body {
    flex: 1 1 auto;
  }

  .footer-actions {
    padding-block-end: 0.25rem;
  }
`;
