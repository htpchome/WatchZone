import { css } from "lit";

export const cardEditorStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    color: var(--wzc-color-text-1);
  }

  ha-input,
  ha-selector {
    inline-size: 100%;
  }

  ha-selector {
    display: block;
  }

  .editor-status {
    margin-block-end: 0.75rem;
  }

  .section-title {
    margin-block-start: 1.5rem;
    color: var(--wzc-color-text-1);
    font-size: var(--wzc-font-size-medium);
    font-weight: var(--wzc-font-weight-medium);
    line-height: var(--wzc-line-height-condensed);
  }

  .boolean-option {
    margin-block-start: 0.5rem;
  }

  .camera-list-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin-block-end: 0.65rem;
  }

  .camera-list-heading span,
  .camera-tile-copy small {
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-small);
  }

  .camera-tile-copy {
    display: grid;
    min-inline-size: 0;
    gap: 0.15rem;
  }

  .camera-tile-copy span,
  .camera-tile-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile-action,
  .dialog-close {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: 2.25rem;
    block-size: 2.25rem;
    padding: 0.4rem;
    color: var(--wzc-color-text-2);
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-medium);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .tile-action svg {
    display: block;
    inline-size: 100%;
    pointer-events: none;
  }

  .tile-action:focus-visible,
  .dialog-close:focus-visible,
  .add-camera:focus-visible,
  footer button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .add-camera {
    min-block-size: 2.5rem;
    margin-block-start: 0.5rem;
    padding-inline: 0.75rem;
    color: var(--wzc-color-primary);
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-medium);
    font: inherit;
    font-weight: var(--wzc-font-weight-medium);
    cursor: pointer;
  }

  .add-camera:disabled {
    color: var(--wzc-color-text-3);
    cursor: not-allowed;
  }

  dialog {
    box-sizing: border-box;
    inline-size: min(38rem, calc(100vw - 2rem));
    max-block-size: calc(100vh - 2rem);
    padding: 0;
    overflow: auto;
    color: var(--wzc-color-text-1);
    background: var(--wzc-color-background);
    border: 1px solid var(--wzc-color-border);
    border-radius: var(--wzc-radius-large);
    box-shadow: var(--wzc-shadow-medium);
  }

  dialog::backdrop {
    background: color-mix(in srgb, black 55%, transparent);
  }

  dialog form {
    display: grid;
    min-block-size: 0;
  }

  dialog header {
    position: sticky;
    z-index: 1;
    inset-block-start: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    padding: 0.75rem 1rem;
    background: var(--wzc-color-background);
    border-block-end: 1px solid var(--wzc-color-border);
  }

  dialog h2,
  dialog h3 {
    margin: 0;
  }

  dialog h2 {
    font-size: 1.25rem;
    text-align: center;
  }

  dialog h3 {
    font-size: var(--wzc-font-size-medium);
  }

  .dialog-close {
    grid-column: 2;
    font-size: 1.75rem;
    line-height: 1;
  }

  .camera-dialog-content {
    display: grid;
  }

  .camera-dialog-content section {
    display: grid;
    gap: 0.5rem;
    padding: 0.85rem 1rem;
    border-block-end: 1px solid var(--wzc-color-border);
  }

  dialog footer {
    position: sticky;
    inset-block-end: 0;
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    background: var(--wzc-color-background);
  }

  dialog footer button {
    min-block-size: 2.5rem;
    padding-inline: 1rem;
    color: var(--wzc-color-text-1);
    background: var(--wzc-color-surface-secondary);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-medium);
    font: inherit;
    cursor: pointer;
  }

  dialog footer button.primary {
    color: var(--wzc-color-text-reversed);
    background: var(--wzc-color-primary);
    border-color: var(--wzc-color-primary);
  }

  dialog footer button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (hover: hover) and (pointer: fine) {
    .tile-action:hover,
    .dialog-close:hover,
    .add-camera:hover:not(:disabled) {
      background: var(--wzc-color-fill-primary);
    }
  }

  @media (hover: none) {
    .tile-action:hover,
    .dialog-close:hover,
    .add-camera:hover:not(:disabled) {
      background: transparent;
    }
  }
`;
