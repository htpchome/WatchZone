import { css } from "lit";

export const twoWayTalkStyles = css`
  :host {
    display: block;
    position: relative;
    z-index: 4;
    inline-size: max-content;
    pointer-events: none;
  }

  .talk-layer {
    position: relative;
    pointer-events: none;
  }

  .talk-stack {
    display: grid;
    position: relative;
    justify-items: center;
    pointer-events: none;
  }

  .inactive-control {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }

  .inactive-control.visible {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  .talk-toast {
    position: absolute;
    inset-inline-start: 50%;
    inset-block-end: calc(100% + var(--wzc-control-dock-gap));
    inline-size: min(22rem, calc(100cqi - 2rem));
    transform: translateX(-50%);
    pointer-events: none;
  }
`;
