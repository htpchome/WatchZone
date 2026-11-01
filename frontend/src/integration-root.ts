import { css, html, LitElement } from "lit";

export class IntegrationRoot extends LitElement {
  static styles = css`
    :host {
      display: block;
      padding: 1rem;
      font-family: system-ui, sans-serif;
    }
  `;

  render() {
    return html`<p>Lit frontend development environment is ready.</p>`;
  }
}

if (!customElements.get("integration-dev-root")) {
  customElements.define("integration-dev-root", IntegrationRoot);
}
