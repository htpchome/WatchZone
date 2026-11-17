import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  cardConfigSignature,
  createDefaultCameraConfig,
  hasExplicitConfigKey,
  normalizeCameraTitle,
  normalizeCardConfig,
  normalizeCardTitle,
  sanitizeCameraTitleInput,
  sanitizeCardTitleInput,
  type AdditionalCameraLayout,
  type AlertTakeoverMode,
  type CameraConfig,
  type CardConfig,
  type FrigateFallbackTransport,
  type LiveConnectionType,
  type MinimalCameraMenuPosition,
  type PtzOverlayControl,
  type SlideAdvanceSeconds,
  type SlideTransition,
} from "../core/config";
import {
  cameraPresentationItems,
  nextCameraGroupTitle,
} from "../core/camera-groups";
import {
  ACCORDION_ITEM_TAG,
  ACCORDION_TAG,
  ACCORDION_TOGGLE_EVENT,
  CARD_TYPE,
  EDITOR_PREVIEW_DRAFT_EVENT,
  EDITOR_TAG,
  EDITOR_TEXT_PREVIEW_DELAY_MS,
  MAX_CAMERA_TITLE_LENGTH,
  MAX_CAMERAS,
  MAX_EVENT_HISTORY_DAYS,
  MAX_LIGHTS_PER_CAMERA,
  MIN_EVENT_HISTORY_DAYS,
  SORTABLE_REORDER_EVENT,
  TOAST_REGION_TAG,
} from "../core/constants";
import {
  createHomeAssistantApi,
  isHomeAssistant,
  type HomeAssistant,
} from "../core/home-assistant";
import { LocalizationController } from "../core/localization";
import { ThemeProfileController } from "../core/theme-profile";
import { toYamlCardConfig, type YamlCardConfig } from "../core/yaml-config";
import { defaultStageFlow } from "../core/stage";
import { themeTokens } from "../styles/theme-tokens";
import { ToastManager } from "../ui/toast-manager";
import { iconPath, renderIcon } from "../ui/icons";
import type {
  SegmentedControlOption,
  SegmentedControlValueDetail,
} from "../ui/segmented-control";
import type { SortableReorderDetail } from "../ui/sortable-list";
import type { AccordionItem, AccordionToggleDetail } from "../ui/accordion";
import "../ui/accordion";
import "../ui/segmented-control";
import "../ui/toast-region";
import {
  type DirtyStateContext,
  requestDirtyStateContext,
  seedDirtyState,
  updateDirtyState,
} from "./dirty-state";
import { HomeAssistantEditorBridge } from "./home-assistant-editor-bridge";
import type { CameraCapabilityController } from "./camera-capability.controller";
import { renderCameraSettings } from "./camera-settings-section";
import {
  renderInteractionSettings,
  type OptionalInteractionName,
} from "./interaction-settings-section";
import {
  renderDisplaySettings,
  renderGeneralSettings,
  renderLayoutSettings,
  renderLiveMediaPlayerSettings,
  renderMinimalCameraSettings,
  renderReviewSettings,
} from "./settings-sections";
import { renderStageManagement } from "./stage-management-section";
import { cardEditorStyles } from "./watchzone-card-editor.styles";

interface InputElement extends HTMLElement {
  value: string;
}

interface PreviewDraftDetail {
  readonly baselineSignature: string;
  readonly config: CardConfig | null;
}

interface ValueChangedEvent extends Event {
  readonly detail: { readonly key?: string; readonly value?: unknown };
}

interface SelectorElement extends HTMLElement {
  hass?: HomeAssistant;
}

interface LocalizingHomeAssistant extends HomeAssistant {
  localize(key: string, ...args: unknown[]): string;
}

type EditorSectionKey =
  | "camera"
  | "display"
  | "general"
  | "interactions"
  | "layout"
  | "live-media-player"
  | "minimal-camera-configuration"
  | "recorded-media-player"
  | "reviews"
  | "stage-management";

const CAMERA_SELECTOR = {
  entity: { filter: { domain: "camera" } },
} as const;
const LIGHT_SELECTOR = {
  entity: { filter: { domain: "light" } },
} as const;
const ICON_SELECTOR = { icon: {} } as const;
const BOOLEAN_SELECTOR = { boolean: {} } as const;
const OPEN_LIVE_VIEW_LOCALIZATION_KEY =
  "ui.panel.lovelace.editor.action-editor.actions.open-live-view";
const DEFAULT_LIGHT_ICON = "mdi:lightbulb";

const accordionTag = unsafeStatic(ACCORDION_TAG);
const accordionItemTag = unsafeStatic(ACCORDION_ITEM_TAG);
const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);
const EDITOR_STATUS_KEY = "draft";

void import("../ui/sortable-list");
void import("./general-settings-info");

type CameraBooleanConfigFlag = Exclude<
  keyof CameraConfig,
  | "additional_camera"
  | "connection"
  | "entity_id"
  | "frigate_fallback"
  | "group_name"
  | "lights"
  | "title"
>;

export class CardEditor extends LitElement {
  private readonly _haEditor = new HomeAssistantEditorBridge<YamlCardConfig>(
    this,
    (config) =>
      typeof config === "object" &&
      config !== null &&
      "type" in config &&
      config.type === CARD_TYPE,
  );
  private _baseline?: CardConfig;
  private _baselineSignature = "";
  private _config?: CardConfig;
  private _configSignature = "";
  private _cameraBaseline?: CameraConfig;
  private _cameraDraft?: CameraConfig;
  private _secondaryCameraBaseline?: CameraConfig;
  private _secondaryCameraDraft?: CameraConfig;
  private _secondaryCameraTitleInput = "";
  private _cameraGroupNameInput = "";
  private _cameraTitleInput = "";
  private _openSection?: EditorSectionKey;
  private _sectionKeys = new Map<string, EditorSectionKey>();
  private _pendingSections = new Set<EditorSectionKey>();
  private _addingLight = false;
  private _pendingLightEntityId = "";
  private _pendingLightIcon = DEFAULT_LIGHT_ICON;
  private _pendingRemoveCameraIndex?: number;
  private _editingCameraIndex?: number;
  private _cameraDialogInitialOpen = "camera";
  private _dirtyContext?: DirtyStateContext<YamlCardConfig>;
  private _dirtySeeded = false;
  private _hass?: HomeAssistant;
  private _interactionHass?: HomeAssistant;
  private _interactionHassSource?: HomeAssistant;
  private _visibleOptionalInteractions = new Set<OptionalInteractionName>();
  private _baselineOptionalInteractions = new Set<OptionalInteractionName>();
  private _choosingOptionalInteraction = false;
  private _previewTimer?: ReturnType<typeof setTimeout>;
  private _lastDispatchedConfigSignature = "";
  private _draftStatusChanged?: boolean;
  private readonly _toasts = new ToastManager(this);
  private _capabilities?: CameraCapabilityController;
  private _capabilitiesLoad?: Promise<CameraCapabilityController>;
  private readonly _localization = new LocalizationController(this, () => {
    this._draftStatusChanged = undefined;
    this._syncDraftStatus();
  });
  private readonly _themeProfile = new ThemeProfileController(this);

  public set hass(value: unknown) {
    if (!isHomeAssistant(value)) {
      return;
    }
    const firstAssignment = !this._hass;
    this._hass = value;
    this._themeProfile.setHomeAssistant(value);
    this._localization.setLanguage(value.locale?.language ?? value.language);
    const selectors = this.renderRoot?.querySelectorAll("ha-selector") as
      NodeListOf<SelectorElement> | undefined;
    if (selectors?.length) {
      for (const selector of selectors) {
        selector.hass = value;
      }
    } else if (firstAssignment) {
      this.requestUpdate();
    }
  }

  public setConfig(value: unknown): void {
    const config = normalizeCardConfig(value);
    if (!this._baseline) {
      const source = value as Record<string, unknown>;
      this._visibleOptionalInteractions = new Set(
        (["hold_action", "double_tap_action"] as const).filter((name) =>
          hasExplicitConfigKey(source, name),
        ),
      );
      this._baselineOptionalInteractions = new Set(
        this._visibleOptionalInteractions,
      );
    }
    const signature = cardConfigSignature(config);

    if (!this._baseline) {
      this._baseline = config;
      this._baselineSignature = signature;
      this._config = config;
      this._configSignature = signature;
      this._syncDraftStatus();
      this._seedDirtyState();
      this.requestUpdate();
      return;
    }

    if (signature === this._configSignature) return;

    this._config = config;
    this._configSignature = signature;
    this._syncDraftStatus();
    this.requestUpdate();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._syncDraftStatus();
    requestDirtyStateContext<YamlCardConfig>(this, (context) => {
      this._dirtyContext = context;
      this._seedDirtyState();
    });
    document.addEventListener("click", this._handleDocumentClick, true);
    this.addEventListener(
      SORTABLE_REORDER_EVENT,
      this._handleCameraReorder as EventListener,
    );
    this.addEventListener(
      ACCORDION_TOGGLE_EVENT,
      this._handleSectionToggle as EventListener,
    );
  }

  public disconnectedCallback(): void {
    document.removeEventListener("click", this._handleDocumentClick, true);
    this.removeEventListener(
      SORTABLE_REORDER_EVENT,
      this._handleCameraReorder as EventListener,
    );
    this.removeEventListener(
      ACCORDION_TOGGLE_EVENT,
      this._handleSectionToggle as EventListener,
    );
    this._dirtyContext = undefined;
    this._dirtySeeded = false;
    this._draftStatusChanged = undefined;
    if (this._previewTimer) {
      clearTimeout(this._previewTimer);
      this._previewTimer = undefined;
    }
    this._publishPreview(null);
    super.disconnectedCallback();
  }

