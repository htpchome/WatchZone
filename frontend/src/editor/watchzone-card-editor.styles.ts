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
  .camera-tile-copy small,
  .capability-status,
  .character-count,
  .empty-camera-section {
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
  .remove-light {
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

  .tile-action svg,
  .remove-light svg {
    display: block;
    inline-size: 100%;
    pointer-events: none;
  }

  .tile-action:focus-visible,
  .remove-light:focus-visible,
  .add-camera:focus-visible {
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
    color: var(--wzc-color-text-2);
  }

  .camera-dialog-content {
    padding: 0.75rem 1rem;
    container-type: inline-size;
  }

  .camera-dialog-accordion {
    gap: 0.35rem;
  }

  .camera-section-fields {
    display: grid;
    gap: 0.5rem;
  }

  .camera-title-field {
    display: grid;
  }

  .character-count {
    white-space: nowrap;
  }

  .capability-option {
    display: grid;
    gap: 0.15rem;
  }

  .empty-camera-section {
    margin: 0;
  }

  .linked-light-settings {
    display: grid;
    gap: 0.65rem;
  }

  .linked-light-row {
    display: grid;
    grid-template-columns: 1.5rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    min-block-size: 2.75rem;
    padding: 0.35rem 0.45rem;
    background: var(--wzc-color-surface-secondary);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-medium);
  }

  .linked-light-row > ha-icon,
  .add-light svg {
    display: grid;
    color: var(--wzc-color-primary);
  }

  .linked-light-row > ha-icon {
    grid-area: 1 / 1;
  }

  .linked-light-row ha-icon,
  .add-light svg {
    inline-size: 1.25rem;
    block-size: 1.25rem;
  }

  .linked-light-copy {
    display: grid;
    grid-area: 1 / 2;
    min-inline-size: 0;
    gap: 0.1rem;
  }

  .linked-light-copy strong,
  .linked-light-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .linked-light-copy small {
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-small);
  }

  .light-icon-selector {
    grid-area: 2 / 1 / 3 / -1;
    min-inline-size: 0;
  }

  .linked-light-row .remove-light {
    grid-area: 1 / 3;
  }

  .add-light-form {
    display: grid;
    gap: 0.65rem;
    padding: 0.75rem;
    background: var(--wzc-color-surface-secondary);
    border-inline-start: 3px solid var(--wzc-color-primary);
    border-radius: var(--wzc-radius-large);
  }

  .add-light-heading {
    font-size: var(--wzc-font-size-small);
  }

  .add-light-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    gap: 0.65rem;
  }

  .add-light-field {
    display: grid;
    grid-template-rows: auto minmax(3.5rem, auto);
    align-items: stretch;
    gap: 0.3rem;
    min-inline-size: 0;
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-medium);
  }

  .add-light-field ha-selector {
    align-self: stretch;
  }

  .add-light-feedback {
    margin: 0;
    padding: 0.4rem 0.55rem;
    color: var(--wzc-color-error);
    background: var(--wzc-color-fill-error-quiet);
    border: 1px solid var(--wzc-color-border-danger);
    border-radius: var(--wzc-radius-medium);
  }

  .add-light {
    justify-self: start;
  }

  .add-light-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .remove-camera-dialog {
    inline-size: min(27rem, calc(100vw - 2rem));
  }

  .remove-camera-dialog header {
    display: block;
  }

  .remove-camera-dialog h2 {
    text-align: start;
  }

  .remove-camera-content {
    padding: 1rem;
    color: var(--wzc-color-text-2);
    line-height: var(--wzc-line-height-normal);
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

  @media (hover: hover) and (pointer: fine) {
    .tile-action:hover,
    .remove-light:hover,
    .add-camera:hover:not(:disabled) {
      background: var(--wzc-color-fill-primary);
    }
  }

  @media (hover: none) {
    .tile-action:hover,
    .remove-light:hover,
    .add-camera:hover:not(:disabled) {
      background: transparent;
    }
  }

  @container (max-width: 30rem) {
    .add-light-fields {
      grid-template-columns: 1fr;
    }
  }
`;
