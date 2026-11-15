import { css } from "lit";

export const cardPickerPreviewStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    color: var(--wzc-color-text-1);
    font-family: var(--wzc-font-family);
  }

  svg {
    display: block;
    inline-size: 1em;
    block-size: 1em;
  }

  .preview {
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto auto auto auto 7.15rem;
    align-content: start;
    gap: 0.35rem;
    block-size: 100%;
    min-block-size: 0;
    padding: 0.55rem 0.55rem 0.1rem;
  }

  .live {
    position: relative;
    display: grid;
    place-items: center;
    min-block-size: 0;
    inline-size: 100%;
    aspect-ratio: var(--wzc-camera-stage-aspect-ratio);
    overflow: hidden;
    color: var(--wzc-media-placeholder-color);
    background: var(--wzc-camera-stage);
    border-radius: var(--wzc-live-radius);
    box-shadow: var(--wzc-live-shadow);
  }

  .live .camera-icon {
    font-size: clamp(2.75rem, 18cqi, 4.75rem);
    opacity: 0.55;
  }

  .brand {
    position: absolute;
    inset-inline: 0;
    inset-block-end: 0.45rem;
    color: var(--wzc-media-overlay-color);
    font-size: 0.8rem;
    font-weight: var(--wzc-font-weight-semibold);
    text-align: center;
  }

  .camera-bar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--wzc-camera-navigation-gap);
    padding: var(--wzc-camera-navigation-padding);
    color: var(--wzc-camera-navigation-color);
    background: var(--wzc-camera-navigation-background);
    border-radius: var(--wzc-radius-pill);
    box-shadow: var(--wzc-camera-navigation-shadow);
  }

  .camera-name {
    display: grid;
    place-items: center;
    min-block-size: 1.75rem;
    border-radius: var(--wzc-radius-pill);
    font-size: 0.75rem;
    font-weight: var(--wzc-font-weight-semibold);
  }

  .camera-name.active {
    color: var(--wzc-camera-navigation-active-color);
    background: var(--wzc-camera-navigation-active-background);
    box-shadow: var(--wzc-camera-navigation-active-shadow);
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem;
    min-inline-size: 0;
  }

  .module-controls,
  .accessories {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-inline-size: 0;
  }

  .control {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    inline-size: min(var(--wzc-stage-stack-button-size), 2.1rem);
    block-size: min(var(--wzc-stage-stack-button-size), 2.1rem);
    color: var(--wzc-stage-stack-button-color);
    background: var(--wzc-stage-stack-button-background);
    border-radius: var(--wzc-radius-pill);
  }

  .control svg {
    inline-size: min(var(--wzc-stage-stack-icon-size), 1.15rem);
    block-size: min(var(--wzc-stage-stack-icon-size), 1.15rem);
  }

  .control.active {
    color: var(--wzc-stage-stack-button-active-color);
    background: var(--wzc-stage-stack-button-active-background);
  }

  .control.accessory {
    background: transparent;
    border-radius: 0;
  }

  .day {
    color: var(--wzc-media-day-header-color);
    font-size: 0.72rem;
    font-weight: var(--wzc-font-weight-semibold);
    text-align: center;
  }

  .tiles {
    display: grid;
    grid-auto-rows: 4.5rem;
    gap: 0.35rem;
    min-block-size: 0;
    overflow: hidden;
  }

  .tile {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    min-inline-size: 0;
    overflow: hidden;
    background: var(--wzc-event-tile-background);
    border-radius: var(--wzc-event-tile-radius);
    box-shadow: var(--wzc-event-tile-shadow);
  }

  .thumbnail {
    display: grid;
    place-items: center;
    color: var(--wzc-media-placeholder-color);
    background: var(--wzc-camera-stage);
    font-size: 1.65rem;
  }

  .thumbnail svg {
    opacity: 0.55;
  }

  .metadata {
    display: grid;
    align-content: center;
    gap: 0.2rem;
    min-inline-size: 0;
    padding: 0.35rem 0.45rem;
    font-size: 0.68rem;
  }

  .badges {
    display: flex;
    gap: 0.2rem;
    min-inline-size: 0;
    overflow: hidden;
    --wzc-badge-font-size: 0.58rem;
    --wzc-badge-padding: 0.06em 0.35em;
  }

  .details {
    overflow: hidden;
    color: var(--wzc-event-secondary-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
