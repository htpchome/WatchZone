import { css } from "lit";

export const cameraSwitcherStyles = css`
  :host {
    display: block;
    position: relative;
    z-index: 5;
    inline-size: clamp(9rem, 24cqi, 14rem);
    pointer-events: none;
  }

  .switcher {
    position: relative;
    color: var(--wzc-media-overlay-color);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--wzc-media-overlay-transition-duration) ease;
  }

  .switcher.visible {
    opacity: 1;
    pointer-events: auto;
  }

  button {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 2rem;
    padding: 0.35rem 0.55rem;
    color: inherit;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    text-align: start;
    background: var(--wzc-media-overlay-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: var(--wzc-media-overlay-radius);
    cursor: pointer;
  }

  .trigger {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 1rem;
    align-items: center;
    gap: 0.4rem;
  }

  .trigger span {
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trigger svg {
    inline-size: 1rem;
    block-size: 1rem;
    transition: transform var(--wzc-media-overlay-transition-duration) ease;
  }

  .switcher.open .trigger svg {
    transform: rotate(180deg);
  }

  .options {
    display: grid;
    position: absolute;
    inset-block-start: calc(100% + 0.2rem);
    inset-inline: 0;
    max-block-size: min(18rem, 52cqb);
    gap: 0.18rem;
    padding: 0.2rem;
    overflow-y: auto;
    background: var(--wzc-media-overlay-background);
    border: 1px solid var(--wzc-media-overlay-border-color);
    border-radius: var(--wzc-media-overlay-radius);
    box-shadow: var(--wzc-media-overlay-shadow);
  }

  .option {
    background: transparent;
  }

  .option.selected,
  button:focus-visible {
    background: var(--wzc-media-overlay-hover-background);
  }

  button:focus-visible {
    outline: 2px solid var(--wzc-media-overlay-color);
    outline-offset: -2px;
  }

  @media (hover: hover) and (pointer: fine) {
    button:hover {
      background: var(--wzc-media-overlay-hover-background);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .switcher,
    .trigger svg {
      transition: none;
    }
  }
`;
