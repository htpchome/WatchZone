import { css } from "lit";

export const cameraNavigationStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    pointer-events: auto;
  }

  .bar {
    box-sizing: border-box;
    inline-size: 100%;
    overflow: clip;
    border-radius: var(--wzc-radius-pill);
  }

  .bar.shadows {
    box-shadow: var(--wzc-camera-navigation-shadow);
  }

  .items {
    display: flex;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    gap: var(--wzc-camera-navigation-gap);
    inline-size: max-content;
    min-inline-size: 100%;
    padding: var(--wzc-camera-navigation-padding);
    color: var(--wzc-camera-navigation-color);
    background: var(--wzc-camera-navigation-background);
    border-radius: var(--wzc-radius-pill);
  }

  button {
    box-sizing: border-box;
    min-block-size: var(--wzc-camera-navigation-item-size);
    padding-inline: var(--wzc-camera-navigation-item-padding);
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-pill);
    font: inherit;
    font-weight: var(--wzc-font-weight-medium);
    white-space: nowrap;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  button[aria-selected="true"] {
    color: var(--wzc-camera-navigation-active-color);
    background: var(--wzc-camera-navigation-active-background);
  }

  .bar.shadows button[aria-selected="true"] {
    box-shadow: var(--wzc-camera-navigation-active-shadow);
  }

  button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }
`;
