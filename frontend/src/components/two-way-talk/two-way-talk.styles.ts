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

  button {
    display: grid;
    position: relative;
    z-index: 1;
    place-items: center;
    box-sizing: border-box;
    inline-size: var(--wzc-camera-control-size);
    block-size: var(--wzc-camera-control-size);
    padding: 0.55rem;
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  button.center {
    transform: scale(1.18);
    color: var(--wzc-media-overlay-surface);
    background: var(--wzc-talk-connected-color);
    box-shadow: 0 0 0 2px var(--wzc-talk-panel-border-color);
  }

  button.inactive {
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-media-overlay-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
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

  button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  button svg {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;
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

  @media (hover: hover) and (pointer: fine) {
    button:hover {
      background: var(--wzc-media-overlay-hover-background);
    }
  }

  @media (hover: none) {
    button:hover,
    button:active {
      background: transparent;
    }

    button.center:hover,
    button.center:active {
      background: var(--wzc-talk-connected-color);
    }

    button.inactive:hover,
    button.inactive:active {
      background: var(--wzc-media-overlay-background);
    }
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
