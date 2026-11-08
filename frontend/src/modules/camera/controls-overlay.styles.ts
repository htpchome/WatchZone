import { css } from "lit";
import { mediaOverlayControlButtonStyles } from "../../styles/theme-tokens";

export const cameraControlsStyles = [
  mediaOverlayControlButtonStyles,
  css`
    :host {
      position: absolute;
      z-index: 2;
      inset: 0;
      display: block;
      overflow: hidden;
      pointer-events: none;
      container-type: size;

      --wzc-control-size: var(--wzc-camera-control-size);
      --wzc-control-icon-size: 1.65rem;
      --wzc-control-gap: 0.5rem;
      --wzc-control-safe-inline: var(--wzc-camera-control-safe-inline);
    }

    .control-group {
      position: absolute;
      inset-block-start: 50%;
      inset-inline-end: calc(
        var(--wzc-control-safe-inline) + env(safe-area-inset-right, 0px)
      );
      display: flex;
      flex-direction: column;
      gap: var(--wzc-control-gap);
      transform: translateY(-50%);
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition:
        opacity var(--wzc-media-overlay-transition-duration) ease,
        visibility 0s linear var(--wzc-media-overlay-transition-duration);
    }

    :host([visible]) .control-group {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transition-delay: 0s;
    }

    .control-button[data-control="suspend"][aria-pressed="true"] {
      color: var(--wzc-camera-suspended-resume-color);
      border-color: var(--wzc-camera-suspended-resume-border-color);
    }

    @container (max-width: 480px) {
      .control-group {
        --wzc-control-icon-size: 1.4rem;
      }
    }

    @container (max-height: 360px) {
      .control-group {
        --wzc-control-icon-size: 1.3rem;
        --wzc-control-gap: 0.3rem;
      }
    }

    @container (max-height: 240px) {
      .control-group {
        --wzc-control-icon-size: 1.15rem;
        --wzc-control-gap: 0.2rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .control-group,
      .control-button {
        transition: none;
      }
    }
  `,
];
