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
    align-items: center;
    justify-items: var(--wzc-media-controls-inline-alignment);
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;

    --wzc-media-controls-inline-alignment: start;
  }
`;
