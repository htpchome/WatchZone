import { LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  activeCardHeightMode,
  cardConfigSignature,
  normalizeCardConfig,
  type CardConfig,
} from "../core/config";
import { activeDeviceAppearanceConfig } from "./device-appearance";
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
import { roundButtonStyles } from "../ui/overlay-control.styles";
import { ToastManager } from "../ui/toast-manager";
import "../ui/toast-region";
import { createBuiltInStageSet } from "../stage/built-in-stages/catalog";
import { PHONE_STAGE_MAX_INLINE_SIZE } from "../stage/layout";
import { LayoutRuntime } from "../stage/layout-runtime";
import { cardStyles } from "./watchzone-card.styles";
import {
  createCardPickerStubConfig,
  isHomeAssistantCardPickerPreview,
  type CardPickerStubConfig,
} from "./home-assistant-card-picker";
import { HomeAssistantLayoutBridge } from "./home-assistant-layout-bridge";
import { ViewportFitController } from "./viewport-fit.controller";

const USE_MOBILE_HEIGHT_MODE =
  CLIENT_PROFILE.isPhone ||
  (CLIENT_PROFILE.isCompanionApp && CLIENT_PROFILE.isTablet);
const USE_COMPANION_PHONE_LANDSCAPE =
  CLIENT_PROFILE.isCompanionApp && CLIENT_PROFILE.isPhone;

const stageInlineSize = (inlineSize: number, landscape = false): number =>
  CLIENT_PROFILE.isPhone && (!CLIENT_PROFILE.isCompanionApp || !landscape)
    ? Math.min(inlineSize, PHONE_STAGE_MAX_INLINE_SIZE)
    : inlineSize;