  protected updated(): void {
    const cameraDialog = this.renderRoot.querySelector<HTMLDialogElement>(
      ".camera-editor-dialog",
    );
    if (cameraDialog) {
      if (this._cameraDraft && !cameraDialog.open) cameraDialog.showModal();
      else if (!this._cameraDraft && cameraDialog.open) cameraDialog.close();
    }
    const removeDialog = this.renderRoot.querySelector<HTMLDialogElement>(
      ".remove-camera-dialog",
    );
    if (removeDialog) {
      if (this._pendingRemoveCameraIndex !== undefined && !removeDialog.open) {
        removeDialog.showModal();
      } else if (
        this._pendingRemoveCameraIndex === undefined &&
        removeDialog.open
      ) {
        removeDialog.close();
      }
    }
    for (const item of this.renderRoot.querySelectorAll<AccordionItem>(
      "[data-s]>*",
    )) {
      item.toggleAttribute(
        "pending",
        this._pendingSections.has(item.itemKey as EditorSectionKey),
      );
    }
  }

  protected render() {
    const minimal = this._config?.stage_type === "minimal_camera_only";
    const commonSettings = {
      config: this._config,
      hass: this._hass,
      localize: this._localization.localize,
      onChange: this._handleConfigChange,
    };
    return staticHtml`
      <${toastRegionTag}
        class="editor-status"
        mode="inline"
        .notices=${this._toasts.notices}
      ></${toastRegionTag}>
      <${accordionTag} data-s>
        <${accordionItemTag}
          heading=${this._t("editor.camera_settings")}
          item-key="camera"
          .icon=${"camera"}
        >
          ${this._renderSection("camera", () =>
            renderCameraSettings({
              cameraDisplayName: (camera) => this._cameraDisplayName(camera),
              cameraName: (entityId) => this._cameraName(entityId),
              cameraSummary: (camera) => this._cameraSummary(camera),
              config: this._config,
              localize: this._localization.localize,
              onAddCamera: this._addCamera,
              onEditAdditionalCamera: this._editAdditionalCamera,
              onEditCamera: this._editCamera,
              onRequestRemoveCamera: this._requestRemoveCamera,
            }),
          )}
        </${accordionItemTag}>
        <${accordionItemTag}
          heading=${this._t("editor.stage_management")}
          item-key="stage-management"
          .icon=${"layout"}
        >
          ${this._renderSection("stage-management", () =>
            renderStageManagement({
              config: this._config,
              localize: this._localization.localize,
              onStageLayoutChange: this._handleStageLayoutChange,
              onStageTypeChange: this._handleStageTypeChange,
            }),
          )}
        </${accordionItemTag}>
        ${
          minimal
            ? staticHtml`<${accordionItemTag}
          heading=${this._t("editor.minimal_camera_configuration")}
          item-key="minimal-camera-configuration"
          .icon=${"camera"}
        >
          ${this._renderSection("minimal-camera-configuration", () =>
            renderMinimalCameraSettings({
              ...commonSettings,
              onMenuPositionChange: this._handleMinimalCameraMenuPositionChange,
            }),
          )}
        </${accordionItemTag}>`
            : null
        }
        ${
          minimal
            ? staticHtml`<${accordionItemTag}
          heading=${this._t("editor.interactions")}
          item-key="interactions"
          .icon=${"tune"}
        >
          ${this._renderSection("interactions", () =>
            renderInteractionSettings({
              choosingOptionalInteraction: this._choosingOptionalInteraction,
              config: this._config,
              hass: this._interactionActionHass(),
              localize: this._localization.localize,
              onActionsChange: this._handleActionsChange,
              onAddOptionalInteraction: this._addOptionalInteraction,
              onRemoveOptionalInteraction: this._removeOptionalInteraction,
              onToggleOptionalInteractionChoices:
                this._toggleOptionalInteractionChoices,
              visibleOptionalInteractions: this._visibleOptionalInteractions,
            }),
          )}
        </${accordionItemTag}>`
            : null
        }
        ${
          minimal
            ? null
            : staticHtml`<${accordionItemTag}
          heading=${this._t("editor.live_media_player")}
          item-key="live-media-player"
          .icon=${"play"}
        >
          ${this._renderSection("live-media-player", () =>
            renderLiveMediaPlayerSettings({
              ...commonSettings,
              onAlertTakeoverModeChange: this._handleAlertTakeoverModeChange,
              onPtzOverlayControlChange: this._handlePtzOverlayControlChange,
              onSlideAdvanceTimeChange: this._handleSlideAdvanceTimeChange,
              onSlideTransitionChange: this._handleSlideTransitionChange,
            }),
          )}
        </${accordionItemTag}>`
        }
        ${
          minimal
            ? null
            : staticHtml`<${accordionItemTag}
          heading=${this._t("editor.recorded_media_player")}
          item-key="recorded-media-player"
          .icon=${"events"}
        ></${accordionItemTag}>`
        }
        ${
          minimal
            ? null
            : staticHtml`<${accordionItemTag}
          heading=${this._t("editor.reviews")}
          item-key="reviews"
          .icon=${"reviews"}
        >
          ${this._renderSection("reviews", () =>
            renderReviewSettings({
              ...commonSettings,
              onEventHistoryDaysChange: this._handleEventHistoryDaysChange,
            }),
          )}
        </${accordionItemTag}>`
        }
        <${accordionItemTag}
          heading=${this._t("editor.general_settings")}
          item-key="general"
          .icon=${"settings"}
        >
          ${this._renderSection("general", () =>
            renderGeneralSettings({
              ...commonSettings,
              onTitleChange: this._handleTitleChange,
              onTitleInput: this._handleTitleInput,
            }),
          )}
        </${accordionItemTag}>
        ${
          minimal
            ? null
            : staticHtml`<${accordionItemTag}
          heading=${this._t("editor.layout_settings")}
          item-key="layout"
          .icon=${"layout"}
        >
          ${this._renderSection("layout", () =>
            renderLayoutSettings(commonSettings),
          )}
        </${accordionItemTag}>`
        }
        ${
          minimal
            ? null
            : staticHtml`<${accordionItemTag}
          heading=${this._t("editor.display_settings")}
          item-key="display"
          .icon=${"tune"}
        >
          ${this._renderSection("display", () =>
            renderDisplaySettings(commonSettings),
          )}
        </${accordionItemTag}>`
        }
      </${accordionTag}>
      ${this._renderCameraDialog()}
      ${this._renderRemoveCameraDialog()}
    `;
  }

  private _renderSection(
    key: EditorSectionKey,
    renderSection: () => unknown,
  ): unknown {
    return this._openSection === key ? renderSection() : nothing;
  }

  private readonly _handleSectionToggle = (
    event: CustomEvent<AccordionToggleDetail>,
  ): void => {
    const item = event.detail.item;
    if (!item.parentElement?.hasAttribute("data-s")) return;
    const key = item.itemKey as EditorSectionKey;
    const next = event.detail.open
      ? key
      : this._openSection === key
        ? undefined
        : this._openSection;
    if (next === this._openSection) return;
    this._openSection = next;
    this.requestUpdate();
  };

  private _interactionActionHass(): HomeAssistant | undefined {
    const source = this._hass;
    if (!source) return undefined;
    if (this._interactionHassSource === source) return this._interactionHass;
    this._interactionHassSource = source;
    const localizingSource = source as LocalizingHomeAssistant;
    if (typeof localizingSource.localize !== "function") {
      this._interactionHass = source;
      return source;
    }
    this._interactionHass = new Proxy(source, {
      get: (target, property, receiver) => {
        if (property !== "localize")
          return Reflect.get(target, property, receiver);
        return (key: string, ...args: unknown[]): string =>
          key === OPEN_LIVE_VIEW_LOCALIZATION_KEY
            ? this._t("editor.open_live_view")
            : localizingSource.localize(key, ...args);
      },
    });
    return this._interactionHass;
  }

