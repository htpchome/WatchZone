import { css } from "lit";

export const mediaControlsOverlayStyles = css`
  :host {
    z-index: 2;
    display: grid;
    align-items: center;
    justify-items: var(--wzc-media-controls-inline-alignment, center);
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;

    --wzc-control-size: var(--wzc-camera-control-size);
    --wzc-control-icon-size: var(--wzc-camera-control-icon-size);
    --wzc-control-gap: var(--wzc-control-dock-gap);
  }

  .control-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--wzc-control-gap);
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

  :host([viewport-edge]) .control-group {
    margin-inline-end: env(safe-area-inset-right, 0px);
  }

  @media (prefers-reduced-motion: reduce) {
    .control-group,
    .control-button {
      transition: none;
    }
  }
`;
