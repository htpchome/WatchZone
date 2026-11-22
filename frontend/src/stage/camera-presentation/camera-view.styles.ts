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
    display: block;
    aspect-ratio: var(
      --wzc-camera-stage-runtime-aspect-ratio,
      var(--wzc-camera-stage-aspect-ratio)
    );
    background: transparent;
    border-radius: var(--wzc-live-radius);
    box-shadow: none;
  }

  .camera.stage-resized {
    block-size: auto;
  }

  .live-presentation {
    position: absolute;
    inset: 0;
    block-size: auto;
    contain: size;
    overflow: hidden;
    --wzc-live-background: var(--wzc-camera-stage);
    --wzc-placeholder-color: var(--wzc-media-placeholder-color);
    --wzc-live-shadow: none;
  }

  .stage-resize-handle {
    position: absolute;
    inset-block-end: 0;
    inset-inline-start: 50%;
    z-index: 3;
    transform: translateX(-50%);
    visibility: var(--wzc-stage-resize-handle-visibility);
  }

  .camera:fullscreen .stage-resize-handle,
  .camera:-webkit-full-screen .stage-resize-handle {
    display: none;
  }

  .camera.stage-resizing .stage-resize-handle {
    opacity: var(--wzc-stage-resize-handle-active-opacity);
  }
`;
