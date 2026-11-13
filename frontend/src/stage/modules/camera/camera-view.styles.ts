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
    display: grid;
    grid-template-areas:
      "top top top top top"
      "left media media media right"
      "left lower lower lower right"
      "metadata metadata metadata metadata metadata";
    grid-template-columns: var(--wzc-camera-overlay-grid-columns);
    grid-template-rows: var(--wzc-camera-overlay-grid-rows);
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
    grid-column: 1 / -1;
    grid-row: 1 / -1;
    --wzc-live-background: var(--wzc-camera-stage);
    --wzc-placeholder-background: var(--wzc-camera-stage);
    --wzc-placeholder-color: var(--wzc-media-placeholder-color);
    --wzc-live-shadow: none;
  }

  .stage-resize-handle {
    grid-area: metadata;
    place-self: end center;
    z-index: 3;
  }

  .camera:fullscreen .stage-resize-handle,
  .camera:-webkit-full-screen .stage-resize-handle {
    display: none;
  }

  .camera.stage-resizing .stage-resize-handle {
    opacity: var(--wzc-stage-resize-handle-active-opacity);
  }
`;
