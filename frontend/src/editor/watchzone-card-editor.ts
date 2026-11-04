import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  cardConfigSignature,
  createDefaultCameraConfig,
  normalizeCardConfig,
  type CameraConfig,
  type CardConfig,
} from "../core/config";
import {
  ACCORDION_ITEM_TAG,
  ACCORDION_TAG,
  EDITOR_PREVIEW_DRAFT_EVENT,
  EDITOR_TAG,
  EDITOR_TEXT_PREVIEW_DELAY_MS,
  MAX_CAMERAS,
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
import { toYamlCardConfig, type YamlCardConfig } from "../core/yaml-config";
import { TalkSourceResolver } from "../providers/talk-source-resolver";
import { PtzSourceResolver } from "../providers/ptz-source-resolver";
import type { PtzCapability } from "../api/ptz";
import { themeTokens } from "../styles/theme-tokens";
import { ToastManager } from "../ui/toast-manager";
import { renderIcon } from "../ui/icons";
import type { SortableReorderDetail } from "../ui/sortable-list";
import "../ui/accordion";
import "../ui/sortable-list";
import "../ui/toast-region";
import {
  type DirtyStateContext,
  requestDirtyStateContext,
  seedDirtyState,
  updateDirtyState,
} from "./dirty-state";
import { HomeAssistantEditorBridge } from "./home-assistant-editor-bridge";
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
const BOOLEAN_SELECTOR = { boolean: {} } as const;

const accordionTag = unsafeStatic(ACCORDION_TAG);
const accordionItemTag = unsafeStatic(ACCORDION_ITEM_TAG);
const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);
const sortableListTag = unsafeStatic(SORTABLE_LIST_TAG);
const sortableTileTag = unsafeStatic(SORTABLE_TILE_TAG);
const EDITOR_STATUS_KEY = "editor-draft-status";

type BooleanConfigFlag =
  | "camera_rounded_corners"
  | "camera_shadows"
  | "mobile_data_saving"
  | "outer_padding"
  | "outer_shadows"
  | "rounded_outer_corners";

type CameraBooleanConfigFlag = Exclude<keyof CameraConfig, "entity_id">;

export class CardEditor extends LitElement {
  private readonly _haEditor = new HomeAssistantEditorBridge<YamlCardConfig>(
    this,
  );
  private _baseline?: CardConfig;
  private _baselineSignature = "";
  private _config?: CardConfig;
  private _cameraBaseline?: CameraConfig;
  private _cameraDraft?: CameraConfig;
  private _talkCapability?: boolean;
  private _talkCapabilityGeneration = 0;
  private _talkCapabilityPending = false;
  private _ptzCapability?: PtzCapability;
  private _ptzCapabilityGeneration = 0;
  private _ptzCapabilityPending = false;
  private _editingCameraIndex?: number;
  private _dirtyContext?: DirtyStateContext<YamlCardConfig>;
  private _dirtySeeded = false;
  private _hass?: HomeAssistant;
  private _previewTimer?: ReturnType<typeof setTimeout>;
  private readonly _toasts = new ToastManager(this);
  private readonly _talkResolver = new TalkSourceResolver();
  private readonly _ptzResolver = new PtzSourceResolver();
  private readonly _localization = new LocalizationController(this, () =>
    this._syncDraftStatus(),
  );

