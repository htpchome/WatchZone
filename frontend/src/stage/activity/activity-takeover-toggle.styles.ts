import { css } from "lit";

export const activityTakeoverToggleStyles = css`
  :host {
    display: block;
  }

  button {
    align-items: center;
    appearance: none;
    background: transparent;
    border: 0;
    block-size: var(--wzc-stage-stack-button-size);
    color: var(--wzc-stage-stack-button-color);
    cursor: pointer;
    display: flex;
    inline-size: var(--wzc-stage-stack-button-size);
    justify-content: center;
    padding: 0;
    border-radius: var(--wzc-radius-circle);
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  button:hover:not(:disabled) {
    color: var(--wzc-stage-stack-button-hover-color);
  }

  button.active {
    background: var(--wzc-stage-stack-button-active-background);
    color: var(--wzc-stage-stack-button-active-color);
  }

  button:disabled {
    cursor: default;
    opacity: 0.45;
  }

  button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  svg {
    block-size: var(--wzc-stage-stack-icon-size);
    inline-size: var(--wzc-stage-stack-icon-size);
  }
`;
