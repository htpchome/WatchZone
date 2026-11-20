import { css } from "lit";

/** Shared physical geometry for intrinsically sized zoom presentation surfaces. */
export const zoomIntrinsicPresentationStyles = css`
  :host([intrinsic-presentation]) .media-surface {
    aspect-ratio: var(--wzc-zoom-media-aspect-ratio);
    block-size: 100%;
    inline-size: auto;
    inset-block: 0;
    inset-inline: 50% auto;
    position: absolute;
    translate: -50% 0;
  }
`;
