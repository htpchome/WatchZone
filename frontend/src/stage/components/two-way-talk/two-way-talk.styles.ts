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

  .talk-controls {
    display: grid;
    position: relative;
    grid-template-columns: repeat(3, var(--wzc-control-size));
    align-items: center;
    min-block-size: var(--wzc-control-size);
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-talk-panel-background);
    border: 1px solid var(--wzc-talk-panel-border-color);
    border-radius: var(--wzc-radius-pill);
    overflow: visible;
    pointer-events: auto;
  }

  .talk-controls canvas {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    border-radius: inherit;
    pointer-events: none;
  }

  .talk-controls .talk-button {
    --wzc-round-button-color: inherit;
    --wzc-round-button-background: transparent;
    --wzc-round-button-border-color: transparent;
  }

  .talk-button.center {
    transform: scale(1.18);
    --wzc-round-button-color: var(--wzc-media-overlay-surface);
    --wzc-round-button-background: var(--wzc-talk-connected-color);
    --wzc-round-button-border-color: transparent;
    box-shadow: 0 0 0 2px var(--wzc-talk-panel-border-color);
  }

  .talk-button.inactive.connecting::after {
    content: "";
    position: absolute;
    inset: -0.35rem;
    border: 2px solid
      color-mix(in srgb, var(--wzc-talk-connecting-color) 30%, transparent);
    border-block-start-color: var(--wzc-talk-connecting-color);
    border-radius: 50%;
    animation: wzc-talk-connecting 700ms linear infinite;
    pointer-events: none;
  }

  @keyframes wzc-talk-connecting {
    to {
      transform: rotate(1turn);
    }
  }

  .inactive-control {
    pointer-events: auto;
    opacity: 0;
    transition: opacity var(--wzc-media-overlay-transition-duration) ease;
  }

  .inactive-control.visible {
    opacity: 1;
  }

  .talk-toast {
    position: absolute;
    inset-inline-start: 50%;
    inset-block-end: calc(100% + var(--wzc-control-dock-gap));
    inline-size: min(22rem, calc(100cqi - 2rem));
    transform: translateX(-50%);
    pointer-events: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .talk-button:hover {
      --wzc-round-button-hover-background: var(
        --wzc-neutral-control-hover-background
      );
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .inactive-control {
      transition: none;
    }

    .talk-button.inactive.connecting::after {
      animation-duration: 1.4s;
    }
  }
`;