  public set hass(value: unknown) {
    if (!isHomeAssistant(value)) {
      return;
    }
    const firstAssignment = !this._hass;
    this._hass = value;
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
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>(
      ".camera-editor-dialog",
    );
    if (!dialog) return;
    if (this._cameraDraft && !dialog.open) dialog.showModal();
    else if (!this._cameraDraft && dialog.open) dialog.close();
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
      </${accordionTag}>
      ${this._renderCameraDialog()}
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
        aria-label=${this._t("editor.configured_cameras")}
      >
        ${cameras.map(
          (camera, index) => staticHtml`<${sortableTileTag}
            item-key=${camera.entity_id}
            .localize=${this._localization.localize}
          >
            <div class="camera-tile-copy">
              <span>${this._cameraName(camera.entity_id)}</span>
              <small>${this._cameraSummary(camera)}</small>
            </div>
            <button
              slot="actions"
              class="tile-action"
              type="button"
              aria-label=${this._t("editor.edit_camera_named", {
                name: this._cameraName(camera.entity_id),
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
              aria-label=${this._t("editor.delete_camera_named", {
                name: this._cameraName(camera.entity_id),
              })}
              data-camera-index=${String(index)}
              @click=${this._deleteCamera}
            >
              ${renderIcon("delete")}
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
    return html`
      <ha-input
        required
        auto-validate
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
    `;
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
    `;
  }

  private _renderCameraDialog() {
    const camera = this._cameraDraft;
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
          <button
            class="dialog-close"
            type="button"
            aria-label=${this._t("editor.close_camera_editor")}
            @click=${this._cancelCameraEdit}
          >
            ×
          </button>
        </header>
        <div class="camera-dialog-content">
          <section>
            <h3>${this._t("editor.camera")}</h3>
            <ha-selector
              label=${this._t("editor.camera")}
              .hass=${this._hass}
              .selector=${CAMERA_SELECTOR}
              .value=${camera?.entity_id ?? ""}
              .required=${true}
              @value-changed=${this._handleCameraEntityChange}
            ></ha-selector>
          </section>
          <section>
            <h3>${this._t("editor.live_connection")}</h3>
            ${this._renderCameraBoolean(
              "low_latency_hls",
              this._t("editor.low_latency_hls"),
              camera?.low_latency_hls ?? true,
            )}
          </section>
          <section>
            <h3>${this._t("editor.camera_audio")}</h3>
            ${this._renderCameraBoolean(
              "start_live_unmuted_pc_tablet",
              this._t("editor.start_unmuted_pc_tablet"),
              camera?.start_live_unmuted_pc_tablet ?? false,
            )}
            ${this._renderCameraBoolean(
              "start_live_unmuted_phone",
              this._t("editor.start_unmuted_phone"),
              camera?.start_live_unmuted_phone ?? false,
            )}
          </section>
          <section>
            <h3>${this._t("editor.two_way_talk")}</h3>
            ${
              this._talkCapability === true
                ? this._renderCameraBoolean(
                    "two_way_talk_enabled",
                    this._t("editor.enable_two_way_talk"),
                    camera?.two_way_talk_enabled ?? false,
                  )
                : nothing
            }
            <small class="capability-status">
              ${
                this._talkCapabilityPending
                  ? this._t("editor.checking_two_way_talk")
                  : this._talkCapability === true
                    ? this._t("editor.two_way_talk_available")
                    : this._t("editor.two_way_talk_unavailable")
              }
            </small>
          </section>
          <section>
            <h3>${this._t("editor.ptz")}</h3>
            ${
              this._ptzCapability?.supported === true
                ? this._renderCameraBoolean(
                    "ptz_enabled",
                    this._t("editor.enable_ptz"),
                    camera?.ptz_enabled ?? false,
                  )
                : nothing
            }
            <small class="capability-status">
              ${
                this._ptzCapabilityPending
                  ? this._t("editor.checking_ptz")
                  : this._ptzCapability?.supported === true
                    ? this._t("editor.ptz_available")
                    : this._t("editor.ptz_unavailable")
              }
            </small>
          </section>
        </div>
        <footer>
          <ha-button
            appearance="plain"
            variant="neutral"
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
      .required=${false}
      .disabled=${disabled}
      @value-changed=${this._handleCameraBooleanChange}
    ></ha-selector>`;
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
      .required=${false}
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
    this._updateTitle((event.currentTarget as InputElement).value, false);
  }

  private _handleTitleChange(event: Event): void {
    this._updateTitle((event.currentTarget as InputElement).value, true);
  }

  private _updateTitle(rawTitle: string, commitConfig: boolean): void {
    const title = rawTitle.trim();
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
    const value =
      typeof event.detail.value === "string" ? event.detail.value.trim() : "";
    this._cameraDraft = { ...this._cameraDraft, entity_id: value };
    this._checkTalkCapability(value);
    this._checkPtzCapability(value);
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

  private readonly _addCamera = (): void => {
    if ((this._config?.cameras.length ?? 0) >= MAX_CAMERAS) return;
    this._editingCameraIndex = undefined;
    this._cameraBaseline = undefined;
    this._cameraDraft = createDefaultCameraConfig();
    this._talkCapability = undefined;
    this._talkCapabilityPending = false;
    this._ptzCapability = undefined;
    this._ptzCapabilityPending = false;
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
    this._checkTalkCapability(camera.entity_id);
    this._checkPtzCapability(camera.entity_id);
    this.requestUpdate();
  };

  private readonly _deleteCamera = (event: Event): void => {
    const index = Number(
      (event.currentTarget as HTMLElement).dataset.cameraIndex,
    );
    if (!this._config?.cameras[index]) return;
    const cameras = [...this._config.cameras];
    cameras.splice(index, 1);
    this._applyCameraList(cameras);
  };

  private readonly _cancelCameraEdit = (event: Event): void => {
    event.preventDefault();
    this._cameraBaseline = undefined;
    this._cameraDraft = undefined;
    this._talkCapabilityGeneration += 1;
    this._talkCapability = undefined;
    this._talkCapabilityPending = false;
    this._ptzCapabilityGeneration += 1;
    this._ptzCapability = undefined;
    this._ptzCapabilityPending = false;
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
    this._editingCameraIndex = undefined;
    this._applyCameraList(cameras);
  };

  private readonly _handleCameraReorder = (
    event: CustomEvent<SortableReorderDetail>,
  ): void => {
    if (!this._config || event.target === this) return;
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
    const friendlyName = this._hass?.states[entityId]?.attributes.friendly_name;
    if (typeof friendlyName === "string" && friendlyName.trim())
      return friendlyName;
    return entityId.startsWith("camera.")
      ? entityId.slice("camera.".length).replaceAll("_", " ")
      : entityId;
  }

  private _checkTalkCapability(entityId: string): void {
    const generation = ++this._talkCapabilityGeneration;
    this._talkCapability = undefined;
    if (!this._hass || !entityId.startsWith("camera.")) {
      this._talkCapabilityPending = false;
      this.requestUpdate();
      return;
    }
    this._talkCapabilityPending = true;
    this.requestUpdate();
    void this._talkResolver
      .supports(createHomeAssistantApi(this._hass), entityId)
      .then((supported) => {
        if (generation !== this._talkCapabilityGeneration) return;
        this._talkCapability = supported;
      })
      .catch(() => {
        if (generation !== this._talkCapabilityGeneration) return;
        this._talkCapability = false;
      })
      .finally(() => {
        if (generation !== this._talkCapabilityGeneration) return;
        this._talkCapabilityPending = false;
        this.requestUpdate();
      });
  }

  private _checkPtzCapability(entityId: string): void {
    const generation = ++this._ptzCapabilityGeneration;
    this._ptzCapability = undefined;
    if (!this._hass || !entityId.startsWith("camera.")) {
      this._ptzCapabilityPending = false;
      this.requestUpdate();
      return;
    }
    this._ptzCapabilityPending = true;
    this.requestUpdate();
    void this._ptzResolver
      .capability(
        createHomeAssistantApi(this._hass),
        "home_assistant",
        entityId,
      )
      .then((capability) => {
        if (generation !== this._ptzCapabilityGeneration) return;
        this._ptzCapability = capability;
      })
      .catch(() => {
        if (generation !== this._ptzCapabilityGeneration) return;
        this._ptzCapability = undefined;
      })
      .finally(() => {
        if (generation !== this._ptzCapabilityGeneration) return;
        this._ptzCapabilityPending = false;
        this.requestUpdate();
      });
  }

  private _cameraSummary(camera: CameraConfig): string {
    const connection = camera.low_latency_hls
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

function cameraConfigEquals(left: CameraConfig, right: CameraConfig): boolean {
  return (
    left.entity_id === right.entity_id &&
    left.low_latency_hls === right.low_latency_hls &&
    left.ptz_enabled === right.ptz_enabled &&
    left.start_live_unmuted_pc_tablet === right.start_live_unmuted_pc_tablet &&
    left.start_live_unmuted_phone === right.start_live_unmuted_phone &&
    left.two_way_talk_enabled === right.two_way_talk_enabled
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