  private _renderCameraDialog() {
    const camera = this._cameraDraft;
    const capabilities = this._capabilities;
    const editing = this._editingCameraIndex !== undefined;
    const secondaryOwner = camera
      ? this._groupOwner(this._cameraBaseline?.entity_id ?? camera.entity_id)
      : undefined;
    return html`<dialog
      class="camera-editor-dialog"
      @cancel=${this._cancelCameraEdit}
    >
      <form @submit=${this._saveCameraEdit}>
        <header>
          <h2>
            ${
              editing
                ? this._t("editor.edit_camera")
                : this._t("editor.add_camera")
            }
          </h2>
          <ha-icon-button
            class="dialog-close"
            .label=${this._t("editor.close_camera_editor")}
            .path=${iconPath("close")}
            @click=${this._cancelCameraEdit}
          ></ha-icon-button>
        </header>
        <div class="camera-dialog-content">
          ${
            camera
              ? staticHtml`<${accordionTag}
                  class="camera-dialog-accordion"
                  .initialOpen=${this._cameraDialogInitialOpen}
                >
                  <${accordionItemTag}
                    density="compact"
                    heading=${this._t("editor.camera")}
                    item-key="camera"
                    summary-text=${
                      camera.title || this._cameraName(camera.entity_id)
                    }
                  >
                    <div class="camera-section-fields">
                      <ha-selector
                        label=${this._t("editor.camera")}
                        .hass=${this._hass}
                        .selector=${CAMERA_SELECTOR}
                        .value=${camera.entity_id}
                        .required=${true}
                        @value-changed=${this._handleCameraEntityChange}
                      ></ha-selector>
                      ${this._renderCameraEntityError(camera)}
                      <div class="camera-title-field">
                        <ha-input
                          label=${this._t("editor.camera_title")}
                          placeholder=${this._t("editor.camera_title_placeholder")}
                          maxlength=${String(MAX_CAMERA_TITLE_LENGTH)}
                          .value=${this._cameraTitleInput}
                          @input=${this._handleCameraTitleInput}
                        >
                          <span
                            class="character-count"
                            slot="end"
                            aria-live="polite"
                          >
                            ${this._cameraTitleInput.length}/${MAX_CAMERA_TITLE_LENGTH}
                          </span>
                        </ha-input>
                      </div>
                      ${
                        camera.additional_camera
                          ? html`<div class="camera-group-name-field">
                              <ha-input
                                label=${this._t("editor.group_name")}
                                maxlength=${String(MAX_CAMERA_TITLE_LENGTH)}
                                .value=${this._cameraGroupNameInput}
                                @input=${this._handleCameraGroupNameInput}
                              >
                                <span
                                  class="character-count"
                                  slot="end"
                                  aria-live="polite"
                                >
                                  ${this._cameraGroupNameInput.length}/${MAX_CAMERA_TITLE_LENGTH}
                                </span>
                              </ha-input>
                            </div>`
                          : nothing
                      }
                    </div>
                  </${accordionItemTag}>
                  <${accordionItemTag}
                    density="compact"
                    heading=${this._t("editor.connection_source")}
                    item-key="connection"
                    summary-text=${this._connectionName(camera.connection)}
                  >
                    <div class="camera-section-fields">
                      <h3>${this._t("editor.connection_source")}</h3>
                      <ha-selector
                        label=${this._t("editor.connection")}
                        .hass=${this._hass}
                        .selector=${this._connectionSourceSelector()}
                        .value=${camera.connection}
                        .required=${true}
                        @value-changed=${this._handleConnectionChange}
                      ></ha-selector>
                      ${
                        camera.connection === "home_assistant"
                          ? this._renderCameraBoolean(
                              "low_latency_hls",
                              this._t("editor.low_latency_hls"),
                              camera.low_latency_hls,
                            )
                          : html`<ha-selector
                                data-camera-config-key="frigate_fallback"
                                label=${this._t("editor.frigate_fallback")}
                                .hass=${this._hass}
                                .selector=${this._frigateFallbackSelector()}
                                .value=${camera.frigate_fallback}
                                .required=${true}
                                @value-changed=${
                                  this._handleFrigateFallbackChange
                                }
                              ></ha-selector>
                              ${
                                camera.frigate_fallback === "hls"
                                  ? this._renderCameraBoolean(
                                      "low_latency_hls",
                                      this._t("editor.low_latency_hls"),
                                      camera.low_latency_hls,
                                    )
                                  : nothing
                              }`
                      }
                    </div>
                  </${accordionItemTag}>
                  <${accordionItemTag}
                    density="compact"
                    heading=${this._t("editor.additional_camera")}
                    item-key="additional-camera"
                    summary-text=${this._additionalCameraSummary(camera)}
                  >
                    ${this._renderAdditionalCameraSettings(camera)}
                  </${accordionItemTag}>
                  <${accordionItemTag}
                    density="compact"
                    heading=${this._t("editor.lights")}
                    item-key="lights"
                    summary-text=${
                      secondaryOwner
                        ? this._t("editor.shared_with_group", {
                            group:
                              secondaryOwner.group_name ||
                              this._cameraName(secondaryOwner.entity_id),
                          })
                        : camera.lights.length
                          ? this._t("editor.light_count", {
                              count: camera.lights.length,
                              maximum: MAX_LIGHTS_PER_CAMERA,
                            })
                          : this._t("editor.not_configured")
                    }
                  >
                    ${
                      secondaryOwner
                        ? html`<p class="empty-camera-section">
                            ${this._t("editor.shared_with_group", {
                              group:
                                secondaryOwner.group_name ||
                                this._cameraName(secondaryOwner.entity_id),
                            })}
                          </p>`
                        : this._renderLightSettings(camera)
                    }
                  </${accordionItemTag}>
                  <${accordionItemTag}
                    density="compact"
                    heading=${this._t("editor.options_controls")}
                    item-key="options"
                    summary-text=${this._cameraOptionsSummary(camera)}
                  >
                    <div class="camera-section-fields">
                      ${this._renderCameraBoolean(
                        "start_live_unmuted_pc_tablet",
                        this._t("editor.start_unmuted_pc_tablet"),
                        camera.start_live_unmuted_pc_tablet,
                      )}
                      ${this._renderCameraBoolean(
                        "start_live_unmuted_phone",
                        this._t("editor.start_unmuted_phone"),
                        camera.start_live_unmuted_phone,
                      )}
                      ${
                        secondaryOwner
                          ? nothing
                          : html`<div class="capability-option">
                                ${this._renderCameraBoolean(
                                  "two_way_talk_enabled",
                                  this._t("editor.two_way_talk"),
                                  camera.two_way_talk_enabled,
                                  !capabilities ||
                                    capabilities.talkPending ||
                                    capabilities.talk !== true,
                                )}
                                <small class="capability-status">
                                  ${
                                    !capabilities || capabilities.talkPending
                                      ? this._t("editor.checking_two_way_talk")
                                      : capabilities.talk === true
                                        ? this._t(
                                            "editor.two_way_talk_available",
                                          )
                                        : this._t(
                                            "editor.two_way_talk_unavailable",
                                          )
                                  }
                                </small>
                              </div>
                              <div class="capability-option">
                                ${this._renderCameraBoolean(
                                  "ptz_enabled",
                                  this._t("editor.ptz"),
                                  camera.ptz_enabled,
                                  !capabilities ||
                                    capabilities.ptzPending ||
                                    capabilities.ptz?.supported !== true,
                                )}
                                <small class="capability-status">
                                  ${
                                    !capabilities || capabilities.ptzPending
                                      ? this._t("editor.checking_ptz")
                                      : capabilities.ptz?.supported === true
                                        ? this._t("editor.ptz_available")
                                        : this._t("editor.ptz_unavailable")
                                  }
                                </small>
                              </div>`
                      }
                    </div>
                  </${accordionItemTag}>
                </${accordionTag}>`
              : nothing
          }
        </div>
        <footer>
          <ha-button
            appearance="plain"
            variant="brand"
            size="m"
            type="button"
            @click=${this._cancelCameraEdit}
          >
            ${this._t("common.cancel")}
          </ha-button>
          <ha-button
            appearance="accent"
            variant="brand"
            size="m"
            type="button"
            .disabled=${!this._cameraDraftCanCommit()}
            @click=${this._saveCameraEdit}
          >
            ${editing ? this._t("common.update") : this._t("common.add")}
          </ha-button>
        </footer>
      </form>
    </dialog>`;
  }

  private _renderRemoveCameraDialog() {
    const camera =
      this._pendingRemoveCameraIndex === undefined
        ? undefined
        : this._config?.cameras[this._pendingRemoveCameraIndex];
    const name = camera ? this._cameraDisplayName(camera) : "";
    return html`<dialog
      class="remove-camera-dialog"
      @cancel=${this._cancelRemoveCamera}
    >
      <form @submit=${this._confirmRemoveCamera}>
        <header><h2>${this._t("editor.remove_camera_question")}</h2></header>
        <div class="remove-camera-content">
          ${this._t("editor.remove_camera_description", { name })}
        </div>
        <footer>
          <ha-button
            appearance="plain"
            variant="neutral"
            size="m"
            type="button"
            @click=${this._cancelRemoveCamera}
          >
            ${this._t("common.cancel")}
          </ha-button>
          <ha-button
            appearance="accent"
            variant="danger"
            size="m"
            type="button"
            @click=${this._confirmRemoveCamera}
          >
            ${this._t("common.remove")}
          </ha-button>
        </footer>
      </form>
    </dialog>`;
  }

