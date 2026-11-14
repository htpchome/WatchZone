import { css } from "lit";

import { mediaOverlayButtonStyles } from "../../../ui/media-overlay-button.styles";

const cameraSwitcherPrivateStyles = css`
  :host {
    display: block;
    position: relative;
    z-index: 5;
    inline-size: var(--wzc-camera-switcher-inline-size);
    pointer-events: none;
  }

  .switcher {
    position: relative;
    color: var(--wzc-media-overlay-color);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity var(--wzc-media-overlay-transition-duration) ease,
      visibility 0s linear var(--wzc-media-overlay-transition-duration);
  }

  .switcher.visible {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition-delay: 0s;
  }

  button {
    inline-size: 100%;
    padding: 0 var(--wzc-overlay-control-inline-padding);
    font-size: var(--wzc-overlay-control-text-size);
    font-weight: 600;
    text-align: start;
  }

  .trigger {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--wzc-control-icon-size);
    align-items: center;
    gap: var(--wzc-overlay-control-gap);
  }

  .trigger span {
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trigger svg {
    inline-size: var(--wzc-control-icon-size);
    block-size: var(--wzc-control-icon-size);
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

  .option.selected {
    background: var(--wzc-media-overlay-hover-background);
  }

  @media (prefers-reduced-motion: reduce) {
    .switcher,
    .trigger svg {
      transition: none;
    }
  }
`;

export const cameraSwitcherStyles = [
  mediaOverlayButtonStyles,
  cameraSwitcherPrivateStyles,
];
