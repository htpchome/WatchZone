import { css } from "lit";

export const cameraStyles = css`
  :host,
  .camera,
  watchzone-camera-live-view {
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

  watchzone-camera-live-view {
    --wzc-live-shadow: none;
  }

  .camera.square-camera-corners {
    --wzc-live-radius: 0px;
  }

  .camera.no-camera-shadow {
    box-shadow: none;
  }
`;
