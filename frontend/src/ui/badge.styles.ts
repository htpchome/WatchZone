import { css } from "lit";

export const badgeStyles = css`
  :host {
    --wzc-badge-resolved-background: var(--wzc-badge-neutral-background);
    --wzc-badge-resolved-color: var(--wzc-badge-neutral-color);
    display: inline-flex;
    max-inline-size: 100%;
    vertical-align: middle;
  }

  .badge {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 0;
    max-inline-size: 100%;
    gap: 0.35em;
    padding: var(--wzc-badge-padding, 0.25em 0.6em);
    color: var(--wzc-badge-color, var(--wzc-badge-resolved-color));
    background: var(
      --wzc-badge-background,
      var(--wzc-badge-resolved-background)
    );
    border: 1px solid
      var(--wzc-badge-border-color, var(--wzc-badge-resolved-background));
    border-radius: var(--wzc-badge-radius, var(--wzc-radius-medium));
    box-shadow: var(--wzc-badge-shadow, none);
    font: inherit;
    font-size: var(--wzc-badge-font-size, var(--wzc-font-size-small));
    font-weight: var(--wzc-badge-font-weight, var(--wzc-font-weight-semibold));
    line-height: var(--wzc-line-height-condensed);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :host([shape="pill"]) .badge {
    border-radius: var(--wzc-badge-radius, var(--wzc-radius-pill));
  }

  :host([shape="square"]) .badge {
    border-radius: 0;
  }

  :host([size="medium"]) .badge {
    padding: var(--wzc-badge-padding, 0.3em 0.7em);
    font-size: var(--wzc-badge-font-size, var(--wzc-font-size-medium));
  }

  :host([size="large"]) .badge {
    padding: var(--wzc-badge-padding, 0.4em 0.85em);
    font-size: var(--wzc-badge-font-size, 1.125rem);
  }

  :host([appearance="outlined"]) .badge {
    color: var(--wzc-badge-color, var(--wzc-badge-resolved-background));
    background: var(--wzc-badge-background, transparent);
  }

  :host([appearance="filled-outlined"]) .badge {
    color: var(--wzc-badge-color, var(--wzc-badge-resolved-background));
    background: var(
      --wzc-badge-background,
      color-mix(in srgb, var(--wzc-badge-resolved-background) 18%, transparent)
    );
  }

  :host([variant="accent"]),
  :host([color="blue"]) {
    --wzc-badge-resolved-background: var(--wzc-badge-blue-background);
    --wzc-badge-resolved-color: var(--wzc-badge-blue-color);
  }

  :host([variant="success"]),
  :host([color="green"]) {
    --wzc-badge-resolved-background: var(--wzc-badge-green-background);
    --wzc-badge-resolved-color: var(--wzc-badge-green-color);
  }

  :host([variant="warning"]) {
    --wzc-badge-resolved-background: var(--wzc-color-fill-warning);
    --wzc-badge-resolved-color: var(--wzc-color-on-warning);
  }

  :host([color="amber"]) {
    --wzc-badge-resolved-background: var(--wzc-badge-amber-background);
    --wzc-badge-resolved-color: var(--wzc-badge-amber-color);
  }

  :host([variant="danger"]) {
    --wzc-badge-resolved-background: var(--wzc-color-fill-error);
    --wzc-badge-resolved-color: var(--wzc-color-on-error);
  }

  :host([color="red"]) {
    --wzc-badge-resolved-background: var(--wzc-badge-red-background);
    --wzc-badge-resolved-color: var(--wzc-badge-red-color);
  }

  :host([color="cyan"]) {
    --wzc-badge-resolved-background: var(--wzc-badge-cyan-background);
    --wzc-badge-resolved-color: var(--wzc-badge-cyan-color);
  }

  :host([color="emerald"]) {
    --wzc-badge-resolved-background: var(--wzc-badge-emerald-background);
    --wzc-badge-resolved-color: var(--wzc-badge-emerald-color);
  }

  :host([color="indigo"]) {
    --wzc-badge-resolved-background: var(--wzc-badge-indigo-background);
    --wzc-badge-resolved-color: var(--wzc-badge-indigo-color);
  }

  :host([color="orange"]) {
    --wzc-badge-resolved-background: var(--wzc-badge-orange-background);
    --wzc-badge-resolved-color: var(--wzc-badge-orange-color);
  }

  :host([color="pink"]) {
    --wzc-badge-resolved-background: var(--wzc-badge-pink-background);
    --wzc-badge-resolved-color: var(--wzc-badge-pink-color);
  }

  :host([color="purple"]) {
    --wzc-badge-resolved-background: var(--wzc-badge-purple-background);
    --wzc-badge-resolved-color: var(--wzc-badge-purple-color);
  }

  :host([color="rose"]) {
    --wzc-badge-resolved-background: var(--wzc-badge-rose-background);
    --wzc-badge-resolved-color: var(--wzc-badge-rose-color);
  }

  :host([color="yellow"]) {
    --wzc-badge-resolved-background: var(--wzc-badge-yellow-background);
    --wzc-badge-resolved-color: var(--wzc-badge-yellow-color);
  }
`;