  private _renderLightSettings(camera: CameraConfig) {
    const pendingDuplicate = this._pendingLightIsDuplicate();
    return html`<div class="linked-light-settings">
      ${camera.lights.map((light, index) => {
        const entityId = light.entity_id;
        const name = this._entityName(entityId);
        return html`<div class="linked-light-row">
          <ha-icon .icon=${light.icon ?? "mdi:lightbulb"}></ha-icon>
          <span class="linked-light-copy">
            <strong>${name}</strong>
            <small>${entityId}</small>
          </span>
          <ha-selector
            class="light-icon-selector"
            data-light-index=${String(index)}
            label=${this._t("editor.icon")}
            .hass=${this._hass}
            .selector=${ICON_SELECTOR}
            .value=${light.icon ?? DEFAULT_LIGHT_ICON}
            .required=${false}
            @value-changed=${this._handleLightIconChange}
          ></ha-selector>
          <button
            class="remove-light"
            type="button"
            data-light-index=${String(index)}
            title=${this._t("editor.remove_light")}
            aria-label=${this._t("editor.remove_light_named", { name })}
            @click=${this._removeLight}
          >
            ${renderIcon("remove")}
          </button>
        </div>`;
      })}
      ${
        this._addingLight
          ? html`<div class="add-light-form">
              <strong class="add-light-heading"
                >${this._t("editor.linked_light")}</strong
              >
              <div class="add-light-fields">
                <div class="add-light-field">
                  <span>${this._t("editor.light")}</span>
                  <ha-selector
                    class="pending-light-selector"
                    aria-label=${this._t("editor.light")}
                    aria-invalid=${pendingDuplicate ? "true" : "false"}
                    .hass=${this._hass}
                    .selector=${LIGHT_SELECTOR}
                    .value=${this._pendingLightEntityId}
                    .required=${true}
                    @value-changed=${this._handleLightEntityChange}
                  ></ha-selector>
                </div>
                <div class="add-light-field">
                  <span>${this._t("editor.icon")}</span>
                  <ha-selector
                    class="pending-light-icon-selector"
                    aria-label=${this._t("editor.icon")}
                    .hass=${this._hass}
                    .selector=${ICON_SELECTOR}
                    .value=${this._pendingLightIcon}
                    .required=${false}
                    @value-changed=${this._handlePendingLightIconChange}
                  ></ha-selector>
                </div>
              </div>
              ${
                pendingDuplicate
                  ? html`<small
                      class="capability-status add-light-feedback"
                      role="alert"
                    >
                      ${this._t("editor.light_already_linked")}
                    </small>`
                  : nothing
              }
              <div class="add-light-actions">
                <ha-button
                  appearance="plain"
                  variant="neutral"
                  size="s"
                  type="button"
                  @click=${this._cancelAddingLight}
                >
                  ${this._t("common.cancel")}
                </ha-button>
                <ha-button
                  appearance="accent"
                  variant="brand"
                  size="s"
                  type="button"
                  .disabled=${!this._pendingLightCanCommit()}
                  @click=${this._addLightToDraft}
                >
                  ${this._t("common.add")}
                </ha-button>
              </div>
            </div>`
          : camera.lights.length < MAX_LIGHTS_PER_CAMERA
            ? html`<ha-button
                class="add-light"
                appearance="plain"
                variant="neutral"
                size="s"
                type="button"
                title=${this._t("editor.add_light")}
                @click=${this._startAddingLight}
              >
                ${renderIcon("lightbulb")} ${this._t("editor.add_light")}
              </ha-button>`
            : nothing
      }
    </div>`;
  }

  private _renderAdditionalCameraSettings(camera: CameraConfig) {
    const owner = this._config?.cameras.find(
      ({ entity_id: entityId, additional_camera: group }) =>
        group?.entity_id === camera.entity_id && entityId !== camera.entity_id,
    );
    if (owner) {
      return html`<p class="empty-camera-section">
        ${this._t("editor.camera_group_secondary", {
          group: owner.group_name || this._cameraName(owner.entity_id),
        })}
      </p>`;
    }
    if (!camera.additional_camera) {
      return html`<div class="camera-section-fields">
        <ha-selector
          label=${this._t("editor.second_camera")}
          .hass=${this._hass}
          .selector=${CAMERA_SELECTOR}
          .value=${""}
          .required=${false}
          @value-changed=${this._handleAdditionalCameraChange}
        ></ha-selector>
      </div>`;
    }
    const secondary =
      this._secondaryCameraDraft?.entity_id ===
      camera.additional_camera.entity_id
        ? this._secondaryCameraDraft
        : undefined;
    return html`<div class="camera-section-fields additional-camera-settings">
      <ha-selector
        label=${this._t("editor.second_camera")}
        .hass=${this._hass}
        .selector=${CAMERA_SELECTOR}
        .value=${camera.additional_camera.entity_id}
        .required=${true}
        @value-changed=${this._handleAdditionalCameraChange}
      ></ha-selector>
      ${this._renderAdditionalCameraError(camera)}
      ${
        secondary
          ? html`<div class="secondary-camera-settings">
              <ha-input
                label=${this._t("editor.camera_title")}
                placeholder=${this._t("editor.camera_title_placeholder")}
                maxlength=${String(MAX_CAMERA_TITLE_LENGTH)}
                .value=${this._secondaryCameraTitleInput}
                @input=${this._handleSecondaryCameraTitleInput}
              >
                <span class="character-count" slot="end" aria-live="polite">
                  ${this._secondaryCameraTitleInput.length}/${MAX_CAMERA_TITLE_LENGTH}
                </span>
              </ha-input>
              <label class="field-label"
                >${this._t("editor.live_view_layout")}</label
              >
              <wzc-segmented-control
                appearance="compact"
                mode="radio"
                .label=${this._t("editor.live_view_layout")}
                .options=${
                  [
                    {
                      label: this._t("editor.side_by_side"),
                      value: "side_by_side",
                    },
                    { label: this._t("editor.stacked"), value: "stacked" },
                  ] satisfies readonly SegmentedControlOption[]
                }
                .value=${camera.additional_camera.layout}
                @wzc-segmented-control-value=${
                  this._handleAdditionalCameraLayoutChange
                }
              ></wzc-segmented-control>
              <small class="capability-status">
                ${this._t("editor.main_camera_controls_group")}
              </small>
              <h3>${this._t("editor.connection_source")}</h3>
              <ha-selector
                class="secondary-connection-source"
                label=${this._t("editor.connection_source")}
                .hass=${this._hass}
                .selector=${this._connectionSourceSelector()}
                .value=${secondary.connection}
                .required=${true}
                @value-changed=${this._handleSecondaryConnectionChange}
              ></ha-selector>
              ${
                secondary.connection === "home_assistant"
                  ? this._renderSecondaryLowLatencyOption(secondary)
                  : html`<ha-selector
                        class="secondary-frigate-fallback"
                        label=${this._t("editor.frigate_fallback")}
                        .hass=${this._hass}
                        .selector=${this._frigateFallbackSelector()}
                        .value=${secondary.frigate_fallback}
                        .required=${true}
                        @value-changed=${
                          this._handleSecondaryFrigateFallbackChange
                        }
                      ></ha-selector>
                      ${
                        secondary.frigate_fallback === "hls"
                          ? this._renderSecondaryLowLatencyOption(secondary)
                          : nothing
                      }`
              }
            </div>`
          : nothing
      }
      <ha-button
        class="remove-additional-camera"
        appearance="filled"
        variant="brand"
        size="s"
        type="button"
        @click=${this._removeAdditionalCamera}
      >
        ${this._t("editor.remove_camera")}
      </ha-button>
    </div>`;
  }

  private _renderSecondaryLowLatencyOption(camera: CameraConfig) {
    return html`<ha-selector
      class="secondary-low-latency-hls"
      label=${this._t("editor.low_latency_hls")}
      .hass=${this._hass}
      .selector=${BOOLEAN_SELECTOR}
      .value=${camera.low_latency_hls}
      @value-changed=${this._handleSecondaryLowLatencyChange}
    ></ha-selector>`;
  }

  private _renderAdditionalCameraError(camera: CameraConfig) {
    const error = this._additionalCameraSelectionError(camera);
    return error
      ? html`<small class="field-error" role="alert">${error}</small>`
      : nothing;
  }

  private _renderCameraEntityError(camera: CameraConfig) {
    const duplicate = this._config?.cameras.some(
      ({ entity_id: entityId }, index) =>
        entityId === camera.entity_id && index !== this._editingCameraIndex,
    );
    return duplicate
      ? html`<small class="field-error" role="alert">
          ${this._t("editor.additional_camera_already_configured")}
        </small>`
      : nothing;
  }

  private _renderCameraBoolean(
    key: CameraBooleanConfigFlag,
    label: string,
    value: boolean,
    disabled = false,
  ) {
    return html`<ha-selector
      class="boolean-option"
      data-camera-config-key=${key}
      label=${label}
      .hass=${this._hass}
      .selector=${BOOLEAN_SELECTOR}
      .value=${value}
      .disabled=${disabled}
      @value-changed=${this._handleCameraBooleanChange}
    ></ha-selector>`;
  }

  private _connectionSourceSelector() {
    return {
      select: {
        mode: "dropdown",
        options: [
          {
            label: this._t("editor.home_assistant"),
            value: "home_assistant",
          },
          {
            label: this._t("editor.frigate_go2rtc"),
            value: "frigate_go2rtc",
            disabled:
              !this._capabilities ||
              this._capabilities.frigatePending ||
              !this._capabilities.frigateAvailable,
          },
        ],
      },
    } as const;
  }

  private _frigateFallbackSelector() {
    return {
      select: {
        mode: "dropdown",
        options: [
          { label: this._t("editor.mse"), value: "mse" },
          { label: this._t("editor.hls_testing"), value: "hls" },
        ],
      },
    } as const;
  }

  private _seedDirtyState(): void {
    if (this._haEditor.isNestedCardEdit()) return;
    if (this._dirtyContext && this._baseline && !this._dirtySeeded) {
      this._dirtySeeded = true;
      seedDirtyState(
        this._dirtyContext,
        this._serializeDraft(
          this._baseline,
          this._baselineOptionalInteractions,
        ),
      );
      if (
        this._config &&
        (this._configSignature !== this._baselineSignature ||
          !interactionSetsEqual(
            this._visibleOptionalInteractions,
            this._baselineOptionalInteractions,
          ))
      ) {
        updateDirtyState(
          this._dirtyContext,
          this._serializeDraft(this._config),
        );
      }
    }
  }

  private _handleTitleInput(event: Event): void {
    this._updateTitleInput(event, false);
  }

  private _handleTitleChange(event: Event): void {
    this._updateTitleInput(event, true);
  }

