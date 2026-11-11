import { css } from "lit";

/** Shared interaction, accessibility, and primary-color contract for buttons. */
export const buttonBaseStyles = css`
  .wzc-button,
  .wzc-icon-button {
    appearance: none;
    box-sizing: border-box;
    cursor: pointer;
    font: inherit;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .wzc-icon-button {
    text-decoration: none;
  }

  .wzc-button.primary {
    background: var(--wzc-color-primary);
    border-color: var(--wzc-color-primary);
    color: var(--wzc-color-text-reversed);
  }

  .wzc-button:focus-visible,
  .wzc-icon-button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .wzc-button:disabled,
  .wzc-icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .wzc-button > ha-icon,
  .wzc-button > svg,
  .wzc-icon-button > ha-icon,
  .wzc-icon-button > svg {
    pointer-events: none;
  }
`;
