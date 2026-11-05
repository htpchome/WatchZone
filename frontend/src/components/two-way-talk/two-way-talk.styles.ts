import { css } from "lit";

export const twoWayTalkStyles = css`
  :host {
    display: block;
    position: relative;
    z-index: 4;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 0;
    pointer-events: none;
  }

  .talk-layer {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: end center;
    padding-block-end: calc(
      var(--wzc-stage-resize-handle-block-size) +
        max(0.5rem, env(safe-area-inset-bottom))
    );
    pointer-events: none;
  }

  .talk-stack {
    display: grid;
    justify-items: center;
    gap: 0.55rem;
    pointer-events: none;
  }

  .talk-controls {
    display: grid;
    position: relative;
    grid-template-columns: repeat(3, var(--wzc-camera-control-size));
    align-items: center;
    min-block-size: var(--wzc-camera-control-size);
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

  .talk-controls button {
    z-index: 1;
  }

  button.center {
    transform: scale(1.18);
    color: var(--wzc-media-overlay-surface);
    background-color: var(--wzc-talk-connected-color);
    box-shadow: 0 0 0 2px var(--wzc-talk-panel-border-color);
  }

  button.inactive.connecting::after {
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
    inline-size: min(22rem, calc(100cqi - 2rem));
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .inactive-control {
      transition: none;
    }

    button.inactive.connecting::after {
      animation-duration: 1.4s;
    }
  }
`;
