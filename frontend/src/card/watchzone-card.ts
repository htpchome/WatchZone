import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  cardConfigSignature,
  normalizeCardConfig,
  type CardConfig,
} from "../core/config";
import {
  APP_NAME,
  APP_VERSION,
  CAMERA_TAG,
  CARD_TAG,
  CARD_TYPE,
  DEFAULT_CARD_TITLE,
  EDITOR_PREVIEW_DRAFT_EVENT,
  EDITOR_TAG,
} from "../core/constants";
import {
  cameraImageUrl,
  createHomeAssistantApi,
  isHomeAssistant,
  type HomeAssistant,
  type HomeAssistantApi,
} from "../core/home-assistant";
import type { MediaSessionLease } from "../core/media-session-manager";
import { LiveSourceResolver } from "../providers/live-source-resolver";
import { syncHomeAssistantCardHostAppearance } from "../styles/home-assistant-card-bridge";
import { themeTokens } from "../styles/theme-tokens";
import { cardStyles } from "./watchzone-card.styles";

interface PreviewDraftDetail {
  readonly baselineSignature: string;
  readonly config: CardConfig | null;
}

let cameraModulePromise: Promise<unknown> | undefined;

function loadCameraModule(): Promise<unknown> {
  return (cameraModulePromise ??= import("../modules/camera").catch((error) => {
    cameraModulePromise = undefined;
    throw error;
  }));
}

const cameraTag = unsafeStatic(CAMERA_TAG);

export class DashboardCard extends LitElement {
  public static readonly appVersion = APP_VERSION;

  private _config: CardConfig = normalizeCardConfig({});
  private _hass?: HomeAssistant;
  private _haApi?: HomeAssistantApi;
  private _liveModuleReady = false;
  private _liveModuleError?: string;
  private _prewarmLease?: MediaSessionLease;
  private _prewarmRequestKey?: string;
  private _prewarmGeneration = 0;
  private _previewConfig?: CardConfig;
  private readonly _sourceResolver = new LiveSourceResolver();

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
    this._syncPrewarmLease();
    this._ensureLiveModule();
  }

  public static getStubConfig(): CardConfig {
    return { type: CARD_TYPE, title: DEFAULT_CARD_TITLE };
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
    this._syncPrewarmLease();
    this._ensureLiveModule();
    this.requestUpdate();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._syncOuterAppearance(this._previewConfig ?? this._config);
    window.addEventListener(
      EDITOR_PREVIEW_DRAFT_EVENT,
      this._handlePreviewDraft as EventListener,
    );
    this._syncPrewarmLease();
    this._ensureLiveModule();
  }

  public disconnectedCallback(): void {
    window.removeEventListener(
      EDITOR_PREVIEW_DRAFT_EVENT,
      this._handlePreviewDraft as EventListener,
    );
    this._releasePrewarmLease();
    super.disconnectedCallback();
  }

  protected updated(): void {
    if (this.renderRoot.querySelector(CAMERA_TAG)) {
      this._releasePrewarmLease();
    }
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
    const posterUrl = cameraImageUrl(this._hass, cameraEntity);
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
                  ? staticHtml`<${cameraTag}
                      class="camera-module"
                      .api=${this._haApi}
                      .available=${cameraAvailable}
                      .startUnmutedPcTablet=${
                        config.start_live_unmuted_pc_tablet === true
                      }
                      .startUnmutedPhone=${
                        config.start_live_unmuted_phone === true
                      }
                      .entityId=${cameraEntity}
                      .posterUrl=${posterUrl}
                      .roundedCorners=${config.camera_rounded_corners !== false}
                      .shadowStyle=${
                        config.camera_shadows === false ? "none" : "medium"
                      }
                    ></${cameraTag}>`
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
    this._syncOuterAppearance(this._previewConfig ?? this._config);
    this._syncPrewarmLease();
    this._ensureLiveModule();
    this.requestUpdate();
  };

  private _ensureLiveModule(): void {
    const config = this._previewConfig ?? this._config;
    if (!config.camera_entity || this._liveModuleReady) {
      return;
    }
    void loadCameraModule()
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

  private _syncPrewarmLease(): void {
    const config = this._previewConfig ?? this._config;
    const entityId = config.camera_entity;
    const available = Boolean(entityId && this._hass?.states[entityId]);
    if (!this.isConnected || !this._haApi || !entityId || !available) {
      this._releasePrewarmLease();
      return;
    }
    const key = this._sourceResolver.homeAssistantWebRtcKey(entityId);
    if (this._prewarmLease?.key === key || this._prewarmRequestKey === key) {
      return;
    }
    this._releasePrewarmLease();
    const generation = ++this._prewarmGeneration;
    this._prewarmRequestKey = key;
    const api = this._haApi;
    void this._sourceResolver
      .acquireHomeAssistantWebRtc(api, entityId)
      .then((lease) => {
        if (
          generation !== this._prewarmGeneration ||
          !this.isConnected ||
          this._haApi?.identity !== api.identity ||
          (this._previewConfig ?? this._config).camera_entity !== entityId
        ) {
          lease.release();
          return;
        }
        this._prewarmLease = lease;
      })
      .catch(() => undefined)
      .finally(() => {
        if (generation === this._prewarmGeneration) {
          this._prewarmRequestKey = undefined;
        }
      });
  }

  private _releasePrewarmLease(): void {
    this._prewarmGeneration += 1;
    this._prewarmRequestKey = undefined;
    this._prewarmLease?.release();
    this._prewarmLease = undefined;
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

  private readonly _retryLiveModule = (): void => {
    this._liveModuleError = undefined;
    this._ensureLiveModule();
    this.requestUpdate();
  };

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
