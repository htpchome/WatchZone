import { css } from "lit";

export const cameraStyles = css`
  :host,
  .camera,
  .camera-presentation {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
  }

  .camera {
    border-radius: var(--wzc-live-radius);
    box-shadow: var(--wzc-live-shadow);
  }

  .camera-presentation {
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
