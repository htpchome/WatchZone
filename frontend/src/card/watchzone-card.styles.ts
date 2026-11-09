import { css } from "lit";

export const cardStyles = css`
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
    min-block-size: 0;
    overflow: clip;
    container-type: inline-size;
    color: var(--wzc-color-text-1);
    background: var(--wzc-card-background);
    border-color: var(--wzc-card-border-color);
    border-width: var(--wzc-card-border-width);
    border-radius: var(--wzc-card-radius);
    box-shadow: var(--wzc-card-outer-shadow);
    padding: var(--wzc-card-padding);
  }

  ha-card.square-outer-corners {
    --wzc-card-radius: 0px;
    border-radius: 0 !important;
  }

  ha-card.no-outer-shadow {
    --wzc-card-outer-shadow: none;
    box-shadow: none !important;
  }

  ha-card.no-outer-padding {
    padding: 0;
  }

  .shell {
    position: relative;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    align-items: stretch;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: 0;
    padding: 0;
  }

  .card-toast {
    z-index: 8;
  }
`;
