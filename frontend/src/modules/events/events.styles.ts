import { css } from "lit";

export const eventsStyles = css`
  :host {
    display: block;
    min-inline-size: 0;
  }

  .viewport {
    box-sizing: border-box;
    block-size: calc(
      3 * var(--wzc-event-tile-block-size) + 2 * var(--wzc-event-list-gap) + 2 *
        var(--wzc-event-list-padding)
    );
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    padding: var(--wzc-event-list-padding);
  }

  .list {
    display: grid;
    gap: var(--wzc-event-list-gap);
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
    padding: var(--wzc-event-tile-padding);
  }

  .square .tile,
  .square .thumbnail {
    border-radius: 0;
  }

  .thumbnail-wrap {
    align-self: center;
    aspect-ratio: 16 / 9;
    background: var(--wzc-event-thumbnail-background);
    inline-size: 100%;
    min-block-size: 0;
    overflow: hidden;
    position: relative;
  }

  .thumbnail,
  .placeholder {
    block-size: 100%;
    border-radius: var(--wzc-event-thumbnail-radius);
    inline-size: 100%;
  }

  .thumbnail {
    object-fit: contain;
  }

  .placeholder {
    align-items: center;
    background: var(--wzc-event-thumbnail-background);
    color: var(--wzc-event-secondary-color);
    display: flex;
    justify-content: center;
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
  }

  .badges {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-block-end: 0.2rem;
  }

  .metadata {
    color: var(--wzc-event-secondary-color);
    font-size: var(--wzc-font-size-small);
    line-height: var(--wzc-line-height-condensed);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    gap: 0.2rem;
  }

  .action {
    align-items: center;
    background: var(--wzc-event-action-background);
    border-radius: var(--wzc-radius-medium);
    color: var(--wzc-event-action-color);
    display: inline-flex;
    justify-content: center;
    min-block-size: var(--wzc-event-action-size);
    min-inline-size: var(--wzc-event-action-size);
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
