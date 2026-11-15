import { css } from "lit";

/** Shared presentation for the camera stage's single resize affordance. */
export const stageResizeHandleStyles = css`
  .stage-resize-handle {
    position: relative;
    box-sizing: border-box;
    inline-size: var(--wzc-stage-resize-handle-inline-size);
    block-size: var(--wzc-stage-resize-handle-block-size);
    padding: 0;
    color: var(--wzc-media-overlay-color);
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-pill);
    opacity: var(--wzc-stage-resize-handle-opacity);
    cursor: ns-resize;
    touch-action: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .stage-resize-handle::before {
    position: absolute;
    inset-block-end: var(--wzc-stage-resize-handle-visible-bottom-inset);
    inset-inline-start: 50%;
    inline-size: var(--wzc-stage-resize-handle-visual-inline-size);
    block-size: 1.05rem;
    background: var(--wzc-media-overlay-background);
    border-radius: var(--wzc-radius-pill);
    box-shadow: var(--wzc-media-overlay-shadow);
    transform: translateX(-50%);
    content: "";
  }

  .stage-resize-handle svg {
    position: absolute;
    inset-block-end: calc(
      var(--wzc-stage-resize-handle-visible-bottom-inset) - 0.05rem
    );
    inset-inline-start: calc(50% - 0.575rem);
    inline-size: 1.15rem;
    block-size: 1.15rem;
    pointer-events: none;
  }

  .stage-resize-handle:focus-visible {
    outline: none;
    opacity: var(--wzc-stage-resize-handle-active-opacity);
  }

  .stage-resize-handle[hidden] {
    display: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .stage-resize-handle:hover {
      opacity: var(--wzc-stage-resize-handle-active-opacity);
    }
  }
`;