  private _updateTitleInput(event: Event, commitConfig: boolean): void {
    const input = event.currentTarget as InputElement;
    const sanitized = sanitizeCardTitleInput(input.value);
    if (input.value !== sanitized) input.value = sanitized;
    this._updateTitle(sanitized, commitConfig);
  }

  private readonly _handleEventHistoryDaysChange = (
    event: ValueChangedEvent,
  ): void => {
    if (!this._config) return;
    const value = Number(event.detail.value);
    if (
      !Number.isInteger(value) ||
      value < MIN_EVENT_HISTORY_DAYS ||
      value > MAX_EVENT_HISTORY_DAYS
    ) {
      return;
    }
    this._applyDraft(
      normalizeCardConfig({ ...this._config, event_history_days: value }),
      true,
    );
  };

  private _updateTitle(rawTitle: string, commitConfig: boolean): void {
    const title = normalizeCardTitle(rawTitle);
    if (!this._config || title.length === 0) {
      return;
    }

    const nextConfig = normalizeCardConfig({ ...this._config, title });
    this._applyDraft(nextConfig, commitConfig);
  }

  private readonly _handleCameraEntityChange = (
    event: ValueChangedEvent,
  ): void => {
    if (!this._cameraDraft) return;
    const value = eventString(event);
    this._cameraDraft = { ...this._cameraDraft, entity_id: value };
    this._checkCapabilities(value, this._cameraDraft.connection);
    this.requestUpdate();
  };

  private readonly _handleConnectionChange = (
    event: ValueChangedEvent,
  ): void => {
    if (!this._cameraDraft) return;
    const connection = eventString(event) as LiveConnectionType;
    if (connection !== "home_assistant" && connection !== "frigate_go2rtc")
      return;
    this._cameraDraft = { ...this._cameraDraft, connection };
    this._checkCapabilities(this._cameraDraft.entity_id, connection);
    this.requestUpdate();
  };

  private readonly _handleFrigateFallbackChange = (
    event: ValueChangedEvent,
  ): void => {
    if (!this._cameraDraft) return;
    const value = eventString(event) as FrigateFallbackTransport;
    if (value !== "mse" && value !== "hls") return;
    this._cameraDraft = { ...this._cameraDraft, frigate_fallback: value };
    this.requestUpdate();
  };

  private readonly _handleCameraTitleInput = (event: Event): void => {
    if (!this._cameraDraft) return;
    const input = event.currentTarget as InputElement;
    const sanitized = sanitizeCameraTitleInput(input.value);
    if (input.value !== sanitized) input.value = sanitized;
    this._cameraTitleInput = sanitized;
    this._cameraDraft = {
      ...this._cameraDraft,
      title: normalizeCameraTitle(sanitized),
    };
    this.requestUpdate();
  };

  private readonly _handleCameraGroupNameInput = (event: Event): void => {
    if (!this._cameraDraft?.additional_camera) return;
    const input = event.currentTarget as InputElement;
    const sanitized = sanitizeCameraTitleInput(input.value);
    if (input.value !== sanitized) input.value = sanitized;
    this._cameraGroupNameInput = sanitized;
    this._cameraDraft = {
      ...this._cameraDraft,
      group_name: normalizeCameraTitle(sanitized),
    };
    this.requestUpdate();
  };

  private readonly _handleSecondaryCameraTitleInput = (event: Event): void => {
    if (!this._secondaryCameraDraft) return;
    const input = event.currentTarget as InputElement;
    const sanitized = sanitizeCameraTitleInput(input.value);
    if (input.value !== sanitized) input.value = sanitized;
    this._secondaryCameraTitleInput = sanitized;
    this._secondaryCameraDraft = {
      ...this._secondaryCameraDraft,
      title: normalizeCameraTitle(sanitized),
    };
    this.requestUpdate();
  };

  private readonly _handleSecondaryConnectionChange = (
    event: ValueChangedEvent,
  ): void => {
    if (!this._secondaryCameraDraft) return;
    const connection = eventString(event) as LiveConnectionType;
    if (connection !== "home_assistant" && connection !== "frigate_go2rtc")
      return;
    this._secondaryCameraDraft = {
      ...this._secondaryCameraDraft,
      connection,
    };
    this.requestUpdate();
  };

  private readonly _handleSecondaryFrigateFallbackChange = (
    event: ValueChangedEvent,
  ): void => {
    if (!this._secondaryCameraDraft) return;
    const frigateFallback = eventString(event) as FrigateFallbackTransport;
    if (frigateFallback !== "mse" && frigateFallback !== "hls") return;
    this._secondaryCameraDraft = {
      ...this._secondaryCameraDraft,
      frigate_fallback: frigateFallback,
    };
    this.requestUpdate();
  };

  private readonly _handleSecondaryLowLatencyChange = (
    event: ValueChangedEvent,
  ): void => {
    if (!this._secondaryCameraDraft || typeof event.detail.value !== "boolean")
      return;
    this._secondaryCameraDraft = {
      ...this._secondaryCameraDraft,
      low_latency_hls: event.detail.value,
    };
    this.requestUpdate();
  };

  private readonly _handleAdditionalCameraChange = (
    event: ValueChangedEvent,
  ): void => {
    if (!this._cameraDraft) return;
    const entityId = eventString(event);
    if (!entityId) return;
    const existing = this._cameraDraft.additional_camera;
    const groupName = existing
      ? this._cameraDraft.group_name
      : nextCameraGroupTitle(this._config?.cameras ?? []);
    const existingSecondary = this._config?.cameras.find(
      ({ entity_id: configuredId }) => configuredId === entityId,
    );
    this._secondaryCameraBaseline = existingSecondary;
    this._secondaryCameraDraft = existingSecondary
      ? { ...existingSecondary }
      : this._createGroupedSecondary(this._cameraDraft, entityId);
    this._secondaryCameraTitleInput = this._secondaryCameraDraft.title;
    this._cameraDraft = {
      ...this._cameraDraft,
      group_name: groupName,
      additional_camera: {
        entity_id: entityId,
        layout: existing?.layout ?? "side_by_side",
      },
    };
    this._cameraGroupNameInput = groupName ?? "";
    this.requestUpdate();
  };

  private readonly _handleAdditionalCameraLayoutChange = (
    event: CustomEvent<SegmentedControlValueDetail>,
  ): void => {
    if (!this._cameraDraft?.additional_camera) return;
    const layout = event.detail.value as AdditionalCameraLayout;
    if (layout !== "side_by_side" && layout !== "stacked") return;
    this._cameraDraft = {
      ...this._cameraDraft,
      additional_camera: { ...this._cameraDraft.additional_camera, layout },
    };
    this.requestUpdate();
  };

  private readonly _removeAdditionalCamera = (): void => {
    if (!this._cameraDraft?.additional_camera) return;
    this._cameraDraft = {
      ...this._cameraDraft,
      additional_camera: undefined,
      group_name: undefined,
    };
    this._secondaryCameraBaseline = undefined;
    this._secondaryCameraDraft = undefined;
    this._secondaryCameraTitleInput = "";
    this._cameraGroupNameInput = "";
    this.requestUpdate();
  };

  private readonly _handleCameraBooleanChange = (
    event: ValueChangedEvent,
  ): void => {
    if (!this._cameraDraft || typeof event.detail.value !== "boolean") return;
    const key = (event.currentTarget as HTMLElement).dataset.cameraConfigKey as
      CameraBooleanConfigFlag | undefined;
    if (!key) return;
    this._cameraDraft = {
      ...this._cameraDraft,
      [key]: event.detail.value,
    };
    this.requestUpdate();
  };

  private readonly _handleLightEntityChange = (
    event: ValueChangedEvent,
  ): void => {
    this._pendingLightEntityId = eventString(event);
    this.requestUpdate();
  };

  private readonly _startAddingLight = (): void => {
    this._addingLight = true;
    this._pendingLightEntityId = "";
    this._pendingLightIcon = DEFAULT_LIGHT_ICON;
    this.requestUpdate();
  };

  private readonly _cancelAddingLight = (): void => {
    this._addingLight = false;
    this._pendingLightEntityId = "";
    this._pendingLightIcon = DEFAULT_LIGHT_ICON;
    this.requestUpdate();
  };

  private _pendingLightIsDuplicate(): boolean {
    return Boolean(
      this._pendingLightEntityId &&
      this._cameraDraft?.lights.some(
        ({ entity_id: entityId }) => entityId === this._pendingLightEntityId,
      ),
    );
  }

  private _pendingLightCanCommit(): boolean {
    return Boolean(
      this._cameraDraft &&
      this._pendingLightEntityId.startsWith("light.") &&
      this._cameraDraft.lights.length < MAX_LIGHTS_PER_CAMERA &&
      !this._pendingLightIsDuplicate(),
    );
  }

  private readonly _addLightToDraft = (): void => {
    if (!this._cameraDraft || !this._pendingLightCanCommit()) return;
    this._cameraDraft = {
      ...this._cameraDraft,
      lights: [
        ...this._cameraDraft.lights,
        {
          entity_id: this._pendingLightEntityId,
          ...(this._pendingLightIcon &&
          this._pendingLightIcon !== DEFAULT_LIGHT_ICON
            ? { icon: this._pendingLightIcon }
            : {}),
        },
      ],
    };
    this._cancelAddingLight();
  };

