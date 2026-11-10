import { css } from "lit";

export const recordingsStyles = css`
  :host {
    display: block;
    block-size: 100%;
    min-block-size: 0;
    min-inline-size: 0;
    color: var(--wzc-recording-color);
    font-family: var(--wzc-font-family);
  }

  .viewport {
    box-sizing: border-box;
    display: grid;
    grid-template-rows: var(--wzc-media-day-header-block-size) minmax(0, 1fr);
    block-size: 100%;
    max-block-size: calc(
      var(--wzc-media-day-header-block-size) + 5 *
        var(--wzc-recording-tile-block-size) + 5 *
        var(--wzc-recording-list-gap) + var(--wzc-media-day-header-gap) +
        var(--wzc-recording-list-padding)
    );
    min-block-size: calc(
      var(--wzc-media-day-header-block-size) + 3 *
        var(--wzc-recording-tile-block-size) + 3 *
        var(--wzc-recording-list-gap) + var(--wzc-media-day-header-gap) +
        var(--wzc-recording-list-padding)
    );
    overflow: hidden;
  }

  .scroller {
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 var(--wzc-recording-list-padding)
      var(--wzc-recording-list-padding);
  }

  .day-navigation {
    appearance: none;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: var(--wzc-media-day-navigation-size);
    block-size: var(--wzc-media-day-navigation-size);
    padding: 0;
    color: var(--wzc-recording-action-color);
    background: var(--wzc-recording-action-background);
    border: 1px solid var(--wzc-recording-action-border-color);
    border-radius: 50%;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .day-navigation:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 1px;
  }

  .day-navigation ha-icon {
    display: block;
    inline-size: 1rem;
    block-size: 1rem;
    --mdc-icon-size: 1rem;
  }

  .list {
    display: grid;
    gap: var(--wzc-recording-list-gap);
    margin-block-start: var(--wzc-media-day-header-gap);
  }

  .tile {
    position: relative;
    display: grid;
    grid-template-columns:
      var(--wzc-recording-icon-column-size) minmax(0, 1fr)
      auto;
    align-items: center;
    min-block-size: var(--wzc-recording-tile-block-size);
    overflow: hidden;
    color: inherit;
    background: var(--wzc-recording-tile-background);
    border: var(--wzc-recording-tile-border-width) solid
      var(--wzc-recording-tile-border-color);
    border-radius: var(--wzc-recording-tile-radius);
    box-shadow: var(--wzc-recording-tile-shadow);
  }

  .tile-player {
    position: absolute;
    z-index: 1;
    inset: 0;
    padding: 0;
    cursor: pointer;
    background: transparent;
    border: 0;
  }

  .tile-player:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  .movie {
    display: grid;
    align-self: stretch;
    place-items: center;
    color: var(--wzc-recording-icon-color);
    background: var(--wzc-recording-icon-background);
  }

  .movie svg {
    inline-size: var(--wzc-recording-icon-size);
    block-size: var(--wzc-recording-icon-size);
  }

  .details {
    display: grid;
    gap: 0.25rem;
    min-inline-size: 0;
    padding: var(--wzc-recording-content-padding);
  }

  .range {
    overflow: hidden;
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .duration {
    color: var(--wzc-recording-secondary-color);
    font-size: var(--wzc-font-size-small);
  }

  .download {
    appearance: none;
    position: relative;
    z-index: 2;
    display: grid;
    place-items: center;
    inline-size: var(--wzc-recording-action-size);
    block-size: var(--wzc-recording-action-size);
    margin-inline: var(--wzc-recording-action-margin);
    padding: 0;
    font: inherit;
    line-height: 0;
    cursor: pointer;
    color: var(--wzc-recording-action-color);
    background: var(--wzc-recording-action-background);
    border: 1px solid var(--wzc-recording-action-border-color);
    border-radius: var(--wzc-radius-medium);
    -webkit-tap-highlight-color: transparent;
  }

  .download:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .download ha-icon {
    display: block;
    --mdc-icon-size: 1.35rem;
    inline-size: 1.35rem;
    block-size: 1.35rem;
  }

  .empty {
    display: grid;
    min-block-size: calc(var(--wzc-recording-tile-block-size) * 3);
    place-items: center;
    color: var(--wzc-recording-secondary-color);
    font-size: var(--wzc-font-size-small);
    text-align: center;
  }

  .skeleton {
    color: var(--wzc-recording-skeleton-color);
    pointer-events: none;
  }

  .skeleton .movie,
  .skeleton .duration,
  .skeleton .download {
    color: var(--wzc-recording-skeleton-color);
  }

  .skeleton .download {
    cursor: default;
  }

  @media (hover: hover) and (pointer: fine) {
    .day-navigation:hover,
    .download:hover {
      color: var(--wzc-recording-action-hover-color);
    }
  }
`;
