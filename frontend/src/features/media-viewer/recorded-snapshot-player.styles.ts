import { css } from "lit";

export const recordedSnapshotPlayerStyles = css`
  :host {
    background: var(--wzc-recorded-media-background);
    display: block;
    inline-size: 100%;
    min-block-size: 0;
    min-inline-size: 0;
  }

  .viewport {
    aspect-ratio: var(--wzc-recorded-media-presentation-aspect-ratio, 16 / 9);
    background: var(--wzc-recorded-media-background);
    display: grid;
    inline-size: 100%;
    min-block-size: 0;
    min-inline-size: 0;
    overflow: hidden;
    position: relative;
    touch-action: pan-y;
  }

  .viewport.pannable {
    touch-action: none;
  }

  .viewport:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  .media-surface {
    background: var(--wzc-recorded-media-background);
    block-size: 100%;
    grid-column: 1;
    grid-row: 1;
    inline-size: 100%;
    overflow: hidden;
    position: relative;
  }

  .media-host,
  .snapshot {
    background: inherit;
    block-size: 100%;
    display: block;
    inset: 0;
    inline-size: 100%;
    object-fit: contain;
    pointer-events: none;
    position: absolute;
  }

  .snapshot {
    background: inherit;
    block-size: 100%;
    inline-size: 100%;
    max-block-size: 100%;
    max-inline-size: 100%;
    transform-origin: center;
    user-select: none;
    will-change: transform;
  }

  .viewport.pannable {
    cursor: move;
  }

  slot[name="media-resize-handle"] {
    display: block;
  }
`;