  private readonly _removeLight = (event: Event): void => {
    if (!this._cameraDraft) return;
    const index = Number(
      (event.currentTarget as HTMLElement).dataset.lightIndex,
    );
    if (!this._cameraDraft.lights[index]) return;
    const lights = [...this._cameraDraft.lights];
    lights.splice(index, 1);
    this._cameraDraft = { ...this._cameraDraft, lights };
    this.requestUpdate();
  };

  private readonly _handleLightIconChange = (
    event: ValueChangedEvent,
  ): void => {
    if (!this._cameraDraft) return;
    const index = Number(
      (event.currentTarget as HTMLElement).dataset.lightIndex,
    );
    const current = this._cameraDraft.lights[index];
    if (!current) return;
    const value = eventString(event);
    const lights = [...this._cameraDraft.lights];
    lights[index] = {
      entity_id: current.entity_id,
      ...(value && value !== DEFAULT_LIGHT_ICON ? { icon: value } : {}),
    };
    this._cameraDraft = { ...this._cameraDraft, lights };
    this.requestUpdate();
  };

  private readonly _handlePendingLightIconChange = (
    event: ValueChangedEvent,
  ): void => {
    this._pendingLightIcon = eventString(event) || DEFAULT_LIGHT_ICON;
    this.requestUpdate();
  };

  private readonly _addCamera = (): void => {
    if ((this._config?.cameras.length ?? 0) >= MAX_CAMERAS) return;
    this._editingCameraIndex = undefined;
    this._cameraDialogInitialOpen = "camera";
    this._cameraBaseline = undefined;
    this._cameraDraft = createDefaultCameraConfig();
    this._secondaryCameraBaseline = undefined;
    this._secondaryCameraDraft = undefined;
    this._secondaryCameraTitleInput = "";
    this._cameraGroupNameInput = "";
    this._cameraTitleInput = "";
    this._cancelAddingLight();
    this._capabilities?.reset();
    void this._loadCapabilities();
    this.requestUpdate();
  };

  private readonly _editCamera = (event: Event): void => {
    const index = Number(
      (event.currentTarget as HTMLElement).dataset.cameraIndex,
    );
    this._openCameraEditor(index);
  };

  private readonly _editAdditionalCamera = (event: Event): void => {
    const index = Number(
      (event.currentTarget as HTMLElement).dataset.cameraIndex,
    );
    this._openCameraEditor(index, "additional-camera");
  };

  private _openCameraEditor(index: number, initialOpen = "camera"): void {
    const camera = this._config?.cameras[index];
    if (!camera) return;
    this._editingCameraIndex = index;
    this._cameraDialogInitialOpen = initialOpen;
    this._cameraBaseline = camera;
    this._cameraDraft = { ...camera };
    const secondary = camera.additional_camera
      ? this._config?.cameras.find(
          ({ entity_id: entityId }) =>
            entityId === camera.additional_camera?.entity_id,
        )
      : undefined;
    this._secondaryCameraBaseline = secondary;
    this._secondaryCameraDraft = secondary ? { ...secondary } : undefined;
    this._secondaryCameraTitleInput = secondary?.title ?? "";
    this._cameraGroupNameInput = camera.group_name ?? "";
    this._cameraTitleInput = camera.title;
    this._cancelAddingLight();
    this._checkCapabilities(camera.entity_id, camera.connection);
    this.requestUpdate();
  }

  private readonly _requestRemoveCamera = (event: Event): void => {
    const index = Number(
      (event.currentTarget as HTMLElement).dataset.cameraIndex,
    );
    if (!this._config?.cameras[index]) return;
    this._pendingRemoveCameraIndex = index;
    this.requestUpdate();
  };

  private readonly _cancelRemoveCamera = (event?: Event): void => {
    event?.preventDefault();
    this._pendingRemoveCameraIndex = undefined;
    this.requestUpdate();
  };

  private readonly _confirmRemoveCamera = (event: Event): void => {
    event.preventDefault();
    const index = this._pendingRemoveCameraIndex;
    if (index === undefined || !this._config?.cameras[index]) return;
    const cameras = [...this._config.cameras];
    const [removed] = cameras.splice(index, 1);
    if (removed?.additional_camera) {
      const secondaryIndex = cameras.findIndex(
        ({ entity_id: entityId }) =>
          entityId === removed.additional_camera?.entity_id,
      );
      if (secondaryIndex >= 0) cameras.splice(secondaryIndex, 1);
    }
    if (removed) {
      for (
        let cameraIndex = 0;
        cameraIndex < cameras.length;
        cameraIndex += 1
      ) {
        const camera = cameras[cameraIndex];
        if (camera?.additional_camera?.entity_id !== removed.entity_id)
          continue;
        cameras[cameraIndex] = {
          ...camera,
          additional_camera: undefined,
          group_name: undefined,
        };
      }
    }
    this._pendingRemoveCameraIndex = undefined;
    this._applyCameraList(cameras);
  };

  private readonly _cancelCameraEdit = (event: Event): void => {
    event.preventDefault();
    this._cameraBaseline = undefined;
    this._cameraDraft = undefined;
    this._secondaryCameraBaseline = undefined;
    this._secondaryCameraDraft = undefined;
    this._secondaryCameraTitleInput = "";
    this._cameraGroupNameInput = "";
    this._cameraTitleInput = "";
    this._cancelAddingLight();
    this._capabilities?.reset();
    this._editingCameraIndex = undefined;
    this._cameraDialogInitialOpen = "camera";
    this.requestUpdate();
  };

  private readonly _saveCameraEdit = (event: Event): void => {
    event.preventDefault();
    if (!this._config || !this._cameraDraftCanCommit() || !this._cameraDraft)
      return;
    const cameras = [...this._config.cameras];
    const previousSecondaryId =
      this._editingCameraIndex === undefined
        ? undefined
        : cameras[this._editingCameraIndex]?.additional_camera?.entity_id;
    if (this._editingCameraIndex === undefined) cameras.push(this._cameraDraft);
    else {
      const previousEntityId = cameras[this._editingCameraIndex]?.entity_id;
      cameras[this._editingCameraIndex] = this._cameraDraft;
      if (
        previousEntityId &&
        previousEntityId !== this._cameraDraft.entity_id
      ) {
        for (let index = 0; index < cameras.length; index += 1) {
          const camera = cameras[index];
          if (camera?.additional_camera?.entity_id !== previousEntityId)
            continue;
          cameras[index] = {
            ...camera,
            additional_camera: {
              ...camera.additional_camera,
              entity_id: this._cameraDraft.entity_id,
            },
          };
        }
      }
    }
    const nextSecondaryId = this._cameraDraft.additional_camera?.entity_id;
    if (previousSecondaryId && previousSecondaryId !== nextSecondaryId) {
      const previousSecondaryIndex = cameras.findIndex(
        ({ entity_id: entityId }) => entityId === previousSecondaryId,
      );
      if (previousSecondaryIndex >= 0)
        cameras.splice(previousSecondaryIndex, 1);
    }
    if (nextSecondaryId) {
      const mainIndex = cameras.findIndex(
        ({ entity_id: entityId }) => entityId === this._cameraDraft?.entity_id,
      );
      const secondary =
        this._secondaryCameraDraft?.entity_id === nextSecondaryId
          ? this._secondaryCameraDraft
          : this._createGroupedSecondary(this._cameraDraft, nextSecondaryId);
      const secondaryIndex = cameras.findIndex(
        ({ entity_id: entityId }) => entityId === nextSecondaryId,
      );
      if (secondaryIndex >= 0) cameras[secondaryIndex] = secondary;
      else cameras.splice(mainIndex + 1, 0, secondary);
    }
    this._cameraBaseline = undefined;
    this._cameraDraft = undefined;
    this._secondaryCameraBaseline = undefined;
    this._secondaryCameraDraft = undefined;
    this._secondaryCameraTitleInput = "";
    this._cameraGroupNameInput = "";
    this._cameraTitleInput = "";
    this._cancelAddingLight();
    this._editingCameraIndex = undefined;
    this._cameraDialogInitialOpen = "camera";
    this._applyCameraList(cameras);
  };

  private _loadCapabilities(): Promise<CameraCapabilityController> {
    return (this._capabilitiesLoad ??=
      import("./camera-capability.controller").then(
        ({ CameraCapabilityController }) =>
          (this._capabilities ??= new CameraCapabilityController(this, () =>
            this._hass ? createHomeAssistantApi(this._hass) : undefined,
          )),
      ));
  }

  private _checkCapabilities(
    entityId: string,
    connection: LiveConnectionType,
  ): void {
    void this._loadCapabilities().then((capabilities) => {
      if (
        this._cameraDraft?.entity_id !== entityId ||
        this._cameraDraft.connection !== connection
      ) {
        return;
      }
      capabilities.check(entityId, connection);
    });
  }

