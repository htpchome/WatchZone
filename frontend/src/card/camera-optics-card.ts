import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  activeRecordedMediaPlayerType,
  cardConfigSignature,
  normalizeCardConfig,
  type CardConfig,
} from "../core/config";
import {
  activeDeviceAppearanceConfig,
  CardLayoutController,
} from "../features/card-layout";
import { CLIENT_PROFILE } from "../core/client-profile";
import {
  APP_NAME,
  APP_VERSION,
  CARD_PICKER_PREVIEW_TAG,
  CARD_TAG,
  EDITOR_PREVIEW_DRAFT_EVENT,
  EDITOR_TAG,
  EXPORT_NAME_CLOSE_EVENT,
  EXPORT_NAME_CONFIRM_EVENT,
  EXPORT_NAME_DIALOG_TAG,
  CAMERA_TAG,
  RECORDED_VIDEO_VIEWER_TAG,
  RECORDED_VIDEO_CLOSE_EVENT,
  RECORDED_MEDIA_OPEN_EVENT,
  RECORDED_MEDIA_EXPORT_EVENT,
  RECORDED_MEDIA_NOTICE_EVENT,
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
  RecordedMediaExportIntent,
  RecordedMediaInitialGeometry,
  RecordedMediaNotice,
  RecordedMediaRequest,
} from "../core/recorded-media";
import { CardHostAppearanceController } from "../styles/card-host-appearance.controller";
import { themeTokens } from "../styles/theme-tokens";
import { ThemeProfileController } from "../core/theme-profile";
import { stageRuntimeStyles } from "../stage/layout-runtime.styles";
import { roundButtonStyles } from "../ui/controls/overlay-control.styles";
import { ToastManager } from "../ui/toast/manager";
import "../ui/toast/region";
import { createBuiltInStageSet } from "../stage/built-in-stages/catalog";
import { LayoutRuntime } from "../stage/layout-runtime";
import { cardStyles } from "./camera-optics-card.styles";
import {
  backendAvailability,
  type BackendAvailabilityIncident,
} from "./backend-availability";
import type { renderBackendRecovery } from "./backend-recovery";
import {
  createCardPickerStubConfig,
  isHomeAssistantCardPickerPreview,
  loadCardPickerPreview,
  type CardPickerStubConfig,
} from "../features/card-picker-preview";

const USE_COMPANION_PHONE_LANDSCAPE =
  CLIENT_PROFILE.isCompanionApp && CLIENT_PROFILE.isPhone;

const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);
const recordedVideoViewerTag = unsafeStatic(RECORDED_VIDEO_VIEWER_TAG);
const cardPickerPreviewTag = unsafeStatic(CARD_PICKER_PREVIEW_TAG);
const exportNameDialogTag = unsafeStatic(EXPORT_NAME_DIALOG_TAG);
let statusModule: Promise<typeof import("../api/status")> | undefined;

interface PreviewDraftDetail {
  readonly baselineSignature: string;
  readonly config: CardConfig | null;
}

interface PendingRecordedExport {
  readonly draft: { readonly name: string };
  readonly intent: RecordedMediaExportIntent;
}

export class DashboardCard extends LitElement {
  public static readonly appVersion = APP_VERSION;

