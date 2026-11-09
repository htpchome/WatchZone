import { css } from "lit";

const overlayControlBaseStyles = css`
  .round-button,
  .control-button {
    appearance: none;
    box-sizing: border-box;
    cursor: pointer;
    display: grid;
    font: inherit;
    padding: 0;
    place-items: center;
    touch-action: var(--wzc-control-touch-action, manipulation);
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .round-button:focus-visible,
  .control-button:focus-visible {
    outline: 2px solid var(--wzc-color-primary, currentcolor);
    outline-offset: 2px;
  }

  .round-button:disabled,
  .control-button:disabled {
    cursor: not-allowed;
    opacity: var(--wzc-control-disabled-opacity, 0.55);
  }
`;

/** Shared geometry and interaction contract for circular overlay controls. */
export const roundButtonStyles = [
  overlayControlBaseStyles,
  css`
    .round-button {
      position: relative;
      z-index: 1;
      inline-size: var(
        --wzc-round-button-size,
        var(--wzc-camera-control-size, 2.75rem)
      );
      block-size: var(
        --wzc-round-button-size,
        var(--wzc-camera-control-size, 2.75rem)
      );
      min-inline-size: var(--wzc-overlay-control-min-size, 2.75rem);
      min-block-size: var(--wzc-overlay-control-min-size, 2.75rem);
      color: var(--wzc-round-button-color, currentcolor);
      background: var(--wzc-round-button-background, transparent);
      border: 0;
      border-radius: 50%;
      box-shadow: inset 0 0 0 1px
        var(--wzc-round-button-border-color, currentcolor);
      --wzc-control-touch-action: var(
        --wzc-round-button-touch-action,
        manipulation
      );
    }

    .round-button > svg,
    .round-button > ha-icon {
      display: block;
      inline-size: var(--wzc-round-button-icon-size, 60%);
      block-size: var(--wzc-round-button-icon-size, 60%);
      margin: 0;
      pointer-events: none;
    }

    .round-button > ha-icon {
      --mdc-icon-size: 100%;
    }

    @media (hover: hover) and (pointer: fine) {
      .round-button:hover:not(:disabled) {
        background: var(
          --wzc-round-button-hover-background,
          var(--wzc-round-button-background, transparent)
        );
      }
    }

    @media (hover: none) {
      .round-button:hover,
      .round-button:active {
        background: var(--wzc-round-button-background, transparent);
      }
    }
  `,
];

/** Shared geometry and states for square media-overlay controls. */
export const mediaOverlayControlButtonStyles = [
  overlayControlBaseStyles,
  css`
    .control-button {
      background: var(
        --wzc-control-background,
        var(--wzc-media-overlay-background)
      );
      border: 1px solid
        var(--wzc-control-border-color, var(--wzc-media-overlay-border-color));
      border-radius: var(--wzc-control-radius, var(--wzc-media-overlay-radius));
      box-shadow: var(--wzc-control-shadow, var(--wzc-media-overlay-shadow));
      color: var(--wzc-control-color, var(--wzc-media-overlay-color));
      inline-size: var(--wzc-control-size, var(--wzc-camera-control-size));
      block-size: var(--wzc-control-size, var(--wzc-camera-control-size));
      min-inline-size: 0;
      min-block-size: 0;
    }

    .control-button svg {
      block-size: var(--wzc-control-icon-size);
      fill: currentcolor;
      inline-size: var(--wzc-control-icon-size);
      overflow: visible;
      pointer-events: none;
    }

    @media (hover: hover) and (pointer: fine) {
      .control-button:hover:not(:disabled) {
        background: var(
          --wzc-control-hover-background,
          var(--wzc-media-overlay-hover-background)
        );
        color: var(--wzc-control-hover-color, var(--wzc-media-overlay-color));
      }
    }
  `,
];
