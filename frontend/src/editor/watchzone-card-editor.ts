import { html, LitElement, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  cardConfigSignature,
  createDefaultCameraConfig,
  normalizeCameraTitle,
  normalizeCardConfig,
  normalizeCardTitle,
  sanitizeCameraTitleInput,
  sanitizeCardTitleInput,
  type AlertTakeoverMode,
  type CameraConfig,
  type CardConfig,
  type FrigateFallbackTransport,
  type LiveConnectionType,
  type PtzOverlayControl,
  type SlideTransition,
} from "../core/config";
import {
  ACCORDION_ITEM_TAG,
  ACCORDION_TAG,
  DEFAULT_EVENT_HISTORY_DAYS,
  EDITOR_GENERAL_INFO_TAG,
  EDITOR_PREVIEW_DRAFT_EVENT,
  EDITOR_TAG,
  EDITOR_TEXT_PREVIEW_DELAY_MS,
  MAX_CAMERA_TITLE_LENGTH,
  MAX_CARD_TITLE_LENGTH,
  MAX_CAMERAS,
  MAX_EVENT_HISTORY_DAYS,
  MAX_LIGHTS_PER_CAMERA,
  MIN_EVENT_HISTORY_DAYS,
  SORTABLE_LIST_TAG,
  SORTABLE_REORDER_EVENT,
  SORTABLE_TILE_TAG,
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
import { themeTokens } from "../styles/theme-tokens";
import { ToastManager } from "../ui/toast-manager";
import { iconPath, renderIcon } from "../ui/icons";
import type {
  SegmentedControlOption,
  SegmentedControlValueDetail,
} from "../ui/segmented-control";
import type { SortableReorderDetail } from "../ui/sortable-list";
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
import { cardEditorStyles } from "./watchzone-card-editor.styles";

interface InputElement extends HTMLElement {
  value: string;
}

interface PreviewDraftDetail {
  readonly baselineSignature: string;
  readonly config: CardConfig | null;
}

interface ValueChangedEvent extends Event {
  readonly detail: { readonly value?: unknown };
}

interface SelectorElement extends HTMLElement {
  hass?: HomeAssistant;
}

const CAMERA_SELECTOR = {
  entity: { filter: { domain: "camera" } },
} as const;
const LIGHT_SELECTOR = {
  entity: { filter: { domain: "light" } },
} as const;
const ICON_SELECTOR = { icon: {} } as const;
const BOOLEAN_SELECTOR = { boolean: {} } as const;
const EVENT_HISTORY_DAYS_SELECTOR = {
  number: {
    max: MAX_EVENT_HISTORY_DAYS,
    min: MIN_EVENT_HISTORY_DAYS,
    mode: "box",
    step: 1,
  },
} as const;
const DEFAULT_LIGHT_ICON = "mdi:lightbulb";

const accordionTag = unsafeStatic(ACCORDION_TAG);
const accordionItemTag = unsafeStatic(ACCORDION_ITEM_TAG);
const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);
const generalInfoTag = unsafeStatic(EDITOR_GENERAL_INFO_TAG);
const sortableListTag = unsafeStatic(SORTABLE_LIST_TAG);
const sortableTileTag = unsafeStatic(SORTABLE_TILE_TAG);
const EDITOR_STATUS_KEY = "editor-draft-status";

void import("../ui/sortable-list");
void import("./general-settings-info");

type BooleanConfigFlag =
  | "camera_bar_rounded_corners"
  | "camera_bar_shadows"
  | "camera_rounded_corners"
  | "camera_shadows"
  | "display_event_type_badges"
  | "display_object_badges"
  | "display_zone"
  | "event_rounded_corners"
  | "event_shadows"
  | "highlight_camera_on_activity"
  | "start_alert_takeover_on"
  | "view_timelapse_on_thumbnail_hover"
  | "mobile_data_saving"
  | "outer_padding"
  | "outer_shadows"
  | "rounded_outer_corners";

type CameraBooleanConfigFlag = Exclude<
  keyof CameraConfig,
  "connection" | "entity_id" | "frigate_fallback" | "lights" | "title"
>;

