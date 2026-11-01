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

export class WatchZoneCardEditor extends LitElement {
  private _baseline?: WatchZoneCardConfig;
  private _baselineSignature = "";
  private _config?: WatchZoneCardConfig;
  private _dirtyContext?: DirtyStateContext<WatchZoneCardConfig>;
  private _dirtyUnsubscribe?: () => void;
  private _previewTimer?: ReturnType<typeof setTimeout>;

  public set hass(_value: unknown) {
    // The title editor consumes no Home Assistant state. Intentionally do not
    // retain or react to the frequently replaced hass object.
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
    requestDirtyStateContext<WatchZoneCardConfig>(
      this,
      (context, unsubscribe) => {
        this._dirtyContext = context;
        this._dirtyUnsubscribe ??= unsubscribe;
        this._seedDirtyState();
      },
    );
    document.addEventListener("click", this._handleDocumentClick, true);
  }

  public disconnectedCallback(): void {
    document.removeEventListener("click", this._handleDocumentClick, true);
    this._dirtyUnsubscribe?.();
    this._dirtyUnsubscribe = undefined;
    this._dirtyContext = undefined;
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
    `;
  }

  private _seedDirtyState(): void {
    if (this._dirtyContext && this._baseline) {
      seedDirtyState(this._dirtyContext, this._baseline);
      if (this._config) {
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

  private _updateTitle(rawTitle: string, immediatePreview: boolean): void {
    const title = rawTitle.trim();
    if (!this._config || title.length === 0) {
      return;
    }

    const nextConfig = normalizeCardConfig({ ...this._config, title });
    const changed =
      cardConfigSignature(nextConfig) !== cardConfigSignature(this._config);
    if (changed) {
      this._config = nextConfig;

      if (this._dirtyContext) {
        updateDirtyState(this._dirtyContext, nextConfig);
      }
    }

    if (
      !this._dirtyContext &&
      immediatePreview &&
      cardConfigSignature(nextConfig) !== this._baselineSignature
    ) {
      this._dispatchCompatibilityConfigChange(nextConfig);
    }

    if (this._previewTimer) {
      clearTimeout(this._previewTimer);
    }
    if (immediatePreview) {
      this._previewTimer = undefined;
      this._publishPreview(nextConfig);
    } else if (changed) {
      this._previewTimer = setTimeout(() => {
        this._previewTimer = undefined;
        this._publishPreview(nextConfig);
      }, EDITOR_TEXT_PREVIEW_DELAY_MS);
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

  private _dispatchCompatibilityConfigChange(
    config: WatchZoneCardConfig,
  ): void {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private readonly _handleDocumentClick = (event: Event): void => {
    if (this._config && isDialogSaveClick(this, event)) {
      commitDraftForSave(this, this._config);
    }
  };

  static styles = css`
    :host {
      display: block;
      box-sizing: border-box;
      inline-size: 100%;
      color: var(--ha-color-text-primary, var(--primary-text-color));
    }

    ha-input {
      inline-size: 100%;
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
