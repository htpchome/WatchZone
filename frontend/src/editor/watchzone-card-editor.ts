import { html, LitElement } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  cardConfigSignature,
  normalizeCardConfig,
  type CardConfig,
} from "../core/config";
import {
  ACCORDION_ITEM_TAG,
  ACCORDION_TAG,
  EDITOR_PREVIEW_DRAFT_EVENT,
  EDITOR_TAG,
  EDITOR_TEXT_PREVIEW_DELAY_MS,
  TOAST_REGION_TAG,
} from "../core/constants";
import { isHomeAssistant, type HomeAssistant } from "../core/home-assistant";
import { toYamlCardConfig, type YamlCardConfig } from "../core/yaml-config";
import { themeTokens } from "../styles/theme-tokens";
import { ToastManager } from "../ui/toast-manager";
import "../ui/accordion";
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
const EDITOR_STATUS_KEY = "editor-draft-status";

type BooleanConfigFlag =
  | "camera_rounded_corners"
  | "camera_shadows"
  | "low_latency_hls"
  | "outer_padding"
  | "outer_shadows"
  | "rounded_outer_corners"
  | "start_live_unmuted_pc_tablet"
  | "start_live_unmuted_phone";

export class CardEditor extends LitElement {
  private readonly _haEditor = new HomeAssistantEditorBridge<YamlCardConfig>(
    this,
  );
  private _baseline?: CardConfig;
  private _baselineSignature = "";
  private _config?: CardConfig;
  private _dirtyContext?: DirtyStateContext<YamlCardConfig>;
  private _dirtySeeded = false;
  private _hass?: HomeAssistant;
  private _previewTimer?: ReturnType<typeof setTimeout>;
  private readonly _toasts = new ToastManager(this);

  public set hass(value: unknown) {
    if (!isHomeAssistant(value)) {
      return;
    }
    const firstAssignment = !this._hass;
    this._hass = value;
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
  }

  public disconnectedCallback(): void {
    document.removeEventListener("click", this._handleDocumentClick, true);
    this._dirtyContext = undefined;
    this._dirtySeeded = false;
    if (this._previewTimer) {
      clearTimeout(this._previewTimer);
      this._previewTimer = undefined;
    }
    this._publishPreview(null);
    super.disconnectedCallback();
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
          heading="Camera Settings"
          item-key="camera"
          .icon=${"camera"}
        >
          ${this._renderCameraSettings()}
        </${accordionItemTag}>
        <${accordionItemTag}
          heading="General Settings"
          item-key="general"
          .icon=${"settings"}
        >
          ${this._renderGeneralSettings()}
        </${accordionItemTag}>
        <${accordionItemTag}
          heading="Layout Settings"
          item-key="layout"
          .icon=${"layout"}
        >
          ${this._renderLayoutSettings()}
        </${accordionItemTag}>
        <${accordionItemTag}
          heading="Display Options"
          item-key="display"
          .icon=${"tune"}
        >
          ${this._renderDisplaySettings()}
        </${accordionItemTag}>
      </${accordionTag}>
    `;
  }

  private _renderCameraSettings() {
    return html`
      <ha-selector
        label="Camera"
        .hass=${this._hass}
        .selector=${CAMERA_SELECTOR}
        .value=${this._config?.camera_entity ?? ""}
        .required=${false}
        @value-changed=${this._handleCameraChange}
      ></ha-selector>
      <div class="section-title">Live Connection</div>
      <ha-selector
        class="boolean-option"
        data-config-key="low_latency_hls"
        label="Low-Latency HLS"
        .hass=${this._hass}
        .selector=${BOOLEAN_SELECTOR}
        .value=${this._config?.low_latency_hls !== false}
        .required=${false}
        @value-changed=${this._handleBooleanChange}
      ></ha-selector>
      <div class="section-title">Camera Audio</div>
      <ha-selector
        class="boolean-option"
        data-config-key="start_live_unmuted_pc_tablet"
        label="Start Live Unmuted on PC/Tablet"
        .hass=${this._hass}
        .selector=${BOOLEAN_SELECTOR}
        .value=${this._config?.start_live_unmuted_pc_tablet === true}
        .required=${false}
        @value-changed=${this._handleBooleanChange}
      ></ha-selector>
      <ha-selector
        class="boolean-option"
        data-config-key="start_live_unmuted_phone"
        label="Start Live Unmuted on Mobile Phone"
        .hass=${this._hass}
        .selector=${BOOLEAN_SELECTOR}
        .value=${this._config?.start_live_unmuted_phone === true}
        .required=${false}
        @value-changed=${this._handleBooleanChange}
      ></ha-selector>
    `;
  }

  private _renderGeneralSettings() {
    return html`<ha-input
      required
      auto-validate
      label="Title"
      .value=${this._config?.title ?? ""}
      @input=${this._handleTitleInput}
      @change=${this._handleTitleChange}
    ></ha-input>`;
  }

  private _renderLayoutSettings() {
    return html`
      ${this._renderBooleanOption(
        "rounded_outer_corners",
        "Rounded Outer Corners",
        this._config?.rounded_outer_corners !== false,
      )}
      ${this._renderBooleanOption(
        "outer_shadows",
        "Outer Shadows",
        this._config?.outer_shadows !== false,
      )}
      ${this._renderBooleanOption(
        "outer_padding",
        "Outer Padding",
        this._config?.outer_padding !== false,
      )}
    `;
  }

  private _renderDisplaySettings() {
    return html`
      ${this._renderBooleanOption(
        "camera_rounded_corners",
        "Camera Rounded Corners",
        this._config?.camera_rounded_corners !== false,
      )}
      ${this._renderBooleanOption(
        "camera_shadows",
        "Camera Shadows",
        this._config?.camera_shadows !== false,
      )}
    `;
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

  private readonly _handleCameraChange = (event: ValueChangedEvent): void => {
    if (!this._config) {
      return;
    }
    const value =
      typeof event.detail.value === "string"
        ? event.detail.value.trim()
        : undefined;
    const next = { ...this._config };
    if (value) {
      next.camera_entity = value;
    } else {
      delete next.camera_entity;
    }
    this._applyDraft(normalizeCardConfig(next), true);
  };

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
      this._toasts.warning(
        "Unsaved changes — use Home Assistant's Save button to apply them.",
        {
          icon: "packageOutline",
          key: EDITOR_STATUS_KEY,
          persistent: true,
        },
      );
    } else {
      this._toasts.success("No pending changes.", {
        icon: "packageOutline",
        key: EDITOR_STATUS_KEY,
        persistent: true,
      });
    }
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

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, CardEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    [EDITOR_TAG]: CardEditor;
  }
}
