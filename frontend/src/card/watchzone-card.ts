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
import {
  createHomeAssistantApi,
  isHomeAssistant,
  type HomeAssistant,
  type HomeAssistantApi,
} from "../core/home-assistant";

interface PreviewDraftDetail {
  readonly baselineSignature: string;
  readonly config: WatchZoneCardConfig | null;
}

let liveModulePromise: Promise<unknown> | undefined;

function loadLiveModule(): Promise<unknown> {
  return (liveModulePromise ??= import("../modules/live").catch((error) => {
    liveModulePromise = undefined;
    throw error;
  }));
}

export class WatchZoneCard extends LitElement {
  private _config: WatchZoneCardConfig = normalizeCardConfig({});
  private _hass?: HomeAssistant;
  private _haApi?: HomeAssistantApi;
  private _liveModuleReady = false;
  private _liveModuleError?: string;
  private _previewConfig?: WatchZoneCardConfig;

  /** Set by Home Assistant for the card shown inside its editor preview. */
  public preview = false;

  public set hass(value: unknown) {
    if (!isHomeAssistant(value)) {
      return;
    }
    const config = this._previewConfig ?? this._config;
    const previousEntity = config.camera_entity
      ? this._hass?.states[config.camera_entity]
      : undefined;
    const transportChanged = this._hass?.connection !== value.connection;
    this._hass = value;
    if (transportChanged || !this._haApi) {
      this._haApi = createHomeAssistantApi(value);
    }
    const entityChanged = config.camera_entity
      ? previousEntity !== value.states[config.camera_entity]
      : false;
    if (transportChanged || entityChanged) {
      this.requestUpdate();
    }
    this._ensureLiveModule();
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
    this._ensureLiveModule();
    this.requestUpdate();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(
      EDITOR_PREVIEW_DRAFT_EVENT,
      this._handlePreviewDraft as EventListener,
    );
    this._ensureLiveModule();
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
      columns: 6,
      rows: 5,
      min_columns: 3,
      min_rows: 3,
    };
  }

  protected render() {
    const config = this._previewConfig ?? this._config;
    const cameraEntity = config.camera_entity;
    const cameraAvailable = Boolean(
      cameraEntity && this._hass?.states[cameraEntity],
    );
    return html`
      <ha-card>
        <div class="shell">
          ${
            config.title
              ? html`<h2 class="title">${config.title}</h2>`
              : nothing
          }
          ${
            cameraEntity
              ? this._liveModuleError
                ? html`<div class="live-error" role="alert">
                    <span>${this._liveModuleError}</span>
                    <button type="button" @click=${this._retryLiveModule}>
                      Retry
                    </button>
                  </div>`
                : this._liveModuleReady
                  ? html`<watchzone-card-live
                      .api=${this._haApi}
                      .available=${cameraAvailable}
                      .entityId=${cameraEntity}
                    ></watchzone-card-live>`
                  : html`<div class="live-placeholder" role="status">
                      Preparing live view…
                    </div>`
              : html`<div class="empty">
                  Select a camera in the card editor.
                </div>`
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
    this._ensureLiveModule();
    this.requestUpdate();
  };

  private _ensureLiveModule(): void {
    const config = this._previewConfig ?? this._config;
    if (!config.camera_entity || this._liveModuleReady) {
      return;
    }
    void loadLiveModule()
      .then(() => {
        if (this.isConnected) {
          this._liveModuleError = undefined;
          this._liveModuleReady = true;
          this.requestUpdate();
        }
      })
      .catch(() => {
        if (this.isConnected) {
          this._liveModuleError = "Unable to load the live-view module";
          this.requestUpdate();
        }
      });
  }

  private readonly _retryLiveModule = (): void => {
    this._liveModuleError = undefined;
    this._ensureLiveModule();
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
      --wzc-live-background: var(--secondary-background-color);
    }

    ha-card {
      box-sizing: border-box;
      inline-size: 100%;
      block-size: 100%;
      min-block-size: 16rem;
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
      font-family: var(--ha-font-family-body, inherit);
      font-size: clamp(1.25rem, 8cqi, 2rem);
      font-weight: var(--ha-font-weight-medium, 500);
      line-height: var(--ha-line-height-condensed, 1.2);
      text-align: center;
    }

    watchzone-card-live,
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
      color: var(--ha-color-text-secondary, var(--secondary-text-color));
      text-align: center;
    }

    .live-error {
      gap: 0.75rem;
      color: var(--ha-color-text-error, var(--error-color));
    }

    button {
      min-block-size: 2.5rem;
      padding-inline: 1rem;
      color: var(--ha-color-text-primary, var(--primary-text-color));
      background: var(--ha-color-fill-primary-normal-resting, transparent);
      border: 1px solid
        var(--ha-color-border-neutral-normal, var(--divider-color));
      border-radius: var(--ha-border-radius-button, 999px);
      font: inherit;
      cursor: pointer;
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
