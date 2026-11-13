import { css } from "lit";

export const cameraNavigationStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    block-size: var(--wzc-camera-navigation-block-size);
    inline-size: 100%;
    min-inline-size: 0;
    pointer-events: auto;
  }

  .bar {
    display: grid;
    box-sizing: border-box;
    grid-template-columns:
      var(--wzc-camera-navigation-overflow-control-size) minmax(0, 1fr)
      var(--wzc-camera-navigation-overflow-control-size);
    align-items: center;
    block-size: 100%;
    inline-size: 100%;
    overflow: clip;
    background: var(--wzc-camera-navigation-background);
  }

  .bar.rounded,
  .bar.rounded .items::part(container) {
    border-radius: var(--wzc-radius-card);
  }

  .bar.square,
  .bar.square .items::part(container) {
    border-radius: 0;
  }

  .bar.shadows {
    box-shadow: var(--wzc-camera-navigation-shadow);
  }

  .items {
    box-sizing: border-box;
    block-size: 100%;
    inline-size: 100%;
    --wzc-segmented-background: var(--wzc-camera-navigation-background);
    --wzc-segmented-border: 0;
    --wzc-segmented-gap: var(--wzc-camera-navigation-gap);
    --wzc-segmented-padding: var(--wzc-camera-navigation-padding);
    --wzc-segmented-option-min-block-size: var(
      --wzc-camera-navigation-item-size
    );
    --wzc-segmented-option-padding-inline: var(
      --wzc-camera-navigation-item-padding
    );
    --wzc-segmented-option-color: var(--wzc-camera-navigation-color);
    --wzc-segmented-selected-color: var(--wzc-camera-navigation-active-color);
    --wzc-segmented-selected-background: var(
      --wzc-camera-navigation-active-background
    );
    --wzc-segmented-selected-shadow: none;
  }

  .bar.shadows .items {
    --wzc-segmented-selected-shadow: var(--wzc-camera-navigation-active-shadow);
  }

  .items::part(container) {
    justify-content: center;
    inline-size: 100%;
    block-size: 100%;
  }

  .items.overflowing::part(container) {
    justify-content: flex-start;
  }

  .viewport {
    min-inline-size: 0;
    block-size: 100%;
    overflow: hidden;
  }

  .overflow-slot {
    display: grid;
    place-items: center;
    inline-size: var(--wzc-camera-navigation-overflow-control-size);
    block-size: 100%;
  }

  .overflow-control {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: var(--wzc-camera-navigation-item-size);
    block-size: var(--wzc-camera-navigation-item-size);
    padding: 0;
    color: var(--wzc-camera-navigation-overflow-control-color);
    background: var(--wzc-camera-navigation-overflow-control-background);
    border: 0;
    border-radius: var(--wzc-radius-pill);
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .overflow-control svg {
    inline-size: 1.25rem;
    block-size: 1.25rem;
  }

  .overflow-control:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  .overflow-control:active {
    background: var(--wzc-camera-navigation-overflow-control-hover-background);
  }

  .overflow-count {
    position: absolute;
    inset-block-start: 0.05rem;
    inset-inline-end: 0.05rem;
    display: grid;
    place-items: center;
    min-inline-size: 0.85rem;
    block-size: 0.85rem;
    padding-inline: 0.12rem;
    color: var(--wzc-camera-navigation-overflow-count-color);
    background: var(--wzc-camera-navigation-overflow-count-background);
    border-radius: var(--wzc-radius-pill);
    font-size: 0.625rem;
    font-weight: var(--wzc-font-weight-bold);
    line-height: 1;
  }

  @media (hover: hover) and (pointer: fine) {
    .overflow-control:hover {
      background: var(
        --wzc-camera-navigation-overflow-control-hover-background
      );
    }
  }
`;
