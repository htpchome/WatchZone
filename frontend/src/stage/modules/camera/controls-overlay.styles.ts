import { css } from "lit";

export const cameraControlsStyles = css`
  :host {
    display: grid;
    place-items: center;
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;
    container-type: size;
  }

  wzc-media-controls {
    display: grid;
    place-items: center;
    inline-size: 100%;
    block-size: 100%;
    pointer-events: auto;
  }
`;
