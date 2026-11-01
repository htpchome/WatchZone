import { html, LitElement } from "lit";

import {
  cardConfigSignature,
  normalizeCardConfig,
  type WatchZoneCardConfig,
} from "../core/config";
import {
  EDITOR_PREVIEW_DRAFT_EVENT,
  EDITOR_TAG,
  EDITOR_TEXT_PREVIEW_DELAY_MS,
} from "../core/constants";
import { isHomeAssistant, type HomeAssistant } from "../core/home-assistant";
import {
  toYamlCardConfig,
  type WatchZoneYamlConfig,
} from "../core/yaml-config";
import { watchZoneThemeTokens } from "../styles/theme-tokens";
import {
  commitDraftForSave,
  type DirtyStateContext,
  isDialogSaveClick,
  requestDirtyStateContext,
  seedDirtyState,
  updateDirtyState,
} from "./dirty-state";
import { watchZoneCardEditorStyles } from "./watchzone-card-editor.styles";

interface InputElement extends HTMLElement {
  value: string;
}

interface PreviewDraftDetail {
  readonly baselineSignature: string;
  readonly config: WatchZoneCardConfig | null;
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

type BooleanConfigFlag =
  | "camera_rounded_corners"
  | "camera_shadows"
  | "outer_padding"
  | "outer_shadows"
  | "rounded_outer_corners"
  | "start_live_unmuted_pc_tablet"
  | "start_live_unmuted_phone";

export class WatchZoneCardEditor extends LitElement {
  private _baseline?: WatchZoneCardConfig;
  private _baselineSignature = "";
  private _config?: WatchZoneCardConfig;
  private _dirtyContext?: DirtyStateContext<WatchZoneYamlConfig>;
  private _dirtySeeded = false;
  private _hass?: HomeAssistant;
  private _previewTimer?: ReturnType<typeof setTimeout>;

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
      this._seedDirtyState();
      this.requestUpdate();
      return;
    }

    if (signature === cardConfigSignature(this._config ?? this._baseline)) {
      return;
    }

    this._config = config;
    this.requestUpdate();
  }

  public connectedCallback(): void {
    super.connectedCallback();
    requestDirtyStateContext<WatchZoneYamlConfig>(this, (context) => {
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
    return html`
      <ha-input
        required
        auto-validate
        label="Title"
        .value=${this._config?.title ?? ""}
        @input=${this._handleTitleInput}
        @change=${this._handleTitleChange}
      ></ha-input>
      <ha-selector
        label="Camera"
        .hass=${this._hass}
        .selector=${CAMERA_SELECTOR}
        .value=${this._config?.camera_entity ?? ""}
        .required=${false}
        @value-changed=${this._handleCameraChange}
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
      <div class="section-title">Appearance</div>
      <ha-selector
        class="boolean-option"
        data-config-key="rounded_outer_corners"
        label="Rounded Outer Corners"
        .hass=${this._hass}
        .selector=${BOOLEAN_SELECTOR}
        .value=${this._config?.rounded_outer_corners !== false}
        .required=${false}
        @value-changed=${this._handleBooleanChange}
      ></ha-selector>
      <ha-selector
        class="boolean-option"
        data-config-key="outer_shadows"
        label="Outer Shadows"
        .hass=${this._hass}
        .selector=${BOOLEAN_SELECTOR}
        .value=${this._config?.outer_shadows !== false}
        .required=${false}
        @value-changed=${this._handleBooleanChange}
      ></ha-selector>
      <ha-selector
        class="boolean-option"
        data-config-key="outer_padding"
        label="Outer Padding"
        .hass=${this._hass}
        .selector=${BOOLEAN_SELECTOR}
        .value=${this._config?.outer_padding !== false}
        .required=${false}
        @value-changed=${this._handleBooleanChange}
      ></ha-selector>
      <div class="section-title">Camera Appearance</div>
      <ha-selector
        class="boolean-option"
        data-config-key="camera_rounded_corners"
        label="Camera Rounded Corners"
        .hass=${this._hass}
        .selector=${BOOLEAN_SELECTOR}
        .value=${this._config?.camera_rounded_corners !== false}
        .required=${false}
        @value-changed=${this._handleBooleanChange}
      ></ha-selector>
      <ha-selector
        class="boolean-option"
        data-config-key="camera_shadows"
        label="Camera Shadows"
        .hass=${this._hass}
        .selector=${BOOLEAN_SELECTOR}
        .value=${this._config?.camera_shadows !== false}
        .required=${false}
        @value-changed=${this._handleBooleanChange}
      ></ha-selector>
    `;
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

  private _applyDraft(
    nextConfig: WatchZoneCardConfig,
    commitConfig: boolean,
  ): void {
    const changed =
      !this._config ||
      cardConfigSignature(nextConfig) !== cardConfigSignature(this._config);
    if (changed) {
      this._config = nextConfig;
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

  private _publishDraftPreview(config: WatchZoneCardConfig): void {
    this._publishPreview(
      cardConfigSignature(config) === this._baselineSignature ? null : config,
    );
  }

  private _publishPreview(config: WatchZoneCardConfig | null): void {
    window.dispatchEvent(
      new CustomEvent<PreviewDraftDetail>(EDITOR_PREVIEW_DRAFT_EVENT, {
        detail: {
          baselineSignature: this._baselineSignature,
          config,
        },
      }),
    );
  }

  private _dispatchConfigChange(config: WatchZoneCardConfig): void {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: toYamlCardConfig(config) },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private readonly _handleDocumentClick = (event: Event): void => {
    if (!this._config || !isDialogSaveClick(this, event)) {
      return;
    }
    const yamlConfig = toYamlCardConfig(this._config);
    if (!commitDraftForSave(this, yamlConfig)) {
      this._dispatchConfigChange(this._config);
    }
  };

  static styles = [watchZoneThemeTokens, watchZoneCardEditorStyles];
}

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, WatchZoneCardEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    "watchzone-card-editor": WatchZoneCardEditor;
  }
}