  private readonly _handleCameraReorder = (
    event: CustomEvent<SortableReorderDetail>,
  ): void => {
    const ownsEvent = event
      .composedPath()
      .some(
        (target) =>
          target instanceof HTMLElement &&
          target.dataset.sortableScope === "cameras",
      );
    if (!this._config || !ownsEvent) return;
    event.stopPropagation();
    const { fromIndex, toIndex } = event.detail;
    const items = [...cameraPresentationItems(this._config.cameras)];
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= items.length ||
      toIndex >= items.length
    )
      return;
    const [item] = items.splice(fromIndex, 1);
    if (!item) return;
    items.splice(toIndex, 0, item);
    this._applyCameraList(items.flatMap(({ cameras }) => cameras));
  };

  private _applyCameraList(cameras: readonly CameraConfig[]): void {
    if (!this._config) return;
    this._applyDraft(normalizeCardConfig({ ...this._config, cameras }), true);
  }

  private _cameraDraftIsValid(): boolean {
    const draft = this._cameraDraft;
    if (!draft?.entity_id.startsWith("camera.")) return false;
    const duplicate =
      this._config?.cameras.some(
        (camera, index) =>
          camera.entity_id === draft.entity_id &&
          index !== this._editingCameraIndex,
      ) ?? false;
    if (duplicate) return false;
    const group = draft.additional_camera;
    if (!group) return true;
    if (this._additionalCameraSelectionError(draft) || !draft.group_name)
      return false;
    if (this._secondaryCameraDraft?.entity_id !== group.entity_id) return false;
    const normalizedTitle = draft.group_name.trim().toLocaleLowerCase();
    const memberNames = [
      draft.title || this._cameraName(draft.entity_id),
      this._secondaryCameraDraft.title || this._cameraName(group.entity_id),
    ];
    if (
      memberNames.some(
        (name) => name.trim().toLocaleLowerCase() === normalizedTitle,
      )
    ) {
      return false;
    }
    return !(
      this._config?.cameras.some(
        (camera, index) =>
          index !== this._editingCameraIndex &&
          camera.additional_camera &&
          camera.group_name?.trim().toLocaleLowerCase() === normalizedTitle,
      ) ?? false
    );
  }

  private _additionalCameraSelectionError(camera: CameraConfig): string {
    const entityId = camera.additional_camera?.entity_id;
    if (!entityId) return "";
    if (entityId === camera.entity_id) {
      return this._t("editor.additional_camera_same_as_main");
    }
    const currentSecondaryId =
      this._cameraBaseline?.additional_camera?.entity_id;
    const alreadyConfigured = this._config?.cameras.some(
      ({ entity_id: configuredId }) =>
        configuredId === entityId && configuredId !== currentSecondaryId,
    );
    if (alreadyConfigured) {
      return this._t("editor.additional_camera_already_configured");
    }
    if (
      (this._config?.cameras.length ?? 0) >= MAX_CAMERAS &&
      !currentSecondaryId
    ) {
      return this._t("editor.additional_camera_limit_reached");
    }
    return "";
  }

  private _createGroupedSecondary(
    main: CameraConfig,
    entityId: string,
  ): CameraConfig {
    return {
      ...createDefaultCameraConfig(entityId),
      connection: main.connection,
      frigate_fallback: main.frigate_fallback,
      low_latency_hls: main.low_latency_hls,
      start_live_unmuted_pc_tablet: main.start_live_unmuted_pc_tablet,
      start_live_unmuted_phone: main.start_live_unmuted_phone,
    };
  }

  private _cameraDraftCanCommit(): boolean {
    if (!this._cameraDraftIsValid() || !this._cameraDraft) return false;
    if (!this._cameraBaseline) return true;
    if (!cameraConfigEquals(this._cameraDraft, this._cameraBaseline))
      return true;
    return Boolean(
      this._secondaryCameraDraft &&
      (!this._secondaryCameraBaseline ||
        !cameraConfigEquals(
          this._secondaryCameraDraft,
          this._secondaryCameraBaseline,
        )),
    );
  }

  private _cameraName(entityId: string): string {
    return this._entityName(entityId).replace(/^camera\./, "");
  }

  private _cameraDisplayName(camera: CameraConfig): string {
    return camera.additional_camera
      ? camera.group_name || this._cameraName(camera.entity_id)
      : camera.title || this._cameraName(camera.entity_id);
  }

  private _groupOwner(entityId: string): CameraConfig | undefined {
    return this._config?.cameras.find(
      ({ additional_camera: group }) => group?.entity_id === entityId,
    );
  }

  private _entityName(entityId: string): string {
    const friendlyName = this._hass?.states[entityId]?.attributes.friendly_name;
    if (typeof friendlyName === "string" && friendlyName.trim())
      return friendlyName;
    const separator = entityId.indexOf(".");
    return (
      separator >= 0 ? entityId.slice(separator + 1) : entityId
    ).replaceAll("_", " ");
  }

  private _connectionName(connection: LiveConnectionType): string {
    return connection === "frigate_go2rtc"
      ? this._t("editor.frigate_go2rtc")
      : this._t("editor.home_assistant");
  }

  private _additionalCameraSummary(camera: CameraConfig): string {
    const group = camera.additional_camera;
    if (!group) return this._t("editor.not_configured");
    const secondary =
      this._secondaryCameraDraft?.entity_id === group.entity_id
        ? this._secondaryCameraDraft
        : this._config?.cameras.find(
            ({ entity_id: entityId }) => entityId === group.entity_id,
          );
    return [
      secondary?.title || this._cameraName(group.entity_id),
      this._t(
        group.layout === "stacked" ? "editor.stacked" : "editor.side_by_side",
      ),
      this._connectionName(secondary?.connection ?? camera.connection),
    ].join(" · ");
  }

  private _cameraAudioSummary(camera: CameraConfig): string {
    const devices = [
      camera.start_live_unmuted_pc_tablet
        ? this._t("editor.pc_tablet")
        : undefined,
      camera.start_live_unmuted_phone
        ? this._t("editor.mobile_phone")
        : undefined,
    ].filter((device): device is string => Boolean(device));
    return devices.length
      ? this._t("editor.unmuted", { devices: devices.join(", ") })
      : this._t("editor.muted");
  }

  private _cameraOptionsSummary(camera: CameraConfig): string {
    return [
      this._cameraAudioSummary(camera),
      camera.two_way_talk_enabled ? this._t("editor.two_way_talk") : undefined,
      camera.ptz_enabled ? this._t("editor.ptz") : undefined,
    ]
      .filter((option): option is string => Boolean(option))
      .join(" · ");
  }

  private _cameraSummary(camera: CameraConfig): string {
    const group = camera.additional_camera;
    const groupSummary = group
      ? `${this._t("editor.camera_group_members", {
          main: camera.title || this._cameraName(camera.entity_id),
          secondary:
            this._config?.cameras.find(
              ({ entity_id: entityId }) => entityId === group.entity_id,
            )?.title || this._cameraName(group.entity_id),
        })} · ${this._t(
          group.layout === "stacked" ? "editor.stacked" : "editor.side_by_side",
        )} · `
      : "";
    const connection =
      camera.connection === "frigate_go2rtc"
        ? `${this._t("editor.frigate_go2rtc")} · ${
            camera.frigate_fallback === "hls"
              ? this._t("editor.hls_testing")
              : this._t("editor.mse")
          }`
        : camera.low_latency_hls
          ? this._t("editor.low_latency_hls")
          : this._t("editor.standard_hls");
    const talk = camera.two_way_talk_enabled
      ? ` · ${this._t("editor.two_way_talk")}`
      : "";
    const ptz = camera.ptz_enabled ? ` · ${this._t("editor.ptz")}` : "";
    return `${groupSummary}${connection} · ${this._cameraAudioSummary(
      camera,
    )}${talk}${ptz}`;
  }

  private readonly _handleConfigChange = (event: ValueChangedEvent): void => {
    if (!this._config) {
      return;
    }
    const key =
      event.detail.key ??
      (event.currentTarget as HTMLElement).dataset.configKey;
    if (!key) {
      return;
    }
    const next: Record<string, unknown> = {
      ...this._config,
      [key]: event.detail.value,
    };
    this._applyDraft(normalizeCardConfig(next), true);
  };

  private readonly _handleStageTypeChange = (event: Event): void => {
    if (!this._config) return;
    const input = event.currentTarget as HTMLInputElement;
    if (!input.checked) return;
    const stageType = input.value;
    if (
      stageType !== "full" &&
      stageType !== "camera_only" &&
      stageType !== "minimal_camera_only"
    )
      return;
    this._applyDraft(
      normalizeCardConfig({
        ...this._config,
        stage_flow: defaultStageFlow(stageType),
        stage_type: stageType,
      }),
      true,
    );
  };

  private readonly _handleActionsChange = (event: ValueChangedEvent): void => {
    if (!this._config) return;
    if (typeof event.detail?.value !== "object" || event.detail.value === null)
      return;
    const actions = event.detail.value as Record<string, unknown>;
    this._applyDraft(
      normalizeCardConfig({
        ...this._config,
        ...actions,
        hold_action:
          "hold_action" in actions
            ? (actions.hold_action ?? { action: "none" })
            : this._config.hold_action,
        double_tap_action:
          "double_tap_action" in actions
            ? (actions.double_tap_action ?? { action: "none" })
            : this._config.double_tap_action,
      }),
      true,
    );
  };

  private readonly _toggleOptionalInteractionChoices = (): void => {
    this._choosingOptionalInteraction = !this._choosingOptionalInteraction;
    this.requestUpdate();
  };

  private readonly _addOptionalInteraction = (event: Event): void => {
    if (!this._config) return;
    const name = (event.currentTarget as HTMLElement).dataset.interaction;
    if (name !== "hold_action" && name !== "double_tap_action") return;
    this._visibleOptionalInteractions.add(name);
    this._choosingOptionalInteraction = false;
    this._interactionStructureChanged();
  };

  private readonly _removeOptionalInteraction = (event: Event): void => {
    if (!this._config) return;
    const name = (event.currentTarget as HTMLElement).dataset.interaction;
    if (name !== "hold_action" && name !== "double_tap_action") return;
    this._visibleOptionalInteractions.delete(name);
    this._applyDraft(
      normalizeCardConfig({
        ...this._config,
        [name]: { action: "none" },
      }),
      true,
    );
    this._interactionStructureChanged();
  };

  private _interactionStructureChanged(): void {
    if (!this._config) return;
    this._syncDraftStatus();
    this.requestUpdate();
    const nestedEdit = this._haEditor.isNestedCardEdit();
    if (this._dirtyContext && !nestedEdit) {
      updateDirtyState(this._dirtyContext, this._serializeDraft(this._config));
    } else {
      this._dispatchConfigChange(this._config);
    }
  }

  private readonly _handleStageLayoutChange = (event: Event): void => {
    if (!this._config) return;
    const input = event.currentTarget as HTMLInputElement;
    const profile = input.dataset.stageProfile;
    if (profile !== "default" && profile !== "phone") return;
    const current = this._config.stage_flow[profile];
    const next = input.checked
      ? current.includes(input.value)
        ? current
        : [...current, input.value]
      : current.filter((id) => id !== input.value);
    if (next.length === 0) {
      input.checked = true;
      return;
    }
    this._applyDraft(
      normalizeCardConfig({
        ...this._config,
        stage_flow: { ...this._config.stage_flow, [profile]: next },
      }),
      true,
    );
  };

  private readonly _handlePtzOverlayControlChange = (
    event: CustomEvent<SegmentedControlValueDetail>,
  ): void => {
    if (!this._config) return;
    const value = event.detail.value as PtzOverlayControl;
    if (
      value !== "none" &&
      value !== "start_closed" &&
      value !== "start_open"
    ) {
      return;
    }
    this._applyDraft(
      normalizeCardConfig({ ...this._config, ptz_overlay_control: value }),
      true,
    );
  };

  private readonly _handleMinimalCameraMenuPositionChange = (
    event: CustomEvent<SegmentedControlValueDetail>,
  ): void => {
    if (!this._config) return;
    const value = event.detail.value as MinimalCameraMenuPosition;
    if (value !== "top_left" && value !== "top_right") return;
    this._applyDraft(
      normalizeCardConfig({
        ...this._config,
        minimal_camera_menu_position: value,
      }),
      true,
    );
  };

  private readonly _handleAlertTakeoverModeChange = (
    event: CustomEvent<SegmentedControlValueDetail>,
  ): void => {
    if (!this._config) return;
    const value = event.detail.value as AlertTakeoverMode;
    if (
      value !== "off" &&
      value !== "alerts" &&
      value !== "detections" &&
      value !== "both"
    ) {
      return;
    }
    this._applyDraft(
      normalizeCardConfig({
        ...this._config,
        alert_detection_takeover: value,
      }),
      true,
    );
  };

  private readonly _handleSlideTransitionChange = (
    event: CustomEvent<SegmentedControlValueDetail>,
  ): void => {
    if (!this._config) return;
    const value = event.detail.value as SlideTransition;
    if (value !== "none" && value !== "slide" && value !== "fade") return;
    this._applyDraft(
      normalizeCardConfig({ ...this._config, slide_transition: value }),
      true,
    );
  };

  private readonly _handleSlideAdvanceTimeChange = (
    event: CustomEvent<SegmentedControlValueDetail>,
  ): void => {
    if (!this._config) return;
    const value = Number(event.detail.value) as SlideAdvanceSeconds;
    if (value !== 5 && value !== 10 && value !== 20 && value !== 30) return;
    this._applyDraft(
      normalizeCardConfig({ ...this._config, slide_advance_time: value }),
      true,
    );
  };

  private _applyDraft(nextConfig: CardConfig, commitConfig: boolean): void {
    const nextSignature = cardConfigSignature(nextConfig);
    const changed = !this._config || nextSignature !== this._configSignature;
    const nestedEdit = this._haEditor.isNestedCardEdit();
    if (changed) {
      if (this._config) this._trackSectionKeys(this._config, nextConfig);
      this._config = nextConfig;
      this._configSignature = nextSignature;
      this._syncDraftStatus();
      this.requestUpdate();

      if (this._dirtyContext && !nestedEdit) {
        updateDirtyState(this._dirtyContext, this._serializeDraft(nextConfig));
      }
    }

    if (
      commitConfig &&
      (nestedEdit ||
        (!this._dirtyContext && nextSignature !== this._baselineSignature))
    ) {
      this._dispatchConfigChange(nextConfig);
    }

    if (this._previewTimer) {
      clearTimeout(this._previewTimer);
    }
    if (changed) {
      if (commitConfig) {
        this._previewTimer = undefined;
        this._publishDraftPreview(nextConfig, nextSignature);
      } else {
        this._previewTimer = setTimeout(() => {
          this._previewTimer = undefined;
          this._publishDraftPreview(nextConfig, nextSignature);
          if (nestedEdit) this._dispatchConfigChange(nextConfig);
        }, EDITOR_TEXT_PREVIEW_DELAY_MS);
      }
    }
  }

  private _syncDraftStatus(): void {
    if (!this._baseline || !this._config) return;
    this._pendingSections.clear();
    for (const [key, section] of this._sectionKeys) {
      if (
        JSON.stringify(this._baseline[key]) !==
        JSON.stringify(this._config[key])
      ) {
        this._pendingSections.add(section);
      }
    }
    const interactionsChanged = !interactionSetsEqual(
      this._visibleOptionalInteractions,
      this._baselineOptionalInteractions,
    );
    if (interactionsChanged) {
      this._pendingSections.add("interactions");
    }
    const changed =
      this._configSignature !== this._baselineSignature || interactionsChanged;
    if (changed === this._draftStatusChanged) return;
    this._draftStatusChanged = changed;
    if (changed) {
      this._toasts.warning(this._t("editor.unsaved_changes"), {
        icon: "packageOutline",
        key: EDITOR_STATUS_KEY,
        persistent: true,
      });
    } else {
      this._toasts.success(this._t("editor.no_pending_changes"), {
        icon: "packageOutline",
        key: EDITOR_STATUS_KEY,
        persistent: true,
      });
    }
  }

  private _trackSectionKeys(previous: CardConfig, current: CardConfig): void {
    if (!this._openSection) return;
    for (const key in current) {
      if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
        this._sectionKeys.set(key, this._openSection);
      }
    }
  }

  private _t(
    ...parameters: Parameters<LocalizationController["localize"]>
  ): string {
    return this._localization.localize(...parameters);
  }

  private _publishDraftPreview(config: CardConfig, signature: string): void {
    this._publishPreview(signature === this._baselineSignature ? null : config);
  }

  private _publishPreview(config: CardConfig | null): void {
    window.dispatchEvent(
      new CustomEvent<PreviewDraftDetail>(EDITOR_PREVIEW_DRAFT_EVENT, {
        detail: {
          baselineSignature: this._baselineSignature,
          config,
        },
      }),
    );
  }

  private _dispatchConfigChange(config: CardConfig): void {
    const yamlConfig = this._serializeDraft(config);
    const signature = JSON.stringify(yamlConfig);
    if (signature === this._lastDispatchedConfigSignature) return;
    this._lastDispatchedConfigSignature = signature;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: yamlConfig },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private readonly _handleDocumentClick = (event: Event): void => {
    if (!this._config || !this._haEditor.isSaveClick(event)) {
      return;
    }
    const yamlConfig = this._serializeDraft(this._config);
    if (!this._haEditor.commitDraftForSave(yamlConfig)) {
      this._dispatchConfigChange(this._config);
    }
  };

  private _serializeDraft(
    config: CardConfig,
    visibleInteractions = this._visibleOptionalInteractions,
  ): YamlCardConfig {
    const yaml = toYamlCardConfig(config) as Record<string, unknown>;
    for (const name of visibleInteractions) {
      yaml[name] = config[name];
    }
    return yaml as YamlCardConfig;
  }

  static styles = [themeTokens, cardEditorStyles];
}

