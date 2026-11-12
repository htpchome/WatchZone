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
    box-sizing: border-box;
    block-size: 100%;
    inline-size: 100%;
    overflow: clip;
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
    inline-size: max-content;
    block-size: 100%;
    min-inline-size: 100%;
  }
`;