export class CardEditor extends LitElement {
  private readonly _haEditor = new HomeAssistantEditorBridge<YamlCardConfig>(
    this,
  );
  private _baseline?: CardConfig;
  private _baselineSignature = "";
  private _config?: CardConfig;
  private _cameraBaseline?: CameraConfig;
  private _cameraDraft?: CameraConfig;
  private _cameraTitleInput = "";
  private _addingLight = false;
  private _pendingLightEntityId = "";
  private _pendingLightIcon = DEFAULT_LIGHT_ICON;
  private _pendingRemoveCameraIndex?: number;
  private _editingCameraIndex?: number;
  private _dirtyContext?: DirtyStateContext<YamlCardConfig>;
  private _dirtySeeded = false;
  private _hass?: HomeAssistant;
  private _previewTimer?: ReturnType<typeof setTimeout>;
  private readonly _toasts = new ToastManager(this);
  private _capabilities?: CameraCapabilityController;
  private _capabilitiesLoad?: Promise<CameraCapabilityController>;
  private readonly _localization = new LocalizationController(this, () =>
    this._syncDraftStatus(),
  );
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
    const signature = cardConfigSignature(config);

    if (!this._baseline) {
      this._baseline = config;
      this._baselineSignature = signature;
      this._config = config;
      this._syncDraftStatus();
      this._seedDirtyState();
      this.requestUpdate();
      return;
    }

    if (signature === cardConfigSignature(this._config ?? this._baseline)) {
      return;
    }

