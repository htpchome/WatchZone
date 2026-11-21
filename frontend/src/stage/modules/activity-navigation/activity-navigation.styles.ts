import { css } from "lit";

import { roundButtonStyles } from "../../../ui/controls/overlay-control.styles";

export const activityNavigationStyles = [
  ...roundButtonStyles,
  css`
    :host {
      display: block;
      box-sizing: border-box;
      inline-size: 100%;
      min-inline-size: 0;
      pointer-events: auto;
    }

    nav,
    .stage-stack-accessories {
      align-items: center;
      display: flex;
      gap: var(--wzc-stage-stack-navigation-gap);
    }

    nav {
      justify-content: flex-start;
      padding-block: var(--wzc-stage-stack-navigation-padding);
    }

    .stage-stack-accessories {
      margin-inline-start: auto;
    }

    .stage-stack-accessories > * {
      margin-inline-start: 0;
    }

    :host([presentation="rail"]) nav,
    :host([presentation="rail"]) .stage-stack-accessories {
      flex-direction: column;
    }

    :host([presentation="rail"]) nav {
      inline-size: max-content;
    }

    :host([presentation="rail"]) .stage-stack-accessories {
      margin-block-start: auto;
      margin-inline-start: 0;
    }

    .stage-stack-button {
      --wzc-overlay-control-min-size: var(--wzc-stage-stack-button-size);
      --wzc-round-button-size: var(--wzc-stage-stack-button-size);
      --wzc-round-button-icon-size: var(--wzc-stage-stack-icon-size);
      --wzc-round-button-color: var(--wzc-stage-stack-button-color);
      --wzc-round-button-background: var(--wzc-stage-stack-button-background);
      --wzc-round-button-border-color: transparent;
      --wzc-round-button-hover-background: var(
        --wzc-stage-stack-button-background
      );
      outline: none;
    }

    .stage-stack-button:first-child {
      margin-inline-start: var(--wzc-stage-stack-navigation-padding);
    }

    :host([presentation="rail"]) .stage-stack-button:first-child {
      margin-inline-start: 0;
    }

    .stage-stack-button.active {
      --wzc-round-button-background: var(
        --wzc-stage-stack-button-active-background
      );
      --wzc-round-button-color: var(--wzc-stage-stack-button-active-color);
      --wzc-round-button-hover-background: var(
        --wzc-stage-stack-button-active-background
      );
      color: var(--wzc-stage-stack-button-active-color);
      opacity: 1;
    }

    .stage-stack-button.active > svg,
    .stage-stack-button.active > svg path {
      color: var(--wzc-stage-stack-button-active-color);
      fill: currentcolor;
      opacity: 1;
    }

    .stage-stack-button:focus-visible:not(.active),
    .stage-stack-button.hovered:not(.active, :disabled) {
      color: var(--wzc-stage-stack-button-hover-color);
    }

    .stage-stack-button:active:not(.active) {
      --wzc-round-button-background: var(
        --wzc-stage-stack-button-active-background
      );
      --wzc-round-button-color: var(--wzc-stage-stack-button-active-color);
    }
  `,
];
