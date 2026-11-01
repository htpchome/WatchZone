import { css, html, LitElement } from "lit";

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
  commitDraftForSave,
  type DirtyStateContext,
  isDialogSaveClick,
  requestDirtyStateContext,
  seedDirtyState,
  updateDirtyState,
} from "./dirty-state";

interface InputElement extends HTMLElement {
  value: string;
}

interface PreviewDraftDetail {
  readonly baselineSignature: string;
  readonly config: WatchZoneCardConfig | null;
}

interface ValueChangedEvent extends Event {
  readonly detail: { readonly value?: string };
}

interface SelectorElement extends HTMLElement {
  hass?: HomeAssistant;
}

const CAMERA_SELECTOR = {
  entity: { filter: { domain: "camera" } },
} as const;

export class WatchZoneCardEditor extends LitElement {
  private _baseline?: WatchZoneCardConfig;
  private _baselineSignature = "";
  private _config?: WatchZoneCardConfig;
  private _dirtyContext?: DirtyStateContext<WatchZoneCardConfig>;
  private _dirtySeeded = false;
  private _hass?: HomeAssistant;
  private _previewTimer?: ReturnType<typeof setTimeout>;

  public set hass(value: unknown) {
    if (!isHomeAssistant(value)) {
      return;
    }
    const firstAssignment = !this._hass;
    this._hass = value;
    const selector = this.renderRoot?.querySelector(
      "ha-selector",
    ) as SelectorElement | null;
    if (selector) {
      selector.hass = value;
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
    requestDirtyStateContext<WatchZoneCardConfig>(this, (context) => {
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
    `;
  }

  private _seedDirtyState(): void {
    if (this._dirtyContext && this._baseline && !this._dirtySeeded) {
      this._dirtySeeded = true;
      seedDirtyState(this._dirtyContext, this._baseline);
      if (
        this._config &&
        cardConfigSignature(this._config) !== this._baselineSignature
      ) {
        updateDirtyState(this._dirtyContext, this._config);
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
    const value = event.detail.value?.trim();
    const next = { ...this._config };
    if (value) {
      next.camera_entity = value;
    } else {
      delete next.camera_entity;
    }
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

      if (this._dirtyContext) {
        updateDirtyState(this._dirtyContext, nextConfig);
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
        this._publishPreview(nextConfig);
      } else {
        this._previewTimer = setTimeout(() => {
          this._previewTimer = undefined;
          this._publishPreview(nextConfig);
        }, EDITOR_TEXT_PREVIEW_DELAY_MS);
      }
    }
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
        detail: { config },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private readonly _handleDocumentClick = (event: Event): void => {
    if (!this._config || !isDialogSaveClick(this, event)) {
      return;
    }
    if (!commitDraftForSave(this, this._config)) {
      this._dispatchConfigChange(this._config);
    }
  };

  static styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      inline-size: 100%;
      color: var(--ha-color-text-primary, var(--primary-text-color));
    }

    ha-input,
    ha-selector {
      inline-size: 100%;
    }

    ha-selector {
      display: block;
      margin-block-start: 1rem;
    }
  `;
}

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, WatchZoneCardEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    "watchzone-card-editor": WatchZoneCardEditor;
  }
}
