import { css } from "lit";

export const watchZoneCardStyles = css`
  :host {
    display: block;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
  }

  ha-card {
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 16rem;
    overflow: clip;
    container-type: inline-size;
    color: var(--wzc-color-text-1);
    background: var(--wzc-card-background);
    border-color: var(--wzc-card-border-color);
    border-width: var(--wzc-card-border-width);
    border-radius: var(--wzc-card-radius);
    box-shadow: var(--wzc-card-outer-shadow);
  }

  ha-card.square-outer-corners {
    --wzc-card-radius: 0px;
    border-radius: 0 !important;
  }

  ha-card.no-outer-shadow {
    --wzc-card-outer-shadow: none;
    box-shadow: none !important;
  }

  ha-card.no-outer-padding .shell {
    padding: 0;
  }

  .shell {
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    align-items: center;
    gap: clamp(0.75rem, 2cqi, 1.25rem);
    inline-size: 100%;
    block-size: 100%;
    min-block-size: inherit;
    padding: var(--wzc-card-padding);
    overflow: hidden;
  }

  .title {
    min-inline-size: 0;
    max-inline-size: 100%;
    margin: 0;
    overflow-wrap: anywhere;
    color: inherit;
    font-family: var(--wzc-font-family);
    font-size: clamp(1.25rem, 8cqi, 2rem);
    font-weight: var(--wzc-font-weight-medium);
    line-height: var(--wzc-line-height-condensed);
    text-align: center;
  }

  watchzone-camera,
  .live-placeholder,
  .live-error,
  .empty {
    inline-size: 100%;
    min-inline-size: 0;
  }

  .live-placeholder,
  .live-error,
  .empty {
    display: grid;
    place-items: center;
    min-block-size: 10rem;
    color: var(--wzc-color-text-2);
    text-align: center;
  }

  .live-error {
    gap: 0.75rem;
    color: var(--wzc-color-error);
  }

  button {
    min-block-size: 2.5rem;
    padding-inline: 1rem;
    color: var(--wzc-color-text-1);
    background: var(--wzc-color-fill-primary);
    border: 1px solid var(--wzc-color-border-control);
    border-radius: var(--wzc-radius-button);
    font: inherit;
    cursor: pointer;
  }
`;
