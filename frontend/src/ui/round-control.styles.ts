import { css } from "lit";

/** Shared camera-overlay treatment for circular interactive controls. */
export const roundControlStyles = css`
  .wzc-round-control {
    position: relative;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: var(--wzc-camera-control-size);
    block-size: var(--wzc-camera-control-size);
    padding: 0.55rem;
    overflow: hidden;
    isolation: isolate;
    color: var(--wzc-media-overlay-color);
    background-color: var(--wzc-media-overlay-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: 50%;
    box-shadow: var(--wzc-media-overlay-shadow);
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: box-shadow var(--wzc-media-overlay-transition-duration) ease;
  }

  .wzc-round-control::after {
    position: absolute;
    z-index: 1;
    inset: 0;
    background: var(--wzc-media-overlay-hover-background);
    border-radius: 50%;
    content: "";
    pointer-events: none;
    transform: scale(0);
    transform-origin: center;
    transition: transform var(--wzc-media-overlay-transition-duration) ease-out;
  }

  .wzc-round-control:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .wzc-round-control:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .wzc-round-control svg,
  .wzc-round-control ha-icon {
    display: block;
    position: relative;
    z-index: 2;
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .wzc-round-control:hover:not(:disabled)::after {
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wzc-round-control,
    .wzc-round-control::after {
      transition: none;
    }
  }
`;
