import { css } from "lit";

export const toastRegionStyles = css`
  :host {
    position: absolute;
    z-index: 4;
    inset-block-end: 0.75rem;
    inset-inline: 0.75rem;
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    pointer-events: none;
  }

  :host([mode="inline"]) {
    position: static;
    justify-items: stretch;
  }

  :host([mode="inline"]) .toast {
    inline-size: 100%;
    max-inline-size: none;
  }

  .toast {
    box-sizing: border-box;
    max-inline-size: min(32rem, 100%);
    padding: 0.45rem 0.75rem;
    border: 1px solid color-mix(in srgb, currentColor 38%, transparent);
    border-radius: var(--wzc-toast-radius);
    box-shadow: var(--wzc-toast-shadow);
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-medium);
    line-height: var(--wzc-line-height-condensed);
    text-align: center;
    overflow-wrap: anywhere;
    opacity: 1;
    box-shadow:
      inset 0 1px 0 var(--wzc-toast-highlight-color),
      var(--wzc-toast-shadow);
  }

  .toast-icon {
    display: inline-grid;
    inline-size: 1rem;
    margin-inline-end: 0.35rem;
    vertical-align: -0.2rem;
  }

  .toast-icon svg {
    display: block;
    inline-size: 100%;
  }

  .toast[data-severity="success"] {
    color: var(--wzc-toast-success-color);
    background: var(--wzc-toast-success-background);
  }

  .toast[data-severity="warning"] {
    color: var(--wzc-toast-warning-color);
    background: var(--wzc-toast-warning-background);
  }

  .toast[data-severity="error"] {
    color: var(--wzc-toast-error-color);
    background: var(--wzc-toast-error-background);
  }

  .toast[data-dismissing] {
    opacity: 0;
    transform: translateY(0.25rem);
  }
`;
