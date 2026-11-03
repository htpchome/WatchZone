import { css } from "lit";

export const cameraStyles = css`
  :host,
  .camera,
  .live-presentation {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
  }

  .camera {
    position: relative;
    aspect-ratio: var(
      --wzc-camera-stage-runtime-aspect-ratio,
      var(--wzc-camera-stage-aspect-ratio)
    );
    background: var(--wzc-camera-stage);
    border-radius: var(--wzc-live-radius);
    box-shadow: var(--wzc-live-shadow);
  }

  .camera.stage-resized {
    block-size: auto;
  }

  .live-presentation {
    --wzc-live-background: var(--wzc-camera-stage);
    --wzc-placeholder-background: var(--wzc-camera-stage);
    --wzc-live-shadow: none;
  }

  .camera.square-camera-corners {
    --wzc-live-radius: 0px;
  }

  .camera.camera-shadow-small {
    box-shadow: var(--wzc-shadow-small);
  }

  .camera.camera-shadow-none {
    box-shadow: none;
  }

  .stage-resize-handle {
    position: absolute;
    z-index: 3;
    inset-block-end: max(0.2rem, env(safe-area-inset-bottom, 0px));
    inset-inline-start: 50%;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: clamp(4rem, 18%, 7rem);
    block-size: 2.25rem;
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
    inline-size: 100%;
    block-size: 1.05rem;
    background: var(--wzc-media-overlay-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: var(--wzc-radius-pill);
    box-shadow: var(--wzc-media-overlay-shadow);
    content: "";
  }

  .stage-resize-handle svg {
    position: relative;
    inline-size: 1.15rem;
    block-size: 1.15rem;
    pointer-events: none;
  }

  .stage-resize-handle:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 1px;
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
