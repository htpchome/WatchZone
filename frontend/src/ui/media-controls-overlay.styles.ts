import { css } from "lit";

export const mediaControlsOverlayStyles = css`
  :host {
    position: absolute;
    z-index: 2;
    inset: 0;
    display: block;
    overflow: hidden;
    pointer-events: none;
    container-type: size;

    --wzc-control-size: var(--wzc-camera-control-size);
    --wzc-control-icon-size: var(--wzc-camera-control-icon-size);
    --wzc-control-gap: var(--wzc-control-dock-gap);
  }

  .control-group {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-end: var(--wzc-camera-control-inline-inset);
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

  :host([viewport-edge]) .control-group {
    inset-inline-end: calc(
      var(--wzc-camera-control-inline-inset) + env(safe-area-inset-right, 0px)
    );
  }

  @container (max-width: 480px) {
    .control-group {
      --wzc-control-size: 2.35rem;
      --wzc-control-icon-size: 1.4rem;
    }
  }

  @container (max-height: 360px) {
    .control-group {
      --wzc-control-size: 2.25rem;
      --wzc-control-icon-size: 1.3rem;
      --wzc-control-gap: 0.3rem;
    }
  }

  @container (max-height: 240px) {
    .control-group {
      --wzc-control-size: 1.875rem;
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
`;
