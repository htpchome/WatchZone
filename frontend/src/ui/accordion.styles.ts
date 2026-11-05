import { css } from "lit";

export const accordionStyles = css`
  :host {
    display: grid;
    gap: 0.5rem;
    inline-size: 100%;
  }
`;

export const accordionItemStyles = css`
  :host {
    display: block;
    min-inline-size: 0;
    color: var(--wzc-accordion-header-color);
  }

  details {
    overflow: clip;
    border: 1px solid var(--wzc-accordion-border-color);
    border-radius: var(--wzc-accordion-radius);
    background: var(--wzc-accordion-background);
  }

  summary {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    min-block-size: 3rem;
    gap: 0.65rem;
    padding: 0.65rem 0.85rem;
    color: var(--wzc-accordion-header-color);
    font-size: var(--wzc-font-size-medium);
    font-weight: var(--wzc-font-weight-semibold);
    line-height: var(--wzc-line-height-condensed);
    cursor: pointer;
    list-style: none;
    user-select: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary:hover {
    background: var(--wzc-accordion-header-hover-background);
  }

  summary:focus-visible {
    outline: 2px solid var(--wzc-color-primary);
    outline-offset: -2px;
  }

  details[open] > summary {
    color: var(--wzc-accordion-header-open-color);
    background: var(--wzc-accordion-header-open-background);
    border-block-end: 1px solid var(--wzc-accordion-border-color);
  }

  .heading {
    min-inline-size: 0;
    flex: 1;
  }

  .summary-text {
    overflow: hidden;
    min-inline-size: 0;
    max-inline-size: 45%;
    color: var(--wzc-color-text-2);
    font-size: var(--wzc-font-size-small);
    font-weight: var(--wzc-font-weight-regular);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    display: grid;
    inline-size: 1.25rem;
    transition: transform 160ms ease;
  }

  details[open] .chevron {
    transform: rotate(180deg);
  }

  .chevron svg {
    display: block;
    inline-size: 100%;
  }

  .content {
    padding: 0.85rem;
  }

  .icon,
  ::slotted([slot="icon"]) {
    display: grid;
    flex: 0 0 auto;
    inline-size: 1.35rem;
  }

  .icon svg {
    display: block;
    inline-size: 100%;
  }

  :host([density="compact"]) details {
    border-radius: var(--wzc-radius-medium);
  }

  :host([density="compact"]) summary {
    min-block-size: 2.5rem;
    gap: 0.5rem;
    padding: 0.5rem 0.7rem;
    font-size: var(--wzc-font-size-small);
  }

  :host([density="compact"]) .content {
    padding: 0.7rem;
  }

  @media (hover: none) {
    summary:hover {
      background: inherit;
    }

    details[open] > summary:hover {
      background: var(--wzc-accordion-header-open-background);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron {
      transition: none;
    }
  }
`;
