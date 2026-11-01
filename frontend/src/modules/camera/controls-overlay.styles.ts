import { css } from "lit";

export const cameraControlsStyles = css`
  :host {
    position: absolute;
    z-index: 2;
    inset: 0;
    display: block;
    overflow: hidden;
    pointer-events: none;
    container-type: size;
  }

  .control-group {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-end: calc(
      var(--wzc-media-overlay-safe-inline) + env(safe-area-inset-right, 0px)
    );
    display: flex;
    flex-direction: column;
    gap: var(--wzc-media-control-gap);
    transform: translateY(-50%);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 140ms ease,
      visibility 0s linear 140ms;
  }

  :host([visible]) .control-group {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition-delay: 0s;
  }

  .control-button {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: var(--wzc-media-control-size);
    block-size: var(--wzc-media-control-size);
    min-inline-size: 0;
    min-block-size: 0;
    padding: 0;
    color: var(--wzc-control-color, var(--wzc-media-overlay-color));
    background: var(
      --wzc-control-background,
      var(--wzc-media-overlay-background)
    );
    border: 1px solid
      var(--wzc-control-border-color, var(--wzc-media-overlay-border-color));
    border-radius: var(--wzc-control-radius, var(--wzc-media-overlay-radius));
    box-shadow: var(--wzc-control-shadow, var(--wzc-media-overlay-shadow));
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
    appearance: none;
    -webkit-appearance: none;
    -webkit-tap-highlight-color: transparent;
  }

  @media (hover: hover) and (pointer: fine) {
    .control-button:hover:not(:disabled) {
      color: var(--wzc-control-hover-color, var(--wzc-color-text-reversed));
      background: var(
        --wzc-control-hover-background,
        var(--wzc-media-overlay-hover-background)
      );
    }
  }

  .control-button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 1px;
  }

  :host([touch-input]) .control-button:hover:not(:disabled) {
    color: var(--wzc-control-color, var(--wzc-media-overlay-color));
    background: var(
      --wzc-control-background,
      var(--wzc-media-overlay-background)
    );
  }

  :host([touch-input]) .control-button:focus {
    outline: none;
  }

  .control-button:disabled {
    opacity: var(--wzc-control-disabled-opacity, 1);
    cursor: default;
  }

  svg {
    inline-size: var(--wzc-media-control-icon-size);
    block-size: var(--wzc-media-control-icon-size);
    overflow: visible;
    fill: currentColor;
  }

  @media (prefers-reduced-motion: reduce) {
    .control-group,
    .control-button {
      transition: none;
    }
  }
`;