    this._config = config;
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
  }

  public disconnectedCallback(): void {
    document.removeEventListener("click", this._handleDocumentClick, true);
    this.removeEventListener(
      SORTABLE_REORDER_EVENT,
      this._handleCameraReorder as EventListener,
    );
    this._dirtyContext = undefined;
    this._dirtySeeded = false;
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
  }

  protected render() {
    return staticHtml`
      <${toastRegionTag}
        class="editor-status"
        mode="inline"
        .notices=${this._toasts.notices}
      ></${toastRegionTag}>
      <${accordionTag}>
        <${accordionItemTag}
          heading=${this._t("editor.camera_settings")}
          item-key="camera"
          .icon=${"camera"}
        >
          ${this._renderCameraSettings()}
        </${accordionItemTag}>
        <${accordionItemTag}
          heading=${this._t("editor.live_media_player")}
          item-key="live-media-player"
          .icon=${"play"}
        >
          ${this._renderLiveMediaPlayerSettings()}
        </${accordionItemTag}>
        <${accordionItemTag}
          heading=${this._t("editor.recorded_media_player")}
          item-key="recorded-media-player"
          .icon=${"events"}
        ></${accordionItemTag}>
        <${accordionItemTag}
          heading=${this._t("editor.reviews")}
          item-key="reviews"
          .icon=${"reviews"}
        >
          ${this._renderReviewSettings()}
        </${accordionItemTag}>
        <${accordionItemTag}
          heading=${this._t("editor.general_settings")}
          item-key="general"
          .icon=${"settings"}
        >
          ${this._renderGeneralSettings()}
        </${accordionItemTag}>
        <${accordionItemTag}
          heading=${this._t("editor.layout_settings")}
          item-key="layout"
          .icon=${"layout"}
        >
          ${this._renderLayoutSettings()}
        </${accordionItemTag}>
        <${accordionItemTag}
          heading=${this._t("editor.display_settings")}
          item-key="display"
          .icon=${"tune"}
        >
          ${this._renderDisplaySettings()}
        </${accordionItemTag}>
      </${accordionTag}>
      ${this._renderCameraDialog()}
      ${this._renderRemoveCameraDialog()}
    `;
  }

  private _renderCameraSettings() {
    const cameras = this._config?.cameras ?? [];
    return staticHtml`<div class="camera-list-heading">
        <strong>${this._t("editor.cameras")}</strong>
        <span>${this._t("editor.camera_count", {
          count: cameras.length,
          maximum: MAX_CAMERAS,
        })}</span>
      </div>
      <${sortableListTag}
        data-sortable-scope="cameras"
        aria-label=${this._t("editor.configured_cameras")}
      >
        ${repeat(
          cameras,
          (camera) => camera.entity_id,
          (camera, index) => staticHtml`<${sortableTileTag}
            item-key=${camera.entity_id}
            .localize=${this._localization.localize}
          >
            <div class="camera-tile-copy">
              <span>${camera.title || this._cameraName(camera.entity_id)}</span>
              <small>${this._cameraSummary(camera)}</small>
            </div>
            <button
              slot="actions"
              class="tile-action"
              type="button"
              title=${this._t("editor.edit_camera")}
              aria-label=${this._t("editor.edit_camera_named", {
                name: camera.title || this._cameraName(camera.entity_id),
              })}
              data-camera-index=${String(index)}
              @click=${this._editCamera}
            >
              ${renderIcon("edit")}
            </button>
            <button
              slot="actions"
              class="tile-action"
              type="button"
              title=${this._t("editor.remove_camera")}
              aria-label=${this._t("editor.remove_camera_named", {
                name: camera.title || this._cameraName(camera.entity_id),
              })}
              data-camera-index=${String(index)}
              @click=${this._requestRemoveCamera}
            >
              ${renderIcon("remove")}
            </button>
          </${sortableTileTag}>`,
        )}
      </${sortableListTag}>
      <button
        class="add-camera"
        type="button"
        ?disabled=${cameras.length >= MAX_CAMERAS}
        @click=${this._addCamera}
      >
        ${this._t("editor.add_camera")}
      </button>`;
  }

  private _renderGeneralSettings() {
    return staticHtml`
      <${generalInfoTag}
        .hass=${this._hass}
      ></${generalInfoTag}>
      <ha-input
        required
        auto-validate
        maxlength=${String(MAX_CARD_TITLE_LENGTH)}
        label=${this._t("editor.title")}
        .value=${this._config?.title ?? ""}
        @input=${this._handleTitleInput}
        @change=${this._handleTitleChange}
      ></ha-input>
      ${this._renderBooleanOption(
        "mobile_data_saving",
        this._t("editor.mobile_data_saving"),
        this._config?.mobile_data_saving === true,
      )}
      <ha-selector
        label=${this._t("editor.event_history_days")}
        .hass=${this._hass}
        .selector=${EVENT_HISTORY_DAYS_SELECTOR}
        .value=${this._config?.event_history_days ?? DEFAULT_EVENT_HISTORY_DAYS}
        @value-changed=${this._handleEventHistoryDaysChange}
      ></ha-selector>
    `;
  }

  private _renderLiveMediaPlayerSettings() {
    const takeoverSelected = this._config?.alert_detection_takeover ?? "both";
    const ptzSelected = this._config?.ptz_overlay_control ?? "start_open";
    const ptzOptions: readonly SegmentedControlOption[] = [
      { label: this._t("editor.ptz_overlay_none"), value: "none" },
      {
        label: this._t("editor.ptz_overlay_start_closed"),
        value: "start_closed",
      },
      {
        label: this._t("editor.ptz_overlay_start_open"),
        value: "start_open",
      },
      {
        disabled: true,
        label: this._t("editor.ptz_overlay_open_in_drawer"),
        value: "open_in_drawer",
      },
    ];
    return html`
      ${this._renderBooleanOption(
        "highlight_camera_on_activity",
        this._t("editor.highlight_camera_on_activity"),
        this._config?.highlight_camera_on_activity !== false,
      )}
      <div class="segmented-setting">
        <span class="segmented-setting-label">
          ${this._t("editor.alert_detection_takeover")}
        </span>
        <span class="segmented-setting-description">
          ${this._t("editor.alert_detection_takeover_description")}
        </span>
        <wzc-segmented-control
          class="editor-segmented-control"
          data-setting="alert-detection-takeover"
          appearance="compact"
          .label=${this._t("editor.alert_detection_takeover")}
          .options=${
            [
              {
                label: this._t("editor.alert_detection_takeover_off"),
                value: "off",
              },
              {
                label: this._t("editor.alert_detection_takeover_alerts"),
                value: "alerts",
              },
              {
                label: this._t("editor.alert_detection_takeover_detections"),
                value: "detections",
              },
              {
                label: this._t("editor.alert_detection_takeover_both"),
                value: "both",
              },
            ] satisfies readonly SegmentedControlOption[]
          }
          .value=${takeoverSelected}
          @wzc-segmented-control-value=${this._handleAlertTakeoverModeChange}
        ></wzc-segmented-control>
      </div>
      ${this._renderBooleanOption(
        "start_alert_takeover_on",
        this._t("editor.start_alert_takeover_on"),
        this._config?.start_alert_takeover_on === true,
      )}
      <div class="segmented-setting">
        <span class="segmented-setting-label" id="ptz-overlay-control-label">
          ${this._t("editor.ptz_overlay_control")}
        </span>
        <wzc-segmented-control
          class="editor-segmented-control"
          data-setting="ptz-overlay-control"
          appearance="compact"
          .label=${this._t("editor.ptz_overlay_control")}
          .options=${ptzOptions}
          .value=${ptzSelected}
          @wzc-segmented-control-value=${this._handlePtzOverlayControlChange}
        ></wzc-segmented-control>
      </div>
      <div class="segmented-setting">
        <span class="segmented-setting-label">
          ${this._t("editor.slide_transition")}
        </span>
        <wzc-segmented-control
          class="editor-segmented-control"
          data-setting="slide-transition"
          appearance="compact"
          .label=${this._t("editor.slide_transition")}
          .options=${
            [
              {
                label: this._t("editor.slide_transition_none"),
                value: "none",
              },
              {
                label: this._t("editor.slide_transition_slide"),
                value: "slide",
              },
              {
                label: this._t("editor.slide_transition_fade"),
                value: "fade",
              },
            ] satisfies readonly SegmentedControlOption[]
          }
          .value=${this._config?.slide_transition ?? "slide"}
          @wzc-segmented-control-value=${this._handleSlideTransitionChange}
        ></wzc-segmented-control>
      </div>
    `;
  }

  private _renderReviewSettings() {
    return this._renderBooleanOption(
      "view_timelapse_on_thumbnail_hover",
      this._t("editor.view_timelapse_on_thumbnail_hover"),
      this._config?.view_timelapse_on_thumbnail_hover !== false,
    );
  }

  private _renderLayoutSettings() {
    return html`
      ${this._renderBooleanOption(
        "rounded_outer_corners",
        this._t("editor.rounded_outer_corners"),
        this._config?.rounded_outer_corners !== false,
      )}
      ${this._renderBooleanOption(
        "outer_shadows",
        this._t("editor.outer_shadows"),
        this._config?.outer_shadows !== false,
      )}
      ${this._renderBooleanOption(
        "outer_padding",
        this._t("editor.outer_padding"),
        this._config?.outer_padding !== false,
      )}
      ${this._renderBooleanOption(
        "camera_rounded_corners",
        this._t("editor.camera_rounded_corners"),
        this._config?.camera_rounded_corners !== false,
      )}
      ${this._renderBooleanOption(
        "camera_shadows",
        this._t("editor.camera_shadows"),
        this._config?.camera_shadows !== false,
      )}
      ${this._renderBooleanOption(
        "camera_bar_rounded_corners",
        this._t("editor.camera_bar_rounded_corners"),
        this._config?.camera_bar_rounded_corners !== false,
      )}
      ${this._renderBooleanOption(
        "camera_bar_shadows",
        this._t("editor.camera_bar_shadows"),
        this._config?.camera_bar_shadows !== false,
      )}
      ${this._renderBooleanOption(
        "event_rounded_corners",
        this._t("editor.event_rounded_corners"),
        this._config?.event_rounded_corners !== false,
      )}
      ${this._renderBooleanOption(
        "event_shadows",
        this._t("editor.event_shadows"),
        this._config?.event_shadows !== false,
      )}
    `;
  }

  private _renderDisplaySettings() {
    return html`
      ${this._renderBooleanOption(
        "display_object_badges",
        this._t("editor.display_object_badges"),
        this._config?.display_object_badges !== false,
      )}
      ${this._renderBooleanOption(
        "display_event_type_badges",
        this._t("editor.display_event_type_badges"),
        this._config?.display_event_type_badges !== false,
      )}
      ${this._renderBooleanOption(
        "display_zone",
        this._t("editor.display_zone"),
        this._config?.display_zone !== false,
      )}
    `;
  }

  private _renderCameraDialog() {
    const camera = this._cameraDraft;
    const capabilities = this._capabilities;
    const editing = this._editingCameraIndex !== undefined;
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
                  initial-open="camera"
                >
                  <${accordionItemTag}
                    density="compact"
                    heading=${this._t("editor.camera")}
                    item-key="camera"
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
                    </div>
                  </${accordionItemTag}>
                  <${accordionItemTag}
                    density="compact"
                    heading=${this._t("editor.connection_source")}
                    item-key="connection"
                    summary-text=${this._connectionName(camera.connection)}
                  >
                    <div class="camera-section-fields">
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
                            ></ha-selector>`
                      }
                    </div>
                  </${accordionItemTag}>
                  <${accordionItemTag}
                    density="compact"
                    heading=${this._t("editor.additional_camera")}
                    item-key="additional-camera"
                    summary-text=${this._t("editor.not_configured")}
                  >
                    <p class="empty-camera-section">
                      ${this._t("editor.no_settings_available")}
                    </p>
                  </${accordionItemTag}>
                  <${accordionItemTag}
                    density="compact"
                    heading=${this._t("editor.lights")}
                    item-key="lights"
                    summary-text=${
                      camera.lights.length
                        ? this._t("editor.light_count", {
                            count: camera.lights.length,
                            maximum: MAX_LIGHTS_PER_CAMERA,
                          })
                        : this._t("editor.not_configured")
                    }
                  >
                    ${this._renderLightSettings(camera)}
                  </${accordionItemTag}>
                  <${accordionItemTag}
                    density="compact"
                    heading=${this._t("editor.options_controls")}
                    item-key="options"
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
                      <div class="capability-option">
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
                                ? this._t("editor.two_way_talk_available")
                                : this._t("editor.two_way_talk_unavailable")
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
                      </div>
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
    const name = camera
      ? camera.title || this._cameraName(camera.entity_id)
      : "";
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

  private _renderBooleanOption(
    key: BooleanConfigFlag,
    label: string,
    value: boolean,
  ) {
    return html`<ha-selector
      class="boolean-option"
      data-config-key=${key}
      label=${label}
      .hass=${this._hass}
      .selector=${BOOLEAN_SELECTOR}
      .value=${value}
      @value-changed=${this._handleBooleanChange}
    ></ha-selector>`;
  }

  private _seedDirtyState(): void {
    if (this._dirtyContext && this._baseline && !this._dirtySeeded) {
      this._dirtySeeded = true;
      seedDirtyState(this._dirtyContext, toYamlCardConfig(this._baseline));
      if (
        this._config &&
        cardConfigSignature(this._config) !== this._baselineSignature
      ) {
        updateDirtyState(this._dirtyContext, toYamlCardConfig(this._config));
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
    this._cameraBaseline = undefined;
    this._cameraDraft = createDefaultCameraConfig();
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
    const camera = this._config?.cameras[index];
    if (!camera) return;
    this._editingCameraIndex = index;
    this._cameraBaseline = camera;
    this._cameraDraft = { ...camera };
    this._cameraTitleInput = camera.title;
    this._cancelAddingLight();
    this._checkCapabilities(camera.entity_id, camera.connection);
    this.requestUpdate();
  };

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
    cameras.splice(index, 1);
    this._pendingRemoveCameraIndex = undefined;
    this._applyCameraList(cameras);
  };

  private readonly _cancelCameraEdit = (event: Event): void => {
    event.preventDefault();
    this._cameraBaseline = undefined;
    this._cameraDraft = undefined;
    this._cameraTitleInput = "";
    this._cancelAddingLight();
    this._capabilities?.reset();
    this._editingCameraIndex = undefined;
    this.requestUpdate();
  };

  private readonly _saveCameraEdit = (event: Event): void => {
    event.preventDefault();
    if (!this._config || !this._cameraDraftCanCommit() || !this._cameraDraft)
      return;
    const cameras = [...this._config.cameras];
    if (this._editingCameraIndex === undefined) cameras.push(this._cameraDraft);
    else cameras[this._editingCameraIndex] = this._cameraDraft;
    this._cameraBaseline = undefined;
    this._cameraDraft = undefined;
    this._cameraTitleInput = "";
    this._cancelAddingLight();
    this._editingCameraIndex = undefined;
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
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= this._config.cameras.length ||
      toIndex >= this._config.cameras.length
    )
      return;
    const cameras = [...this._config.cameras];
    const [camera] = cameras.splice(fromIndex, 1);
    if (!camera) return;
    cameras.splice(toIndex, 0, camera);
    this._applyCameraList(cameras);
  };

  private _applyCameraList(cameras: readonly CameraConfig[]): void {
    if (!this._config) return;
    this._applyDraft(normalizeCardConfig({ ...this._config, cameras }), true);
  }

  private _cameraDraftIsValid(): boolean {
    const draft = this._cameraDraft;
    if (!draft?.entity_id.startsWith("camera.")) return false;
    return !(
      this._config?.cameras.some(
        (camera, index) =>
          camera.entity_id === draft.entity_id &&
          index !== this._editingCameraIndex,
      ) ?? false
    );
  }

  private _cameraDraftCanCommit(): boolean {
    if (!this._cameraDraftIsValid() || !this._cameraDraft) return false;
    if (!this._cameraBaseline) return true;
    return !cameraConfigEquals(this._cameraDraft, this._cameraBaseline);
  }

  private _cameraName(entityId: string): string {
    return this._entityName(entityId).replace(/^camera\./, "");
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

  private _cameraSummary(camera: CameraConfig): string {
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
    const audio = [
      camera.start_live_unmuted_pc_tablet
        ? this._t("editor.pc_tablet")
        : undefined,
      camera.start_live_unmuted_phone
        ? this._t("editor.mobile_phone")
        : undefined,
    ].filter(Boolean);
    const talk = camera.two_way_talk_enabled
      ? ` · ${this._t("editor.two_way_talk")}`
      : "";
    const ptz = camera.ptz_enabled ? ` · ${this._t("editor.ptz")}` : "";
    return `${connection} · ${
      audio.length
        ? this._t("editor.unmuted", { devices: audio.join(", ") })
        : this._t("editor.muted")
    }${talk}${ptz}`;
  }

  private readonly _handleBooleanChange = (event: ValueChangedEvent): void => {
    if (!this._config) {
      return;
    }
    const key = (event.currentTarget as HTMLElement).dataset.configKey as
      BooleanConfigFlag | undefined;
    if (!key) {
      return;
    }
    if (typeof event.detail.value !== "boolean") {
      return;
    }
    const next: Record<string, unknown> = {
      ...this._config,
      [key]: event.detail.value,
    };
    this._applyDraft(normalizeCardConfig(next), true);
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

  private _applyDraft(nextConfig: CardConfig, commitConfig: boolean): void {
    const changed =
      !this._config ||
      cardConfigSignature(nextConfig) !== cardConfigSignature(this._config);
    if (changed) {
      this._config = nextConfig;
      this._syncDraftStatus();
      this.requestUpdate();

      if (this._dirtyContext) {
        updateDirtyState(this._dirtyContext, toYamlCardConfig(nextConfig));
      }
    }

    if (
      commitConfig &&
      !this._dirtyContext &&
      cardConfigSignature(nextConfig) !== this._baselineSignature
    ) {
      this._dispatchConfigChange(nextConfig);
    }

    if (this._previewTimer) {
      clearTimeout(this._previewTimer);
    }
    if (changed) {
      if (commitConfig) {
        this._previewTimer = undefined;
        this._publishDraftPreview(nextConfig);
      } else {
        this._previewTimer = setTimeout(() => {
          this._previewTimer = undefined;
          this._publishDraftPreview(nextConfig);
        }, EDITOR_TEXT_PREVIEW_DELAY_MS);
      }
    }
  }

  private _syncDraftStatus(): void {
    if (!this._baseline || !this._config) return;
    const changed =
      cardConfigSignature(this._config) !== this._baselineSignature;
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

  private _t(
    ...parameters: Parameters<LocalizationController["localize"]>
  ): string {
    return this._localization.localize(...parameters);
  }

  private _publishDraftPreview(config: CardConfig): void {
    this._publishPreview(
      cardConfigSignature(config) === this._baselineSignature ? null : config,
    );
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
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: toYamlCardConfig(config) },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private readonly _handleDocumentClick = (event: Event): void => {
    if (!this._config || !this._haEditor.isSaveClick(event)) {
      return;
    }
    const yamlConfig = toYamlCardConfig(this._config);
    if (!this._haEditor.commitDraftForSave(yamlConfig)) {
      this._dispatchConfigChange(this._config);
    }
  };

  static styles = [themeTokens, cardEditorStyles];
}

function eventString(event: ValueChangedEvent): string {
  return typeof event.detail.value === "string"
    ? event.detail.value.trim()
    : "";
}

function cameraConfigEquals(left: CameraConfig, right: CameraConfig): boolean {
  return (
    left.entity_id === right.entity_id &&
    left.connection === right.connection &&
    left.frigate_fallback === right.frigate_fallback &&
    linkedLightsEqual(left.lights, right.lights) &&
    left.low_latency_hls === right.low_latency_hls &&
    left.ptz_enabled === right.ptz_enabled &&
    left.start_live_unmuted_pc_tablet === right.start_live_unmuted_pc_tablet &&
    left.start_live_unmuted_phone === right.start_live_unmuted_phone &&
    left.title === right.title &&
    left.two_way_talk_enabled === right.two_way_talk_enabled
  );
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

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, CardEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    [EDITOR_TAG]: CardEditor;
  }
}