  private _config: CardConfig = normalizeCardConfig({});
  private _hass?: HomeAssistant;
  private _rawHaApi?: HomeAssistantApi;
  private _haApi?: HomeAssistantApi;
  private _backendAvailabilityUnsubscribe?: () => void;
  private _backendIncident?: BackendAvailabilityIncident;
  private _backendRecoveryRenderer?: typeof renderBackendRecovery;
  private _backendRecoveryLoad?: Promise<void>;
  private _previewConfig?: CardConfig;
  private _observedConnection?: HomeAssistantConnection;
  private _transportConnected = true;
  private _recordedVideoViewerReady = false;
  private _recordedVideoViewerLoad?: Promise<void>;
  private _exportNameDialogReady = false;
  private _pendingRecordedExport?: PendingRecordedExport;
  private _mediaRequest?: RecordedMediaRequest;
  private _mediaInitialSize?: RecordedMediaInitialGeometry;
  private _cardPickerPreview = false;
  private _cardPickerPreviewLoad?: Promise<void>;
  private readonly _cameraImageCredentials =
    new HomeAssistantCameraImageCredentialGuard();
  private readonly _localization = new LocalizationController(this, () =>
    this._syncRuntime(),
  );
  private readonly _toasts = new ToastManager(this);
  private readonly _themeProfile = new ThemeProfileController(this);
  private readonly _layoutRuntime = new LayoutRuntime(
    this,
    undefined,
    undefined,
    (message, key) => this._toasts.error(message, { key }),
  );
  private readonly _cardLayout = new CardLayoutController(this, (inlineSize) =>
    this._layoutRuntime.setInlineSize(inlineSize),
  );
  private readonly _cardHostAppearance = new CardHostAppearanceController(this);

  /** Set by Home Assistant for the card shown inside its editor preview. */
  public preview = false;

  public set hass(value: unknown) {
    if (!isHomeAssistant(value)) {
      return;
    }
    const transportChanged = this._hass?.connection !== value.connection;
    this._hass = value;
    this._themeProfile.setHomeAssistant(value);
    this._localization.setLanguage(value.locale?.language ?? value.language);
    if (this._cardPickerPreview) {
      this.requestUpdate();
      return;
    }
    if (transportChanged || !this._haApi) {
      this._setHomeAssistantApi(createHomeAssistantApi(value));
    }
    this._transportConnected = value.connection.connected !== false;
    this._observeConnection(value.connection);
    this._syncRuntime();
    if (transportChanged) this.requestUpdate();
  }

  public static getStubConfig(hass?: unknown): CardPickerStubConfig {
    return createCardPickerStubConfig(hass);
  }

  public static async getConfigElement(): Promise<HTMLElement> {
    await import("../editor/camera-optics-card-editor");
    return document.createElement(EDITOR_TAG);
  }

  public setConfig(value: unknown): void {
    const next = normalizeCardConfig(value);
    if (cardConfigSignature(next) === cardConfigSignature(this._config)) {
      this._cardHostAppearance.configure(
        activeDeviceAppearanceConfig(next, CLIENT_PROFILE.isPhone),
      );
      this._cardLayout.configure(next);
      return;
    }
    this._config = next;
    this._previewConfig = undefined;
    this._cardHostAppearance.configure(
      activeDeviceAppearanceConfig(next, CLIENT_PROFILE.isPhone),
    );
    this._cardLayout.configure(next);
    if (this.isConnected && !this._cardPickerPreview) {
      this._syncLayout(next);
    }
    this._syncRuntime();
    this.requestUpdate();
  }

  public connectedCallback(): void {
    this._cardPickerPreview = isHomeAssistantCardPickerPreview(this);
    this.classList.toggle("card-picker-preview-host", this._cardPickerPreview);
    super.connectedCallback();
    if (this._cardPickerPreview) {
      this._cardPickerPreviewLoad ??= loadCardPickerPreview();
      this.requestUpdate();
      return;
    }
    this._cardHostAppearance.configure(
      activeDeviceAppearanceConfig(
        this._previewConfig ?? this._config,
        CLIENT_PROFILE.isPhone,
      ),
    );
    this._cardLayout.configure(this._previewConfig ?? this._config);
    if (this._rawHaApi && !this._backendAvailabilityUnsubscribe) {
      this._setHomeAssistantApi(this._rawHaApi);
    }
    window.addEventListener(
      EDITOR_PREVIEW_DRAFT_EVENT,
      this._handlePreviewDraft as EventListener,
    );
    this.addEventListener(
      RECORDED_MEDIA_OPEN_EVENT,
      this._handleRecordedMediaOpen,
    );
    this.addEventListener(
      RECORDED_MEDIA_EXPORT_EVENT,
      this._handleRecordedMediaExport,
    );
    this.addEventListener(EXPORT_NAME_CLOSE_EVENT, this._closeRecordedExport);
    this.addEventListener(
      EXPORT_NAME_CONFIRM_EVENT,
      this._confirmRecordedExport,
    );
    this.addEventListener(
      RECORDED_VIDEO_CLOSE_EVENT,
      this._handleRecordedMediaClose,
    );
    this._syncLayout(this._previewConfig ?? this._config);
    this._loadCompanionPhoneLandscape();
    if (this._hass) this._observeConnection(this._hass.connection);
    this._syncRuntime();
  }

