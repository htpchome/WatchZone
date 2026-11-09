import { css } from "lit";

export const cameraViewStyles = css`
  :host,
  .camera,
  .live-presentation {
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
  }

  :host,
  .camera,
  .live-presentation {
    display: block;
  }

  :host {
    container-type: inline-size;
  }

  .camera {
    position: relative;
    aspect-ratio: var(
      --wzc-camera-stage-runtime-aspect-ratio,
      var(--wzc-camera-stage-aspect-ratio)
    );
    background: var(--wzc-camera-stage);
    border-radius: var(--wzc-live-radius);
    box-shadow: none;
  }

  .camera.stage-resized {
    block-size: auto;
  }

  .live-presentation {
    --wzc-live-background: var(--wzc-camera-stage);
    --wzc-placeholder-background: var(--wzc-camera-stage);
    --wzc-live-shadow: none;
  }

  .stage-resize-handle {
    position: absolute;
    z-index: 3;
    bottom: 0;
    left: 50%;
    box-sizing: border-box;
    inline-size: var(--wzc-stage-resize-handle-inline-size);
    block-size: var(--wzc-stage-resize-handle-block-size);
    padding: 0;
    color: var(--wzc-media-overlay-color);
    background: transparent;
    border: 0;
    border-radius: var(--wzc-radius-pill);
    opacity: var(--wzc-stage-resize-handle-opacity);
    transform: translateX(-50%);
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
    border: 0;
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

  .stage-resize-handle[hidden],
  .camera:fullscreen .stage-resize-handle,
  .camera:-webkit-full-screen .stage-resize-handle {
    display: none;
  }

  .camera.stage-resizing .stage-resize-handle {
    opacity: var(--wzc-stage-resize-handle-active-opacity);
  }

  @media (hover: hover) and (pointer: fine) {
    .stage-resize-handle:hover {
      opacity: var(--wzc-stage-resize-handle-active-opacity);
    }
  }
`;