const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);
const recordedVideoViewerTag = unsafeStatic(RECORDED_VIDEO_VIEWER_TAG);
const cardPickerPreviewTag = unsafeStatic(CARD_PICKER_PREVIEW_TAG);
const exportNameDialogTag = unsafeStatic(EXPORT_NAME_DIALOG_TAG);

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
  private _haApi?: HomeAssistantApi;
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
  private readonly _cardHostAppearance = new CardHostAppearanceController(this);
  private readonly _haLayout = new HomeAssistantLayoutBridge(this);
  private readonly _viewportFit = new ViewportFitController(this);
  private _stageResizeFrame?: number;
  private _stageSizeBoundary?: HTMLElement;
  private readonly _stageResizeObserver =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(([entry]) => {
          if (!entry) return;
          if (this._stageResizeFrame !== undefined) {
            cancelAnimationFrame(this._stageResizeFrame);
          }
          const contentBox = Array.isArray(entry.contentBoxSize)
            ? entry.contentBoxSize[0]
            : entry.contentBoxSize;
          const inlineSize = contentBox?.inlineSize ?? entry.contentRect.width;
          this._stageResizeFrame = requestAnimationFrame(() => {
            this._stageResizeFrame = undefined;
            this._layoutRuntime.setInlineSize(
              stageInlineSize(
                inlineSize,
                this.classList.contains("companion-phone-landscape"),
              ),
            );
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
    this._themeProfile.setHomeAssistant(value);
    this._localization.setLanguage(value.locale?.language ?? value.language);
    if (this._cardPickerPreview) {
      this.requestUpdate();
      return;
    }
    if (transportChanged || !this._haApi) {
      this._haApi = createHomeAssistantApi(value);
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
    await import("../editor/watchzone-card-editor");
    return document.createElement(EDITOR_TAG);
  }

  public setConfig(value: unknown): void {
    const next = normalizeCardConfig(value);
    if (cardConfigSignature(next) === cardConfigSignature(this._config)) {
      this._cardHostAppearance.configure(
        activeDeviceAppearanceConfig(next, CLIENT_PROFILE.isPhone),
      );
      this._syncEdgeToEdge(next);
      this._syncHeightMode(next);
      return;
    }
    this._config = next;
    this._previewConfig = undefined;
    this._cardHostAppearance.configure(
      activeDeviceAppearanceConfig(next, CLIENT_PROFILE.isPhone),
    );
    this._syncEdgeToEdge(next);
    this._syncHeightMode(next);
    if (this.isConnected && !this._cardPickerPreview) this._syncLayout(next);
    this.requestUpdate();
  }

  public connectedCallback(): void {
    this._cardPickerPreview = isHomeAssistantCardPickerPreview(this);
    this.classList.toggle("card-picker-preview-host", this._cardPickerPreview);
    super.connectedCallback();
    if (this._cardPickerPreview) {
      this._cardPickerPreviewLoad ??= import("./card-picker-preview").then(
        () => undefined,
      );
      this.requestUpdate();
      return;
    }
    this._cardHostAppearance.configure(
      activeDeviceAppearanceConfig(
        this._previewConfig ?? this._config,
        CLIENT_PROFILE.isPhone,
      ),
    );
    this._syncEdgeToEdge(this._previewConfig ?? this._config);
    this._syncHeightMode(this._previewConfig ?? this._config);
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
    this._layoutRuntime.setInlineSize(
      stageInlineSize(this.getBoundingClientRect().width),
    );
    this._observeStageSizeBoundary();
  }

  public disconnectedCallback(): void {
    this._stageResizeObserver?.disconnect();
    this._stageSizeBoundary = undefined;
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
    this._haLayout.release();
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    if (this._cardPickerPreview) return;
    this._observeStageSizeBoundary();
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
            this._recordedVideoViewerReady && this._mediaRequest
              ? staticHtml`<${recordedVideoViewerTag}
                  .api=${this._haApi}
                  .localize=${this._localization.localize}
                  .initialSize=${this._mediaInitialSize}
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
          <${toastRegionTag}
            class="card-toast"
            mode="overlay"
            .notices=${this._toasts.notices}
          ></${toastRegionTag}>
        </div>
      </ha-card>
    `;
  }

  private _observeStageSizeBoundary(): void {
    const boundary =
      this.renderRoot.querySelector<HTMLElement>(".shell") ?? undefined;
    if (!boundary || boundary === this._stageSizeBoundary) return;
    this._stageResizeObserver?.disconnect();
    this._stageSizeBoundary = boundary;
    this._stageResizeObserver?.observe(boundary);
    this._layoutRuntime.setInlineSize(
      stageInlineSize(
        boundary.getBoundingClientRect().width,
        this.classList.contains("companion-phone-landscape"),
      ),
    );
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
    this._syncEdgeToEdge(config);
    this._syncHeightMode(config);
    this._syncLayout(config);
    this.requestUpdate();
  };

  private _syncEdgeToEdge(config: CardConfig): void {
    const enabled = config.edge_to_edge_phone && CLIENT_PROFILE.isPhone;
    const companionFitViewport =
      enabled &&
      CLIENT_PROFILE.isCompanionApp &&
      activeCardHeightMode(config, USE_MOBILE_HEIGHT_MODE) === "fit_viewport";
    this.classList.toggle("mobile-edge-to-edge", enabled);
    this.classList.toggle(
      "companion-edge-to-edge-fit-viewport",
      companionFitViewport,
    );
    this._haLayout.configure(enabled);
  }

  private _syncHeightMode(config: CardConfig): void {
    const mode = activeCardHeightMode(config, USE_MOBILE_HEIGHT_MODE);
    const fitViewport = mode === "fit_viewport";
    const browserEdgeToEdge =
      fitViewport &&
      config.edge_to_edge_phone &&
      CLIENT_PROFILE.isPhone &&
      CLIENT_PROFILE.application === "browser";
    this._viewportFit.configure(fitViewport, browserEdgeToEdge);
    for (const value of ["auto", "fit-viewport", "fill-container"]) {
      this.classList.toggle(
        `height-mode-${value}`,
        value === mode.replaceAll("_", "-"),
      );
    }
  }

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
    void import("./companion-phone-landscape.controller")
      .then(({ installCompanionPhoneLandscape }) =>
        installCompanionPhoneLandscape(
          this,
          () => {
            const config = this._previewConfig ?? this._config;
            return config.stage_type === "full"
              ? config.companion_rotate_action
              : "none";
          },
          (active) => {
            if (active) {
              for (const camera of this.renderRoot.querySelectorAll<
                HTMLElement & { resetStageSize?: () => void }
              >(CAMERA_TAG)) {
                camera.resetStageSize?.();
              }
            }
            this._layoutRuntime.setInlineSize(
              active
                ? PHONE_STAGE_MAX_INLINE_SIZE + 1
                : PHONE_STAGE_MAX_INLINE_SIZE,
            );
          },
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
