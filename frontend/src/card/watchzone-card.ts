import { css, html, LitElement, nothing } from "lit";

import {
  cardConfigSignature,
  normalizeCardConfig,
  type WatchZoneCardConfig,
} from "../core/config";
import {
  APP_NAME,
  CARD_TAG,
  CARD_TYPE,
  DEFAULT_CARD_TITLE,
  EDITOR_PREVIEW_DRAFT_EVENT,
  EDITOR_TAG,
} from "../core/constants";

interface PreviewDraftDetail {
  readonly baselineSignature: string;
  readonly config: WatchZoneCardConfig | null;
}

export class WatchZoneCard extends LitElement {
  private _config: WatchZoneCardConfig = normalizeCardConfig({});
  private _previewConfig?: WatchZoneCardConfig;

  /** Set by Home Assistant for the card shown inside its editor preview. */
  public preview = false;

  public set hass(_value: unknown) {
    // This shell consumes no HA state. Do not retain or react to the frequently
    // replaced hass object until a concrete feature needs a narrow slice of it.
  }

  public static getStubConfig(): WatchZoneCardConfig {
    return { type: CARD_TYPE, title: DEFAULT_CARD_TITLE };
  }

  public static async getConfigElement(): Promise<HTMLElement> {
    await import("../editor/watchzone-card-editor");
    return document.createElement(EDITOR_TAG);
  }

  public setConfig(value: unknown): void {
    const next = normalizeCardConfig(value);
    if (cardConfigSignature(next) === cardConfigSignature(this._config)) {
      return;
    }
    this._config = next;
    this._previewConfig = undefined;
    this.requestUpdate();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(
      EDITOR_PREVIEW_DRAFT_EVENT,
      this._handlePreviewDraft as EventListener,
    );
  }

  public disconnectedCallback(): void {
    window.removeEventListener(
      EDITOR_PREVIEW_DRAFT_EVENT,
      this._handlePreviewDraft as EventListener,
    );
    super.disconnectedCallback();
  }

  public getCardSize(): number {
    return 3;
  }

  public getGridOptions() {
    return {
      columns: 6,
      rows: 3,
      min_columns: 3,
      min_rows: 2,
    };
  }

  protected render() {
    const config = this._previewConfig ?? this._config;
    return html`
      <ha-card>
        <div class="shell">
          ${
            config.title
              ? html`<h2 class="title">${config.title}</h2>`
              : nothing
          }
        </div>
      </ha-card>
    `;
  }

  private readonly _handlePreviewDraft = (
    event: CustomEvent<PreviewDraftDetail>,
  ): void => {
    if (
      !this.preview ||
      event.detail.baselineSignature !== cardConfigSignature(this._config)
    ) {
      return;
    }
    this._previewConfig = event.detail.config ?? undefined;
    this.requestUpdate();
  };

  static styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      inline-size: 100%;
      block-size: 100%;
      min-inline-size: 0;
      min-block-size: 0;

      --wzc-card-background: var(
        --ha-card-background,
        var(--card-background-color)
      );
      --wzc-text-color: var(--ha-color-text-primary, var(--primary-text-color));
      --wzc-card-radius: var(--ha-card-border-radius, 12px);
      --wzc-card-border-color: var(
        --ha-card-border-color,
        var(--divider-color)
      );
      --wzc-card-border-width: var(--ha-card-border-width, 0);
      --wzc-card-padding: clamp(1rem, 3cqi, 2rem);
    }

    ha-card {
      box-sizing: border-box;
      inline-size: 100%;
      block-size: 100%;
      min-block-size: 12rem;
      overflow: clip;
      container-type: inline-size;
      color: var(--wzc-text-color);
      background: var(--wzc-card-background);
      border-color: var(--wzc-card-border-color);
      border-width: var(--wzc-card-border-width);
      border-radius: var(--wzc-card-radius);
    }

    .shell {
      box-sizing: border-box;
      display: grid;
      place-items: center;
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
      font-family: var(--ha-font-family-body, inherit);
      font-size: clamp(1.25rem, 8cqi, 2rem);
      font-weight: var(--ha-font-weight-medium, 500);
      line-height: var(--ha-line-height-condensed, 1.2);
      text-align: center;
    }
  `;
}

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, WatchZoneCard);
}

window.customCards ??= [];
if (!window.customCards.some((card) => card.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: APP_NAME,
    description: `${APP_NAME} modular camera interface`,
    preview: true,
  });
}
