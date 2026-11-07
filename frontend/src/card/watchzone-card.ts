import { html, LitElement } from "lit";

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
  HomeAssistantCameraImageCredentialGuard,
  isHomeAssistant,
  type HomeAssistant,
  type HomeAssistantApi,
  type HomeAssistantConnection,
  type HomeAssistantConnectionEventListener,
} from "../core/home-assistant";
import { LocalizationController } from "../core/localization";
import { CardHostAppearanceController } from "../styles/card-host-appearance.controller";
import { themeTokens } from "../styles/theme-tokens";
import { createBuiltInStageSet } from "./built-in-stages/catalog";
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
  private _observedConnection?: HomeAssistantConnection;
  private _transportConnected = true;
  private readonly _cameraImageCredentials =
    new HomeAssistantCameraImageCredentialGuard();
  private readonly _localization = new LocalizationController(this, () =>
    this._syncRuntime(),
  );
  private readonly _layoutRuntime = new LayoutRuntime(this);
  private readonly _cardHostAppearance = new CardHostAppearanceController(this);
  private _stageResizeFrame?: number;
  private readonly _stageResizeObserver =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(([entry]) => {
          if (!entry) return;
          if (this._stageResizeFrame !== undefined) {
            cancelAnimationFrame(this._stageResizeFrame);
          }
          const inlineSize = entry.contentRect.width;
          this._stageResizeFrame = requestAnimationFrame(() => {
            this._stageResizeFrame = undefined;
            this._layoutRuntime.setInlineSize(inlineSize);
          });
        });

  /** Set by Home Assistant for the card shown inside its editor preview. */
  public preview = false;

  public set hass(value: unknown) {
    if (!isHomeAssistant(value)) {
      return;
    }
    const transportChanged = this._hass?.connection !== value.connection;
    this._hass = value;
    this._localization.setLanguage(value.locale?.language ?? value.language);
    if (transportChanged || !this._haApi) {
      this._haApi = createHomeAssistantApi(value);
    }
    this._transportConnected = value.connection.connected !== false;
    this._observeConnection(value.connection);
    this._syncRuntime();
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
      this._cardHostAppearance.configure(next);
      return;
    }
    this._config = next;
    this._previewConfig = undefined;
    this._cardHostAppearance.configure(next);
    this._syncLayout(next);
    this.requestUpdate();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._cardHostAppearance.configure(this._previewConfig ?? this._config);
    window.addEventListener(
      EDITOR_PREVIEW_DRAFT_EVENT,
      this._handlePreviewDraft as EventListener,
    );
    this._syncLayout(this._previewConfig ?? this._config);
    if (this._hass) this._observeConnection(this._hass.connection);
    this._syncRuntime();
    this._stageResizeObserver?.observe(this);
    this._layoutRuntime.setInlineSize(this.getBoundingClientRect().width);
  }

  public disconnectedCallback(): void {
    this._stageResizeObserver?.disconnect();
    if (this._stageResizeFrame !== undefined) {
      cancelAnimationFrame(this._stageResizeFrame);
      this._stageResizeFrame = undefined;
    }
    window.removeEventListener(
      EDITOR_PREVIEW_DRAFT_EVENT,
      this._handlePreviewDraft as EventListener,
    );
    this._unobserveConnection();
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
    ]
      .filter(Boolean)
      .join(" ");
    return html`
      <ha-card class=${cardClasses}>
        <div class="shell" role="region" aria-label=${config.title}>
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
    this._cardHostAppearance.configure(config);
    this._syncLayout(config);
    this.requestUpdate();
  };

  private _syncLayout(config: CardConfig): void {
    const { designs, flow } = createBuiltInStageSet(config);
    this._layoutRuntime.setStageSet(designs, flow);
    this._syncRuntime();
  }

  private readonly _handleConnectionDisconnected: HomeAssistantConnectionEventListener =
    () => {
      this._cameraImageCredentials.retire(this._hass, this._cameraEntityIds());
      this._transportConnected = false;
      this._syncRuntime();
    };

  private readonly _handleConnectionReady: HomeAssistantConnectionEventListener =
    () => {
      // Wait for Home Assistant's next `hass` assignment so restored entity
      // pictures cannot reuse access tokens from before the restart.
      this._transportConnected = false;
      this._syncRuntime();
    };

  private _observeConnection(connection: HomeAssistantConnection): void {
    if (this._observedConnection === connection) return;
    this._unobserveConnection();
    connection.addEventListener?.(
      "disconnected",
      this._handleConnectionDisconnected,
    );
    connection.addEventListener?.("ready", this._handleConnectionReady);
    this._observedConnection = connection;
  }

  private _unobserveConnection(): void {
    const connection = this._observedConnection;
    if (!connection) return;
    connection.removeEventListener?.(
      "disconnected",
      this._handleConnectionDisconnected,
    );
    connection.removeEventListener?.("ready", this._handleConnectionReady);
    this._observedConnection = undefined;
  }

  private _syncRuntime(): void {
    const hass =
      this._transportConnected && this._hass
        ? this._cameraImageCredentials.sanitize(
            this._hass,
            this._cameraEntityIds(),
          )
        : undefined;
    this._layoutRuntime.setRuntime(
      hass,
      this._haApi,
      this._localization.localize,
    );
  }

  private _cameraEntityIds(): readonly string[] {
    return (this._previewConfig ?? this._config).cameras.map(
      ({ entity_id }) => entity_id,
    );
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
