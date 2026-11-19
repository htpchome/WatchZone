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
    block-size: min(
      var(--wzc-recorded-media-drawer-open-height, 82dvh),
      calc(
        var(--wzc-recorded-media-drawer-viewport-height, 100dvh) - env(
            safe-area-inset-top,
            0px
          ) -
          0.5rem
      )
    );
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
    z-index: 1001;
  }

  dialog:popover-open,
  dialog[open] {
    display: flex;
    flex-direction: column;
  }

  dialog:focus {
    outline: none;
  }

  dialog:popover-open::backdrop {
    background: transparent;
    pointer-events: none;
  }

  .drawer-handle {
    background: transparent;
    box-sizing: border-box;
    cursor: grab;
    flex: none;
    inline-size: 100%;
    min-block-size: 1.5rem;
    padding: 0.45rem 0;
    touch-action: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
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

  .header {
    flex: none;
  }

  .body {
    flex: 1 1 auto;
  }

  .footer-actions {
    padding-block-end: 0.25rem;
  }

  .media-resize-handle {
    appearance: none;
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-pill);
    block-size: 2rem;
    color: var(--wzc-media-overlay-color);
    cursor: ns-resize;
    inline-size: 5rem;
    inset-block-end: 0;
    inset-inline-start: 50%;
    margin: 0;
    padding: 0;
    position: absolute;
    transform: translateX(-50%);
    touch-action: none;
    user-select: none;
    z-index: 2;
    -webkit-tap-highlight-color: transparent;
  }

  .media-resize-handle::before {
    background: var(--wzc-media-overlay-background);
    border-radius: var(--wzc-radius-pill);
    block-size: 1.05rem;
    box-shadow: var(--wzc-media-overlay-shadow);
    content: "";
    inline-size: 3.5rem;
    inset-block-end: 0.25rem;
    inset-inline-start: 50%;
    position: absolute;
    transform: translateX(-50%);
  }

  .media-resize-handle svg {
    block-size: 1.15rem;
    inline-size: 1.15rem;
    inset-block-end: 0.2rem;
    inset-inline-start: calc(50% - 0.575rem);
    pointer-events: none;
    position: absolute;
  }

  .media-resize-handle:focus-visible {
    outline: none;
    color: var(--wzc-color-primary);
  }

  @media (hover: hover) and (pointer: fine) {
    .media-resize-handle:hover {
      color: var(--wzc-color-primary);
    }
  }
`;
