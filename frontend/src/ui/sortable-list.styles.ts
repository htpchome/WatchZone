import { css } from "lit";

export const sortableListStyles = css`
  :host {
    display: grid;
    gap: var(--wzc-sortable-gap);
    inline-size: 100%;
  }
`;

export const sortableTileStyles = css`
  :host {
    display: block;
    min-inline-size: 0;
  }

  .tile {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.65rem;
    box-sizing: border-box;
    min-block-size: 3.5rem;
    padding: 0.45rem 0.65rem;
    color: var(--wzc-sortable-color);
    background: var(--wzc-sortable-background);
    border: 1px solid var(--wzc-sortable-border-color);
    border-inline-start: 0.25rem solid var(--wzc-sortable-accent-color);
    border-radius: var(--wzc-sortable-radius);
    box-shadow: var(--wzc-sortable-shadow);
    transform: translateY(var(--wzc-sortable-drag-offset, 0px));
    transition:
      border-color var(--wzc-media-overlay-transition-duration) ease,
      opacity var(--wzc-media-overlay-transition-duration) ease;
  }

  :host([dragging]) {
    position: relative;
    z-index: 2;
  }

  :host([dragging]) .tile {
    opacity: 0.82;
    box-shadow: var(--wzc-shadow-medium);
    transition: none;
  }

  :host([drop-target]) .tile {
    border-color: var(--wzc-sortable-accent-color);
  }

  .handle {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: 2rem;
    block-size: 2rem;
    padding: 0.35rem;
    color: var(--wzc-sortable-handle-color);
    background: var(--wzc-sortable-handle-background);
    border: 1px solid var(--wzc-sortable-border-color);
    border-radius: var(--wzc-radius-medium);
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .handle:active {
    cursor: grabbing;
  }

  .handle:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .handle svg {
    display: block;
    inline-size: 100%;
    pointer-events: none;
  }

  .content {
    min-inline-size: 0;
  }

  .actions {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  ::slotted([slot="actions"]) {
    flex: 0 0 auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .tile {
      transition: none;
    }
  }
`;
