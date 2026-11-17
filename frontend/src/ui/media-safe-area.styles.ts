import { css } from "lit";

/** Theme-owned veil above media content that underlaps the device safe area. */
export const mediaSafeAreaStyles = css`
  .viewport::after {
    content: "";
    position: absolute;
    z-index: 3;
    inset-inline: 0;
    inset-block-end: 0;
    block-size: var(--wzc-media-safe-area-underlap);
    pointer-events: none;
    background: var(--wzc-safe-area-surface-background);
    -webkit-backdrop-filter: var(--wzc-safe-area-surface-backdrop-filter);
    backdrop-filter: var(--wzc-safe-area-surface-backdrop-filter);
  }
`;
