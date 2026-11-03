import { html, LitElement, nothing } from "lit";

import {
  cardConfigSignature,
  normalizeCardConfig,
  type CardConfig,
} from "../core/config";
import {
  APP_NAME,
  APP_VERSION,
  CARD_TAG,
  CARD_TYPE,
  DEFAULT_CARD_TITLE,
  EDITOR_PREVIEW_DRAFT_EVENT,
  EDITOR_TAG,
} from "../core/constants";
import {
  createHomeAssistantApi,
  isHomeAssistant,
  type HomeAssistant,
  type HomeAssistantApi,
} from "../core/home-assistant";
import { syncHomeAssistantCardHostAppearance } from "../styles/home-assistant-card-bridge";
import { themeTokens } from "../styles/theme-tokens";
import { createDefaultCardLayout } from "./default-layout";
import { LayoutRuntime } from "./layout-runtime";
import { cardStyles } from "./watchzone-card.styles";

interface PreviewDraftDetail {
  readonly baselineSignature: string;
  readonly config: CardConfig | null;
}

export class DashboardCard extends LitElement {
  public static readonly appVersion = APP_VERSION;

  private _config: CardConfig = normalizeCardConfig({});
  private _hass?: HomeAssistant;
  private _haApi?: HomeAssistantApi;
  private _previewConfig?: CardConfig;
  private readonly _layoutRuntime = new LayoutRuntime(this);

  /** Set by Home Assistant for the card shown inside its editor preview. */
  public preview = false;

  public set hass(value: unknown) {
    if (!isHomeAssistant(value)) {
      return;
    }
    const transportChanged = this._hass?.connection !== value.connection;
    this._hass = value;
    if (transportChanged || !this._haApi) {
      this._haApi = createHomeAssistantApi(value);
    }
    this._layoutRuntime.setRuntime(value, this._haApi);
    if (transportChanged) this.requestUpdate();
  }

  public static getStubConfig(): CardConfig {
    return normalizeCardConfig({ type: CARD_TYPE, title: DEFAULT_CARD_TITLE });
  }

  public static async getConfigElement(): Promise<HTMLElement> {
    await import("../editor/watchzone-card-editor");
    return document.createElement(EDITOR_TAG);
  }

  public setConfig(value: unknown): void {
    const next = normalizeCardConfig(value);
    if (cardConfigSignature(next) === cardConfigSignature(this._config)) {
      this._syncOuterAppearance(next);
      return;
    }
    this._config = next;
    this._previewConfig = undefined;
    this._syncOuterAppearance(next);
    this._syncLayout(next);
    this.requestUpdate();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._syncOuterAppearance(this._previewConfig ?? this._config);
    window.addEventListener(
      EDITOR_PREVIEW_DRAFT_EVENT,
      this._handlePreviewDraft as EventListener,
    );
    this._syncLayout(this._previewConfig ?? this._config);
    this._layoutRuntime.setRuntime(this._hass, this._haApi);
  }

  public disconnectedCallback(): void {
    window.removeEventListener(
      EDITOR_PREVIEW_DRAFT_EVENT,
      this._handlePreviewDraft as EventListener,
    );
    super.disconnectedCallback();
  }

  public getCardSize(): number {
    return 5;
  }

  public getGridOptions() {
    return {
      columns: "full",
      min_columns: 3,
      rows: "auto",
    };
  }

  protected render() {
    const config = this._previewConfig ?? this._config;
    const cardClasses = [
      config.rounded_outer_corners === false ? "square-outer-corners" : "",
      config.outer_shadows === false ? "no-outer-shadow" : "",
      config.outer_padding === false ? "no-outer-padding" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return html`
      <ha-card class=${cardClasses}>
        <div class="shell">
          ${
            config.title
              ? html`<h2 class="title">${config.title}</h2>`
              : nothing
          }
          ${this._layoutRuntime.render()}
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
    const config = this._previewConfig ?? this._config;
    this._syncOuterAppearance(config);
    this._syncLayout(config);
    this.requestUpdate();
  };

  private _syncLayout(config: CardConfig): void {
    this._layoutRuntime.setLayout(createDefaultCardLayout(config));
    this._layoutRuntime.setRuntime(this._hass, this._haApi);
  }

  private _syncOuterAppearance(config: CardConfig): void {
    const roundedCorners = config.rounded_outer_corners !== false;
    const outerShadows = config.outer_shadows !== false;
    this.toggleAttribute("data-wzc-square-outer-corners", !roundedCorners);
    this.toggleAttribute("data-wzc-no-outer-shadow", !outerShadows);

    if (roundedCorners) this.style.removeProperty("--wzc-card-radius");
    else this.style.setProperty("--wzc-card-radius", "0px");
    syncHomeAssistantCardHostAppearance(this, {
      outerShadows,
      roundedCorners,
    });
  }

  static styles = [themeTokens, cardStyles];
}

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, DashboardCard);
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
