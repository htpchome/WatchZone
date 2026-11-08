import { css } from "lit";

export const mediaPlayerStyles = css`
  :host {
    background: var(--wzc-recorded-media-background);
    display: block;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 0;
  }

  video {
    aspect-ratio: 16 / 9;
    background: var(--wzc-recorded-media-background);
    display: block;
    block-size: 100%;
    inline-size: 100%;
    max-block-size: 100%;
    object-fit: contain;
  }
`;
