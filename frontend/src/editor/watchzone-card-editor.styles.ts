import { css } from "lit";

export const cardEditorStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    color: var(--wzc-color-text-1);
  }

  ha-input,
  ha-selector {
    inline-size: 100%;
  }

  ha-selector {
    display: block;
  }

  .editor-status {
    margin-block-end: 0.75rem;
  }

  .section-title {
    margin-block-start: 1.5rem;
    color: var(--wzc-color-text-1);
    font-size: var(--wzc-font-size-medium);
    font-weight: var(--wzc-font-weight-medium);
    line-height: var(--wzc-line-height-condensed);
  }

  .boolean-option {
    margin-block-start: 0.5rem;
  }
`;
