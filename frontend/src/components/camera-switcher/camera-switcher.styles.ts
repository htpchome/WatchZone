import { css } from "lit";

export const cameraSwitcherStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    pointer-events: auto;
  }

  .scroller {
    box-sizing: border-box;
    inline-size: 100%;
    overflow-x: auto;
    overflow-y: clip;
    scrollbar-width: none;
    overscroll-behavior-inline: contain;
    touch-action: pan-x;
  }

  .scroller::-webkit-scrollbar {
    display: none;
  }

  .scroller.shadows {
    border-radius: var(--wzc-radius-pill);
    box-shadow: var(--wzc-camera-switcher-shadow);
  }

  .track {
    display: flex;
    position: relative;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    gap: var(--wzc-camera-switcher-gap);
    inline-size: max-content;
    min-inline-size: 100%;
    padding: var(--wzc-camera-switcher-padding);
    color: var(--wzc-camera-switcher-color);
    background: var(--wzc-camera-switcher-background);
    border-radius: var(--wzc-radius-pill);
  }

  button {
    position: relative;
    z-index: 1;
    box-sizing: border-box;
    min-block-size: var(--wzc-camera-switcher-item-size);
    padding-inline: var(--wzc-camera-switcher-item-padding);
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-pill);
    font: inherit;
    font-weight: var(--wzc-font-weight-medium);
    white-space: nowrap;
    cursor: pointer;
    transition:
      color var(--wzc-camera-switcher-transition-duration) ease,
      background-color var(--wzc-camera-switcher-transition-duration) ease;
    -webkit-tap-highlight-color: transparent;
  }

  button[aria-selected="true"] {
    color: var(--wzc-camera-switcher-active-color);
    background: var(--wzc-camera-switcher-active-background);
  }

  .scroller.shadows button[aria-selected="true"] {
    box-shadow: var(--wzc-camera-switcher-active-shadow);
  }

  button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
`;
