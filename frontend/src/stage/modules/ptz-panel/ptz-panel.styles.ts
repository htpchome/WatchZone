import { css } from "lit";

export const ptzPanelStyles = css`
  :host {
    display: none;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-block-size: var(--wzc-ptz-panel-module-min-block-size);
    background: var(--wzc-ptz-panel-module-background);
    border-radius: var(--wzc-ptz-panel-module-radius);
  }

  :host([available]) {
    display: block;
  }
`;
