import { css } from "lit";

export const toastStyles = css`
  :host {
    position: absolute;
    z-index: 4;
    inset-block-end: calc(
      var(--wzc-toast-safe-block, 0.75rem) +
        var(--wzc-safe-area-inset-block-end, 0px)
    );
    inset-inline-start: calc(
      var(--wzc-toast-safe-inline, 0.75rem) +
        var(--wzc-safe-area-inset-inline-start, 0px)
    );
    inset-inline-end: calc(
      var(--wzc-toast-safe-inline, 0.75rem) +
        var(--wzc-safe-area-inset-inline-end, 0px)
    );
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  :host([placement^="top-"]) {
    inset-block-start: calc(
      var(--wzc-toast-safe-block, 0.75rem) +
        var(--wzc-safe-area-inset-block-start, 0px)
    );
    inset-block-end: auto;
  }

  :host([placement$="-start"]) {
    justify-content: flex-start;
  }

  :host([placement$="-end"]) {
    justify-content: flex-end;
  }

  :host([presentation="inline"]) {
    position: static;
    display: inline-flex;
    justify-content: flex-start;
  }

  .toast {
    box-sizing: border-box;
    max-inline-size: min(32rem, 100%);
    padding: 0.45rem 0.7rem;
    color: var(--wzc-toast-neutral-color);
    background: var(--wzc-toast-neutral-background);
    border: 1px solid var(--wzc-toast-neutral-border-color);
    border-radius: var(--wzc-toast-radius);
    box-shadow: var(--wzc-toast-shadow);
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-medium);
    line-height: var(--wzc-line-height-condensed);
    text-align: center;
    opacity: 0;
    visibility: hidden;
    transform: translateY(0.25rem);
    transition:
      opacity var(--wzc-transition-fast) ease,
      transform var(--wzc-transition-fast) ease,
      visibility 0s linear var(--wzc-transition-fast);
    -webkit-backdrop-filter: blur(2px);
    backdrop-filter: blur(2px);
  }

  .toast.visible {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
    transition-delay: 0s;
  }

  .toast.success {
    color: var(--wzc-toast-success-color);
    background: var(--wzc-toast-success-background);
    border-color: var(--wzc-toast-success-border-color);
  }

  .toast.warning {
    color: var(--wzc-toast-warning-color);
    background: var(--wzc-toast-warning-background);
    border-color: var(--wzc-toast-warning-border-color);
  }

  .toast.error {
    color: var(--wzc-toast-error-color);
    background: var(--wzc-toast-error-background);
    border-color: var(--wzc-toast-error-border-color);
  }

  @media (prefers-reduced-motion: reduce) {
    .toast {
      transform: none;
      transition: none;
    }
  }
`;