function eventString(event: ValueChangedEvent): string {
  return typeof event.detail.value === "string"
    ? event.detail.value.trim()
    : "";
}

function cameraConfigEquals(left: CameraConfig, right: CameraConfig): boolean {
  return (
    additionalCameraEqual(left.additional_camera, right.additional_camera) &&
    left.entity_id === right.entity_id &&
    left.connection === right.connection &&
    left.frigate_fallback === right.frigate_fallback &&
    left.group_name === right.group_name &&
    linkedLightsEqual(left.lights, right.lights) &&
    left.low_latency_hls === right.low_latency_hls &&
    left.ptz_enabled === right.ptz_enabled &&
    left.start_live_unmuted_pc_tablet === right.start_live_unmuted_pc_tablet &&
    left.start_live_unmuted_phone === right.start_live_unmuted_phone &&
    left.title === right.title &&
    left.two_way_talk_enabled === right.two_way_talk_enabled
  );
}

function additionalCameraEqual(
  left: CameraConfig["additional_camera"],
  right: CameraConfig["additional_camera"],
): boolean {
  return left?.entity_id === right?.entity_id && left?.layout === right?.layout;
}

function linkedLightsEqual(
  left: CameraConfig["lights"],
  right: CameraConfig["lights"],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (value, index) =>
        value.entity_id === right[index]?.entity_id &&
        value.icon === right[index]?.icon,
    )
  );
}

function interactionSetsEqual(
  left: ReadonlySet<OptionalInteractionName>,
  right: ReadonlySet<OptionalInteractionName>,
): boolean {
  return left.size === right.size && [...left].every((name) => right.has(name));
}

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, CardEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    [EDITOR_TAG]: CardEditor;
  }
}
