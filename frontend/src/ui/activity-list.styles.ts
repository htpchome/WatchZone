import { css } from "lit";

export const activityListStyles = css`
  :host {
    display: block;
    block-size: 100%;
    min-block-size: 0;
    min-inline-size: 0;
  }

  .viewport {
    box-sizing: border-box;
    block-size: 100%;
    max-block-size: calc(
      5 * var(--wzc-event-tile-block-size) + 4 * var(--wzc-event-list-gap) + 2 *
        var(--wzc-event-list-padding)
    );
    min-block-size: calc(
      3 * var(--wzc-event-tile-block-size) + 2 * var(--wzc-event-list-gap) + 2 *
        var(--wzc-event-list-padding)
    );
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--wzc-event-list-padding);
  }

  .list {
    display: grid;
    gap: var(--wzc-event-list-gap);
  }

  .list.virtualized {
    display: block;
    position: relative;
  }

  .list.virtualized .tile {
    inset-block-start: 0;
    inset-inline: 0;
    position: absolute;
  }

  .skeleton-row {
    display: block;
    block-size: var(--wzc-event-tile-block-size);
    background: var(--wzc-event-tile-background);
    border-radius: var(--wzc-event-tile-radius);
    box-shadow: var(--wzc-event-tile-shadow);
  }

  .tile {
    align-items: center;
    background: var(--wzc-event-tile-background);
    border: var(--wzc-event-tile-border-width) solid
      var(--wzc-event-tile-border-color);
    border-radius: var(--wzc-event-tile-radius);
    box-shadow: var(--wzc-event-tile-shadow);
    box-sizing: border-box;
    display: grid;
    gap: var(--wzc-event-tile-gap);
    grid-template-columns:
      var(--wzc-event-thumbnail-inline-size) minmax(0, 1fr)
      auto;
    block-size: var(--wzc-event-tile-block-size);
    overflow: hidden;
    position: relative;
  }

  .no-shadows .skeleton-row,
  .no-shadows .tile {
    box-shadow: none;
  }

  .tile-player {
    appearance: none;
    background: transparent;
    border: 0;
    cursor: pointer;
    inset: 0;
    padding: 0;
    position: absolute;
    z-index: 1;
  }

  .tile-player:focus-visible {
    border-radius: inherit;
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  .square .tile,
  .square .thumbnail,
  .square .thumbnail-wrap {
    border-radius: 0;
  }

  .thumbnail-wrap {
    aspect-ratio: 16 / 9;
    background: var(--wzc-event-thumbnail-placeholder-background);
    block-size: 100%;
    border-radius: var(--wzc-event-thumbnail-radius);
    box-sizing: border-box;
    inline-size: 100%;
    color: var(--wzc-event-thumbnail-placeholder-color);
    min-block-size: 0;
    overflow: hidden;
    position: relative;
    z-index: 0;
  }

  .thumbnail-wrap.alert {
    --wzc-activity-thumbnail-outline-color: var(--wzc-color-error);
  }

  .thumbnail-wrap.detection {
    --wzc-activity-thumbnail-outline-color: var(--wzc-color-warning);
  }

  .thumbnail-wrap.alert::after,
  .thumbnail-wrap.detection::after {
    border: var(--wzc-alert-thumbnail-outline-width) solid
      var(--wzc-activity-thumbnail-outline-color);
    border-radius: inherit;
    box-sizing: border-box;
    content: "";
    inset: 0;
    pointer-events: none;
    position: absolute;
    z-index: 2;
  }

  .thumbnail,
  .placeholder {
    block-size: 100%;
    border-radius: inherit;
    inline-size: 100%;
  }

  .thumbnail {
    background: var(--wzc-event-thumbnail-placeholder-background);
    color: var(--wzc-event-thumbnail-placeholder-color);
    object-fit: cover;
    object-position: center;
  }

  .hover-preview {
    inset: 0;
    position: absolute;
  }

  .placeholder {
    align-items: center;
    background: var(--wzc-event-thumbnail-placeholder-background);
    color: var(--wzc-event-thumbnail-placeholder-color);
    display: flex;
    justify-content: center;
  }

  .placeholder svg {
    block-size: auto;
    inline-size: var(--wzc-event-thumbnail-placeholder-icon-size);
    opacity: 0.55;
  }

  .duration {
    background: var(--wzc-event-duration-background);
    border-radius: var(--wzc-radius-small);
    bottom: 0.2rem;
    color: var(--wzc-event-duration-color);
    font-size: var(--wzc-font-size-small);
    inset-inline-end: 0.2rem;
    line-height: 1;
    padding: 0.18rem 0.25rem;
    position: absolute;
  }

  .details {
    min-inline-size: 0;
    overflow: hidden;
    padding-block: var(--wzc-event-content-padding);
    pointer-events: none;
  }

  .badges {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-block-end: 0.2rem;
  }

  .badges wzc-badge {
    --wzc-badge-font-size: var(--wzc-event-badge-font-size);
    --wzc-badge-padding: var(--wzc-event-badge-padding);
  }

  .metadata {
    align-items: center;
    color: var(--wzc-event-secondary-color);
    display: flex;
    font-size: var(--wzc-font-size-small);
    gap: var(--wzc-event-metadata-gap);
    line-height: var(--wzc-line-height-condensed);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .metadata-icon {
    display: inline-flex;
    flex: 0 0 auto;
  }

  .metadata-icon svg {
    block-size: var(--wzc-event-metadata-icon-size);
    inline-size: var(--wzc-event-metadata-icon-size);
  }

  .metadata > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions {
    display: flex;
    gap: 0.2rem;
    padding-inline-end: var(--wzc-event-content-padding);
    position: relative;
    z-index: 2;
  }

  .action {
    align-items: center;
    appearance: none;
    background: var(--wzc-event-action-background);
    border: 0;
    border-radius: var(--wzc-radius-medium);
    color: var(--wzc-event-action-color);
    display: inline-flex;
    justify-content: center;
    min-block-size: var(--wzc-event-action-size);
    min-inline-size: var(--wzc-event-action-size);
    padding: 0;
    text-decoration: none;
  }

  .action:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .empty,
  .loading {
    align-items: center;
    block-size: 100%;
    color: var(--wzc-event-secondary-color);
    display: flex;
    justify-content: center;
    text-align: center;
  }

  .visually-hidden {
    position: absolute;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    inline-size: 1px;
    block-size: 1px;
    white-space: nowrap;
  }

  @media (max-width: 420px) {
    .tile {
      grid-template-columns: var(--wzc-event-thumbnail-inline-size) minmax(
          0,
          1fr
        );
    }

    .actions {
      display: none;
    }
  }
`;
