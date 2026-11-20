import { css } from "lit";

export const ptzPanelStyles = css`
  :host {
    display: none;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: calc(100% - var(--wzc-stage-module-gap));
    min-block-size: var(--wzc-ptz-panel-module-min-block-size);
    margin-block-start: var(--wzc-stage-module-gap);
    background: var(--wzc-ptz-panel-module-background);
    border-radius: var(--wzc-ptz-panel-module-radius);
  }

  :host([available]) {
    display: block;
  }
`;
