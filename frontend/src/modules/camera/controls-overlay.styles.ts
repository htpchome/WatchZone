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
    }

    .control-group {
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

    @media (prefers-reduced-motion: reduce) {
      .control-group,
      .control-button {
        transition: none;
      }
    }
  `,
];
