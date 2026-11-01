import { css, html, LitElement } from "lit";

export class WatchZoneCard extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 1rem;
      font-family: system-ui, sans-serif;
    }
  `;

  render() {
    return html`<p>WatchZone frontend development environment is ready.</p>`;
  }
}

if (!customElements.get("watchzone-card")) {
  customElements.define("watchzone-card", WatchZoneCard);
}
