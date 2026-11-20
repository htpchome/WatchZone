import { css } from "lit";

/** Shared physical geometry for intrinsically sized zoom presentation surfaces. */
export const zoomIntrinsicPresentationStyles = css`
  .viewport {
    display: grid;
    place-items: center;
  }

  .media-surface {
    aspect-ratio: var(--wzc-zoom-media-aspect-ratio, 16 / 9);
    block-size: 100%;
    inline-size: auto;
    inset: auto;
    position: relative;
  }
`;
