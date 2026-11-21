import { css } from "lit";

export const twoWayTalkStyles = css`
  :host {
    display: block;
    position: relative;
    z-index: 4;
    inline-size: max-content;
    pointer-events: none;
  }

  :host {
    --wzc-round-button-color: var(--wzc-capability-control-color);
    --wzc-round-button-background: var(--wzc-capability-control-background);
    --wzc-round-button-border-color: var(--wzc-capability-control-border-color);
    --wzc-round-button-hover-background: var(
      --wzc-capability-control-hover-background
    );
  }

  :host([presentation="overlay"]) {
    --wzc-round-button-color: var(--wzc-media-overlay-color);
    --wzc-round-button-background: var(--wzc-media-overlay-background);
    --wzc-round-button-border-color: var(--wzc-media-overlay-border-color);
    --wzc-round-button-hover-background: var(
      --wzc-neutral-control-hover-background
    );
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
