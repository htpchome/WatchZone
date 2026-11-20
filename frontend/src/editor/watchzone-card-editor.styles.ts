import { css } from "lit";

import { responsiveWidths } from "../styles/responsive-widths";

export const cardEditorStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    color: var(--wzc-color-text-1);
    background: transparent;
  }

  ha-input,
  ha-selector {
    inline-size: 100%;
  }

  .editor-guidance {
    margin: 0 0 0.75rem;
    padding: 0.75rem;
    color: var(--wzc-color-text-2);
    background: var(--wzc-color-fill-primary);
    border-radius: var(--wzc-radius-small);
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

  .review-settings-list {
    border-block: 1px solid var(--wzc-accordion-border-color);
  }

  .review-settings-list > * {
    padding-block: 0.5rem;
  }

  .review-settings-list > * + * {
    border-block-start: 1px solid var(--wzc-accordion-border-color);
  }

  .review-settings-list > .boolean-option {
    margin-block-start: 0;
  }

  .review-settings-list > .segmented-setting {
    margin-block-start: 0;
  }

  .segmented-setting {
    display: grid;
    gap: 0.35rem;
    margin-block-start: 0.75rem;
  }

  .segmented-setting-label {
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-medium);
  }

  .segmented-setting-description {
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-small);
    line-height: var(--wzc-line-height-normal);
  }

  .stage-type-setting,
  .stage-layout-setting {
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .stage-layout-setting {
    margin-block-start: 1rem;
  }

  .stage-type-setting legend,
  .stage-layout-setting legend {
    margin-block-end: 0.45rem;
    padding: 0;
    color: var(--wzc-color-text-1);
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-medium);
  }

  .stage-type-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.5rem;
  }

  .stage-type-option {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 0.5rem;
    box-sizing: border-box;
    min-block-size: 6.5rem;
    padding: 0.65rem;
    color: var(--wzc-color-text-1);
    background: transparent;
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-medium);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .stage-type-option.selected {
    background: var(--wzc-color-fill-primary);
    border-color: var(--wzc-color-primary);
  }

  .stage-type-option.disabled {
    color: var(--wzc-color-text-3);
    cursor: not-allowed;
  }

  .stage-type-option input {
    appearance: none;
    box-sizing: border-box;
    inline-size: 1rem;
    block-size: 1rem;
    margin: 0.05rem 0 0;
    background: var(--wzc-color-surface);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: 50%;
  }

  .stage-type-option input:checked {
    background: var(--wzc-color-primary);
    border-color: var(--wzc-color-primary);
    box-shadow: inset 0 0 0 0.2rem var(--wzc-color-surface);
  }

  .stage-type-option input:focus-visible,
  .stage-layout-option input:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .stage-type-copy {
    display: grid;
    gap: 0.25rem;
    min-inline-size: 0;
  }

  .stage-type-copy strong {
    font-size: var(--wzc-font-size-small);
    line-height: var(--wzc-line-height-condensed);
  }

  .stage-type-copy small {
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-small);
    line-height: var(--wzc-line-height-condensed);
  }

  .stage-type-option.disabled .stage-type-copy small {
    color: var(--wzc-color-text-3);
  }

  .optional-interaction {
    margin-block-start: 0.5rem;
  }

  .add-interaction {
    display: grid;
    justify-items: start;
    gap: 0.25rem;
    margin-block-start: 0.5rem;
  }

  .add-interaction-choices {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding-inline-start: 0.25rem;
  }

  .remove-interaction-action {
    display: flex;
    justify-content: flex-end;
    min-block-size: 2rem;
    padding-inline-end: 0.25rem;
  }

  .stage-layout-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .stage-layout-option {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-block-size: 2rem;
    padding: 0.25rem 0.55rem;
    color: var(--wzc-color-text-1);
    background: transparent;
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-medium);
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-medium);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .stage-layout-option.selected {
    background: var(--wzc-color-fill-primary);
    border-color: var(--wzc-color-primary);
  }

  .stage-layout-option.disabled {
    color: var(--wzc-color-text-3);
    cursor: not-allowed;
  }

  .stage-layout-option input {
    inline-size: 1rem;
    block-size: 1rem;
    margin: 0;
    accent-color: var(--wzc-color-primary);
  }

  @media (hover: hover) and (pointer: fine) {
    .stage-type-option:not(.disabled):hover,
    .stage-layout-option:not(.disabled):hover {
      border-color: var(--wzc-color-primary);
    }
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

  .secondary-camera-list {
    display: grid;
    gap: 0.35rem;
    margin-block-start: 0.5rem;
  }

  .secondary-camera-tile {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    min-block-size: 2.25rem;
    padding: 0.2rem 0.35rem 0.2rem 0.65rem;
    background: var(--wzc-color-surface-secondary);
    border: 1px solid var(--wzc-color-border-subtle);
    border-inline-start: 3px solid var(--wzc-color-primary);
    border-radius: var(--wzc-radius-medium);
  }

  .secondary-camera-copy {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .secondary-camera-settings {
    display: grid;
    gap: 0.65rem;
    padding-block: 0.25rem;
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

  .remove-additional-camera {
    justify-self: end;
  }

  .field-error {
    color: var(--wzc-color-error);
  }

  dialog {
    box-sizing: border-box;
    inline-size: min(38rem, calc(100vw - 2rem));
    max-block-size: calc(100vh - 2rem);
    padding: 0;
    overflow: auto;
    color: var(--wzc-color-text-1);
    background: var(--wzc-task-dialog-background);
    border: 1px solid var(--wzc-color-border);
    border-radius: var(--wzc-task-dialog-radius);
    box-shadow: var(--wzc-task-dialog-shadow);
    opacity: 1;
    backdrop-filter: var(--wzc-task-dialog-backdrop-filter);
  }

  dialog::backdrop {
    background: var(--wzc-dialog-scrim-background);
    backdrop-filter: var(--wzc-dialog-scrim-backdrop-filter);
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
    background: var(--wzc-task-dialog-background);
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
    min-block-size: 0;
    padding: 0.75rem 1rem;
    overflow: auto;
    container-type: inline-size;
  }

  .camera-editor-dialog {
    block-size: min(42rem, calc(100vh - 2rem));
    overflow: hidden;
  }

  .camera-editor-dialog form {
    grid-template-rows: auto minmax(0, 1fr) auto;
    block-size: 100%;
  }

  .camera-dialog-accordion {
    gap: 0.35rem;
  }

  .camera-section-fields {
    display: grid;
    gap: 0.5rem;
  }

  .additional-camera-settings {
    gap: 0.65rem;
  }

  .field-label {
    color: var(--wzc-color-text-1);
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-medium);
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
    grid-template-columns: 1.5rem minmax(0, 1fr) minmax(13.5rem, 15.5rem) auto;
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

  .linked-light-row ha-icon,
  .add-light svg {
    inline-size: 1.25rem;
    block-size: 1.25rem;
  }

  .linked-light-copy {
    display: grid;
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
    min-inline-size: 0;
  }

  .remove-light {
    inline-size: 2rem;
    block-size: 2rem;
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
    background: var(--wzc-task-dialog-background);
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

  @container (max-width: ${responsiveWidths.compact}) {
    .linked-light-row {
      grid-template-columns:
        1.5rem minmax(0, 1fr) minmax(12.5rem, 14.5rem)
        auto;
    }

    .add-light-fields {
      grid-template-columns: 1fr;
    }
  }
`;
