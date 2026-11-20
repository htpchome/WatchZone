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

  .talk-controls {
    display: grid;
    position: relative;
    grid-template-columns: repeat(3, var(--wzc-control-size));
    align-items: center;
    min-block-size: var(--wzc-control-size);
    color: var(--wzc-talk-panel-color);
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
    --wzc-round-button-color: var(--wzc-color-text-reversed);
    --wzc-round-button-background: var(--wzc-talk-connected-color);
    --wzc-round-button-hover-background: var(--wzc-talk-connected-color);
    --wzc-round-button-border-color: transparent;
    box-shadow: 0 0 0 2px var(--wzc-talk-panel-border-color);
  }

  .talk-button.center.muted {
    --wzc-round-button-color: var(--wzc-color-on-warning);
    --wzc-round-button-background: var(--wzc-talk-muted-color);
    --wzc-round-button-hover-background: var(--wzc-talk-muted-color);
  }

  :host([presentation="overlay"]) .talk-controls {
    color: var(--wzc-media-overlay-color);
    background: var(--wzc-talk-overlay-panel-background);
    border-color: var(--wzc-talk-overlay-panel-border-color);
  }

  .connecting-spinner {
    position: absolute;
    inset: -0.35rem;
    border: 2px solid
      color-mix(in srgb, var(--wzc-talk-connecting-color) 30%, transparent);
    border-block-start-color: var(--wzc-talk-connecting-color);
    border-radius: 50%;
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

  @media (hover: hover) and (pointer: fine) {
    :host([presentation="overlay"]) .talk-button:hover {
      --wzc-round-button-hover-background: var(
        --wzc-neutral-control-hover-background
      );
    }

    :host(:not([presentation="overlay"]))
      .talk-button:not(.center):hover:not(:disabled) {
      color: var(--wzc-capability-control-hover-color);
      --wzc-round-button-hover-background: var(
        --wzc-capability-control-hover-background
      );
    }

    .talk-button.center:hover {
      --wzc-round-button-hover-background: var(--wzc-talk-connected-color);
    }

    .talk-button.center.muted:hover {
      --wzc-round-button-hover-background: var(--wzc-talk-muted-color);
    }
  }

  :host(:not([presentation="overlay"]))
    .talk-button:not(.center):active:not(:disabled) {
    color: var(--wzc-capability-control-active-color);
    background: var(--wzc-capability-control-active-background);
  }
`;
