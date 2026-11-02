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
    background: var(--wzc-camera-stage);
    border-radius: var(--wzc-live-radius);
    box-shadow: var(--wzc-live-shadow);
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
`;
