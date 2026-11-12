import { css } from "lit";

export const exportsStyles = css`
  :host {
    --wzc-export-list-gap: 0.5rem;
    --wzc-export-list-padding: 0.25rem;
    --wzc-export-tile-block-size: 5.75rem;
    box-sizing: border-box;
    display: block;
    block-size: 100%;
    inline-size: 100%;
    min-block-size: 0;
    min-inline-size: 0;
    color: var(--wzc-color-text-1);
    font-family: var(--wzc-font-family);
  }

  .viewport {
    block-size: 100%;
    inline-size: 100%;
    display: grid;
    grid-template-rows: var(--wzc-media-day-header-block-size) minmax(0, 1fr);
    max-block-size: calc(
      var(--wzc-media-day-header-block-size) + 5 *
        var(--wzc-export-tile-block-size) + 5 * var(--wzc-export-list-gap) + 2 *
        var(--wzc-export-list-padding)
    );
    min-block-size: calc(
      var(--wzc-media-day-header-block-size) + 3 *
        var(--wzc-export-tile-block-size) + 3 * var(--wzc-export-list-gap) + 2 *
        var(--wzc-export-list-padding)
    );
    overflow: hidden;
  }

  .scroller {
    inline-size: 100%;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .layout-toggle {
    display: grid;
    place-items: center;
    inline-size: var(--wzc-media-day-navigation-size);
    block-size: var(--wzc-media-day-navigation-size);
    padding: 0;
    color: var(--wzc-color-text-2);
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-button);
  }

  .layout-toggle ha-icon {
    --mdc-icon-size: 1.25rem;
  }

  .layout-toggle:hover {
    color: var(--wzc-color-primary);
    background: var(--wzc-color-fill-primary);
  }

  .collection {
    box-sizing: border-box;
    display: grid;
    gap: var(--wzc-export-list-gap);
    inline-size: 100%;
    padding: var(--wzc-export-list-padding);
  }

  .collection.grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
  }

  .empty {
    color: var(--wzc-color-text-2);
    padding: 1rem;
    text-align: center;
  }

  .tile {
    position: relative;
    display: grid;
    align-items: stretch;
    min-block-size: var(--wzc-export-tile-block-size);
    overflow: hidden;
    background: var(--wzc-color-surface-secondary);
    border: 0;
    border-radius: var(--wzc-radius-medium);
    box-shadow: var(--wzc-shadow-small);
  }

  .list .tile {
    grid-template-columns: minmax(7rem, 10rem) minmax(0, 1fr) auto;
  }

  .grid .tile {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto auto;
  }

  .tile-player {
    appearance: none;
    position: absolute;
    z-index: 1;
    inset: 0;
    padding: 0;
    background: transparent;
    border: 0;
    cursor: pointer;
  }

  .thumbnail {
    position: relative;
    display: grid;
    place-items: center;
    block-size: var(--wzc-export-tile-block-size);
    min-inline-size: 0;
    overflow: hidden;
    background: var(--wzc-media-placeholder-background);
    color: var(--wzc-media-placeholder-color);
  }

  .grid .thumbnail {
    aspect-ratio: 16 / 9;
    block-size: auto;
    inline-size: 100%;
  }

  .thumbnail img,
  .thumbnail video {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
  }

  .thumbnail video {
    inset: 0;
    position: absolute;
  }

  .thumbnail > svg {
    inline-size: 2rem;
    block-size: 2rem;
  }

  .processing {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 0.4rem;
    color: var(--wzc-color-text-reversed);
    background: color-mix(
      in srgb,
      var(--wzc-media-overlay-surface) 72%,
      transparent
    );
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-semibold);
    text-align: center;
  }

  .tile.draft {
    opacity: 0.88;
  }

  .tile.draft.failed {
    box-shadow: inset 0 0 0 1px var(--wzc-color-error);
  }

  .draft-status {
    align-items: center;
    border: 1px solid currentcolor;
    border-radius: var(--wzc-radius-pill);
    display: inline-flex;
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-semibold);
    gap: 0.35rem;
    justify-self: start;
    padding: 0.2rem 0.55rem;
  }

  .draft-status.progress {
    color: var(--wzc-color-text-2);
  }

  .draft-status.failed {
    background: var(--wzc-color-fill-error-quiet);
    color: var(--wzc-color-error);
  }

  .draft-status ha-spinner {
    flex: 0 0 auto;
  }

  .details {
    display: grid;
    align-content: center;
    gap: 0.28rem;
    min-inline-size: 0;
    padding: 0.65rem 0.75rem;
  }

  .grid .details {
    align-content: start;
  }

  .title {
    overflow: hidden;
    font-weight: var(--wzc-font-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .metadata {
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-small);
  }

  .actions {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: end;
    flex-wrap: wrap;
    gap: 0.2rem;
    padding: 0.45rem;
  }

  .grid .actions {
    padding-block-start: 0;
  }

  .action {
    display: grid;
    place-items: center;
    inline-size: 2.5rem;
    block-size: 2.5rem;
    padding: 0;
    color: var(--wzc-color-text-2);
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-button);
  }

  .action ha-icon {
    --mdc-icon-size: 1.25rem;
  }

  .action:hover:not(:disabled) {
    color: var(--wzc-color-primary);
    background: var(--wzc-color-fill-primary);
  }

  .action.delete:hover:not(:disabled) {
    color: var(--wzc-color-error);
    background: var(--wzc-color-fill-error-quiet);
  }

  .tile-player:focus-visible,
  dialog button:focus-visible,
  dialog input:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  dialog {
    box-sizing: border-box;
    inline-size: min(26rem, calc(100vw - 2rem));
    padding: 0;
    color: var(--wzc-color-text-1);
    background: var(--wzc-dialog-background);
    border: 1px solid var(--wzc-color-border);
    border-radius: var(--wzc-dialog-radius);
    box-shadow: var(--wzc-dialog-shadow);
    font: inherit;
    opacity: 1;
    backdrop-filter: var(--wzc-dialog-backdrop-filter);
  }

  dialog::backdrop {
    background: var(--wzc-dialog-scrim-background);
    backdrop-filter: var(--wzc-dialog-scrim-backdrop-filter);
  }

  .dialog-content {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
  }

  .dialog-content h3,
  .dialog-content p {
    margin: 0;
  }

  .dialog-content input {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 2.75rem;
    padding: 0.5rem 0.65rem;
    color: var(--wzc-color-text-1);
    background: var(--wzc-color-background);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-small);
    font: inherit;
  }

  .dialog-actions {
    display: flex;
    justify-content: end;
    gap: 0.5rem;
  }

  .dialog-actions button {
    min-block-size: 2.5rem;
    padding: 0.4rem 0.8rem;
    color: var(--wzc-color-text-1);
    background: var(--wzc-color-surface-secondary);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-button);
    font: inherit;
  }

  .dialog-actions .danger {
    color: var(--wzc-color-on-error);
    background: var(--wzc-color-fill-error);
    border-color: var(--wzc-color-fill-error);
  }

  @container (max-width: 54rem) {
    .collection.grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (max-width: 36rem) {
    .collection.grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .list .tile {
      grid-template-columns: 6rem minmax(0, 1fr);
    }

    .list .actions {
      grid-column: 1 / -1;
      justify-content: end;
      padding-block-start: 0;
    }
  }
`;
