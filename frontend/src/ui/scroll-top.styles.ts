import { css } from "lit";

export const scrollTopStyles = css`
  :host {
    position: absolute;
    z-index: 4;
    inset-block-end: 0.75rem;
    inset-inline-start: 50%;
    display: block;
    pointer-events: none;
    transform: translateX(-50%);
  }

  :host([hidden]) {
    display: none;
  }

  button {
    display: inline-flex;
    box-sizing: border-box;
    align-items: center;
    min-block-size: 2.5rem;
    gap: 0.35rem;
    padding: 0.4rem 0.8rem;
    color: var(--wzc-color-text-1);
    background: var(--wzc-color-surface);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-pill);
    box-shadow: var(--wzc-shadow-small);
    cursor: pointer;
    font: inherit;
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-semibold);
    pointer-events: auto;
    -webkit-tap-highlight-color: transparent;
  }

  ha-icon {
    --mdc-icon-size: 1rem;
  }

  button:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: 2px;
  }
`;
