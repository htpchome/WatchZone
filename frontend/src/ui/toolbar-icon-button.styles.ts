import { css } from "lit";

/** Shared neutral icon-button presentation for compact toolbars. */
export const toolbarIconButtonStyles = css`
  .wzc-toolbar-icon-button {
    align-items: center;
    appearance: none;
    background: transparent;
    border: 0;
    block-size: var(--wzc-toolbar-icon-button-size);
    box-sizing: border-box;
    color: var(--wzc-toolbar-icon-button-color);
    cursor: pointer;
    display: flex;
    inline-size: var(--wzc-toolbar-icon-button-size);
    justify-content: center;
    padding: 0;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .wzc-toolbar-icon-button:is(.active, .selected),
  .wzc-toolbar-icon-button:hover:not(:disabled) {
    color: var(--wzc-toolbar-icon-button-active-color);
  }

  .wzc-toolbar-icon-button.suppress-inactive-hover:not(
      .active,
      .selected
    ):hover:not(:disabled) {
    color: var(--wzc-toolbar-icon-button-color);
  }

  .wzc-toolbar-icon-button:disabled {
    color: var(--wzc-toolbar-icon-button-color);
    cursor: default;
    opacity: var(--wzc-toolbar-icon-button-disabled-opacity, 0.45);
  }

  .wzc-toolbar-icon-button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }

  .wzc-toolbar-icon-button svg {
    block-size: var(--wzc-toolbar-icon-button-icon-size);
    inline-size: var(--wzc-toolbar-icon-button-icon-size);
  }
`;