  public disconnectedCallback(): void {
    window.removeEventListener(
      EDITOR_PREVIEW_DRAFT_EVENT,
      this._handlePreviewDraft as EventListener,
    );
    this.removeEventListener(
      RECORDED_MEDIA_OPEN_EVENT,
      this._handleRecordedMediaOpen,
    );
    this.removeEventListener(
      RECORDED_MEDIA_EXPORT_EVENT,
      this._handleRecordedMediaExport,
    );
    this.removeEventListener(
      EXPORT_NAME_CLOSE_EVENT,
      this._closeRecordedExport,
    );
    this.removeEventListener(
      EXPORT_NAME_CONFIRM_EVENT,
      this._confirmRecordedExport,
    );
    this.removeEventListener(
      RECORDED_VIDEO_CLOSE_EVENT,
      this._handleRecordedMediaClose,
    );
    this._unobserveConnection();
    this._backendAvailabilityUnsubscribe?.();
    this._backendAvailabilityUnsubscribe = undefined;
    this._syncRuntime();
    super.disconnectedCallback();
  }

  public getCardSize(): number {
    return this._cardPickerPreview ? 7 : 5;
  }

  public getGridOptions() {
    return {
      columns: "full",
      min_columns: 3,
      rows: "auto",
    };
  }

  protected render() {
    if (this._cardPickerPreview) {
      return staticHtml`<ha-card class="card-picker-preview-shell">
        <${cardPickerPreviewTag}
          .localize=${this._localization.localize}
        ></${cardPickerPreviewTag}>
      </ha-card>`;
    }
    const config = activeDeviceAppearanceConfig(
      this._previewConfig ?? this._config,
      CLIENT_PROFILE.isPhone,
    );
    const minimal = config.stage_type === "minimal_camera_only";
    const cardClasses = [
      !minimal && config.rounded_outer_corners === false
        ? "square-outer-corners"
        : "",
      !minimal && config.outer_shadows === false ? "no-outer-shadow" : "",
      minimal || config.outer_padding === false ? "no-outer-padding" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return staticHtml`
      <ha-card class=${cardClasses}>
        <div class="shell" role="region" aria-label=${config.title}>
          ${this._layoutRuntime.render()}
          ${
            this._backendIncident
              ? (this._backendRecoveryRenderer?.(
                  this._backendIncident,
                  this._localization.localize,
                  this._openIntegrations,
                  this._retryBackend,
                ) ?? this._renderBackendRecoveryFallback(this._backendIncident))
              : null
          }
          ${
            this._recordedVideoViewerReady && this._mediaRequest
              ? staticHtml`<${recordedVideoViewerTag}
                  .api=${this._haApi}
                  .localize=${this._localization.localize}
                  .initialSize=${this._mediaInitialSize}
                  .playerType=${activeRecordedMediaPlayerType(
                    config,
                    CLIENT_PROFILE.isPhone,
                  )}
                  .request=${this._mediaRequest}
                ></${recordedVideoViewerTag}>`
              : null
          }
          ${
            this._exportNameDialogReady
              ? staticHtml`<${exportNameDialogTag}
                  variant="segment"
                  .draft=${this._pendingRecordedExport?.draft}
                  .localize=${this._localization.localize}
                ></${exportNameDialogTag}>`
              : null
          }
          ${staticHtml`<${toastRegionTag}
              class="card-toast"
              mode="overlay"
              .notices=${this._toasts.notices}
            ></${toastRegionTag}>`}
        </div>
      </ha-card>
    `;
  }

  private _renderBackendRecoveryFallback(
    incident: BackendAvailabilityIncident,
  ) {
    const setup = incident.kind === "setup_required";
    return staticHtml`<section
      class="backend-recovery"
      role="alert"
      aria-live="assertive"
    >
      <div class="backend-recovery-content">
        <h2>
          ${this._localization.localize(
            setup ? "recovery.setup_title" : "recovery.start_failed_title",
          )}
        </h2>
        <p>
          ${this._localization.localize(
            setup
              ? "recovery.setup_introduction"
              : "recovery.load_failed_introduction",
          )}
        </p>
      </div>
    </section>`;
  }

  private _loadBackendRecovery(): void {
    if (this._backendRecoveryRenderer) return;
    this._backendRecoveryLoad ??= import("./backend-recovery")
      .then(({ renderBackendRecovery: renderer }) => {
        this._backendRecoveryRenderer = renderer;
        if (this.isConnected) this.requestUpdate();
      })
      .catch(() => {
        this._backendRecoveryLoad = undefined;
      });
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
    this._cardHostAppearance.configure(
      activeDeviceAppearanceConfig(config, CLIENT_PROFILE.isPhone),
    );
    this._cardLayout.configure(config);
    this._syncLayout(config);
    this._syncRuntime();
    this.requestUpdate();
  };

  private readonly _handleRecordedMediaOpen = (
    event: CustomEvent<RecordedMediaRequest>,
  ): void => {
    event.stopPropagation();
    this._openRecordedMedia(event.detail);
  };

  private readonly _handleRecordedMediaClose = (): void => {
    this._mediaRequest = undefined;
    this._mediaInitialSize = undefined;
    this.requestUpdate();
  };

  private readonly _handleRecordedMediaExport = async (
    event: CustomEvent<RecordedMediaExportIntent>,
  ): Promise<void> => {
    event.stopPropagation();
    const intent = event.detail;
    try {
      await import("../features/exports");
      if (!this.isConnected) return;
      this._exportNameDialogReady = true;
      this._pendingRecordedExport = { draft: { name: intent.name }, intent };
      this.requestUpdate();
    } catch {
      this._showRecordedMediaNotice({
        message: this._localization.localize(
          "recording_segments.export_failed",
        ),
        severity: "error",
      });
    }
  };

  private readonly _closeRecordedExport = (event: Event): void => {
    if (!this._pendingRecordedExport) return;
    event.stopPropagation();
    this._pendingRecordedExport = undefined;
    this.requestUpdate();
  };

  private readonly _confirmRecordedExport = async (
    event: CustomEvent<{ readonly name: string }>,
  ): Promise<void> => {
    const pending = this._pendingRecordedExport;
    if (!pending) return;
    event.stopPropagation();
    this._pendingRecordedExport = undefined;
    this.requestUpdate();
    const api = this._haApi;
    if (!api) {
      this._showRecordedMediaNotice({
        message: this._localization.localize(
          "recording_segments.export_failed",
        ),
        severity: "error",
      });
      return;
    }
    const intent = pending.intent;
    try {
      const { startExportJob } = await import("../features/exports");
      startExportJob(api, {
        camera: intent.camera,
        name: event.detail.name,
        range: {
          end_time: intent.endTime,
          entity_id: intent.entityId,
          start_time: intent.startTime,
        },
        sourceId: intent.sourceId,
      });
      this._showRecordedMediaNotice({
        message: this._localization.localize(
          "recording_segments.export_started",
        ),
        severity: "success",
      });
    } catch {
      this._showRecordedMediaNotice({
        message: this._localization.localize(
          "recording_segments.export_failed",
        ),
        severity: "error",
      });
    }
  };

  private _showRecordedMediaNotice(notice: RecordedMediaNotice): void {
    const viewer = this.renderRoot.querySelector(RECORDED_VIDEO_VIEWER_TAG);
    if (viewer) {
      viewer.dispatchEvent(
        new CustomEvent<RecordedMediaNotice>(RECORDED_MEDIA_NOTICE_EVENT, {
          detail: notice,
        }),
      );
      return;
    }
    this._toasts[notice.severity](notice.message, {
      key: "recording-segment-export",
    });
  }

  private _openRecordedMedia(request: RecordedMediaRequest): void {
    this._mediaRequest = request;
    this._mediaInitialSize = this._activeCameraStageSize();
    if (this._recordedVideoViewerReady) {
      this.requestUpdate();
      return;
    }
    this._recordedVideoViewerLoad ??= import("../features/media-viewer")
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
  }

  private _activeCameraStageSize(): RecordedMediaInitialGeometry | undefined {
    const camera = this.renderRoot.querySelector<
      HTMLElement & { getActiveStageRect?(): DOMRectReadOnly | undefined }
    >(CAMERA_TAG);
    const rect = camera?.getActiveStageRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return undefined;
    return {
      height: rect.height,
      width: rect.width,
    };
  }

  private _syncLayout(config: CardConfig): void {
    this._layoutRuntime.setFlowProfile(
      CLIENT_PROFILE.isPhone ? "phone" : "default",
    );
    const { designs, flow } = createBuiltInStageSet(
      activeDeviceAppearanceConfig(config, CLIENT_PROFILE.isPhone),
    );
    this._layoutRuntime.setStageSet(designs, flow);
    this._syncRuntime();
  }

  private _loadCompanionPhoneLandscape(): void {
    if (!USE_COMPANION_PHONE_LANDSCAPE) return;
    void import("../features/companion-landscape")
      .then(({ installCompanionPhoneLandscape }) =>
        installCompanionPhoneLandscape(
          this,
          () => {
            const config = this._previewConfig ?? this._config;
            return config.stage_type === "full"
              ? config.companion_rotate_action
              : "none";
          },
          (active) => this._cardLayout.setCompanionLandscape(active),
          this._localization.localize,
        ),
      )
      .catch(console.error);
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

  private _setHomeAssistantApi(api: HomeAssistantApi): void {
    this._backendAvailabilityUnsubscribe?.();
    this._rawHaApi = api;
    this._haApi = backendAvailability.guard(api);
    this._backendAvailabilityUnsubscribe = backendAvailability.subscribe(
      api,
      (incident) => {
        this._backendIncident = incident;
        if (incident) {
          this._loadBackendRecovery();
        }
        this._syncRuntime();
        this.requestUpdate();
      },
    );
  }

  private readonly _openIntegrations = (): void => {
    if (!this._hass) return;
    window.location.assign(this._hass.hassUrl("/config/integrations"));
  };

  private readonly _retryBackend = (): void => {
    if (!this._rawHaApi || this._backendIncident?.checking) return;
    void backendAvailability.retry(this._rawHaApi);
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
    const frigate = (this._previewConfig ?? this._config).cameras.find(
      (camera) => camera.connection === "frigate_go2rtc",
    )?.entity_id;
    if (frigate) statusModule ??= import("../api/status");
    void statusModule?.then(({ sync }) =>
      sync(
        this,
        this.isConnected && this._haApi,
        frigate,
        this._toasts,
        this._localization.localize,
      ),
    );
    const hass = this._hass
      ? this._cameraImageCredentials.sanitize(
          this._hass,
          this._cameraEntityIds(),
        )
      : undefined;
    this._layoutRuntime.setRuntime(
      hass,
      this._haApi,
      this._localization.localize,
      this.preview,
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
