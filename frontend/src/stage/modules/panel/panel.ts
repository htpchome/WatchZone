import { LitElement } from "lit";

import { PANEL_TAG } from "../../../core/constants";
import { panelStyles } from "./panel.styles";

/** Transparent stage module that provides a placement surface for components. */
export class PanelModule extends LitElement {
  static styles = panelStyles;
}

if (!customElements.get(PANEL_TAG)) {
  customElements.define(PANEL_TAG, PanelModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [PANEL_TAG]: PanelModule;
  }
}
