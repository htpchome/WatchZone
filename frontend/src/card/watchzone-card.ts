import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

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
  CAMERA_TAG,
  RECORDED_VIDEO_VIEWER_TAG,
  RECORDED_MEDIA_OPEN_EVENT,
  TOAST_REGION_TAG,
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
import type {
  RecordedMediaInitialSize,
  RecordedMediaRequest,
} from "../core/recorded-media";
import { CardHostAppearanceController } from "../styles/card-host-appearance.controller";
import { themeTokens } from "../styles/theme-tokens";
import { stageRuntimeStyles } from "../stage/layout-runtime.styles";
import { roundButtonStyles } from "../ui/overlay-control.styles";
import { ToastManager } from "../ui/toast-manager";
import "../ui/toast-region";
import { createBuiltInStageSet } from "../stage/built-in-stages/catalog";
import { LayoutRuntime } from "../stage/layout-runtime";
import { cardStyles } from "./watchzone-card.styles";

const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);
const recordedVideoViewerTag = unsafeStatic(RECORDED_VIDEO_VIEWER_TAG);

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
  private _recordedVideoViewerReady = false;
  private _recordedVideoViewerLoad?: Promise<void>;
  private _mediaRequest?: RecordedMediaRequest;
  private _mediaInitialSize?: RecordedMediaInitialSize;
  private readonly _cameraImageCredentials =
    new HomeAssistantCameraImageCredentialGuard();
  private readonly _localization = new LocalizationController(this, () =>
    this._syncRuntime(),
  );
  private readonly _toasts = new ToastManager(this);
  private readonly _layoutRuntime = new LayoutRuntime(
    this,
    undefined,
    undefined,
    (message, key) => this._toasts.error(message, { key }),
  );
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
    this.addEventListener(
      RECORDED_MEDIA_OPEN_EVENT,
      this._handleRecordedMediaOpen,
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
    this.removeEventListener(
      RECORDED_MEDIA_OPEN_EVENT,
      this._handleRecordedMediaOpen,
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
      config.outer_padding === false ? "no-outer-padding" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return staticHtml`
      <ha-card class=${cardClasses}>
        <div class="shell" role="region" aria-label=${config.title}>
          ${this._layoutRuntime.render()}
          ${
            this._recordedVideoViewerReady && this._mediaRequest
              ? staticHtml`<${recordedVideoViewerTag}
                  .api=${this._haApi}
                  .localize=${this._localization.localize}
                  .initialSize=${this._mediaInitialSize}
                  .request=${this._mediaRequest}
                ></${recordedVideoViewerTag}>`
              : null
          }
          <${toastRegionTag}
            class="card-toast"
            mode="overlay"
            .notices=${this._toasts.notices}
          ></${toastRegionTag}>
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

  private readonly _handleRecordedMediaOpen = (
    event: CustomEvent<RecordedMediaRequest>,
  ): void => {
    event.stopPropagation();
    this._mediaRequest = event.detail;
    this._mediaInitialSize = this._activeCameraStageSize();
    if (this._recordedVideoViewerReady) {
      this.requestUpdate();
      return;
    }
    this._recordedVideoViewerLoad ??=
      import("../ui/recorded-video-viewer/index")
        .then(() => {
          if (!this.isConnected) return;
          this._recordedVideoViewerReady = true;
          this.requestUpdate();
        })
        .catch(() => {
          this._recordedVideoViewerLoad = undefined;
          this._toasts.error(
            this._localization.localize("media_player.load_failed"),
            { key: "recorded-video-viewer-load-failed" },
          );
        });
  };

  private _activeCameraStageSize(): RecordedMediaInitialSize | undefined {
    const camera = this.renderRoot.querySelector<
      HTMLElement & { getActiveStageRect?(): DOMRectReadOnly | undefined }
    >(CAMERA_TAG);
    const rect = camera?.getActiveStageRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return undefined;
    return { height: rect.height, width: rect.width };
  }

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

  static styles = [
    themeTokens,
    roundButtonStyles,
    stageRuntimeStyles,
    cardStyles,
  ];
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
