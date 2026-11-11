import { html, LitElement, nothing } from "lit";

import { EXPORT_FILTER_TAG } from "../core/constants";
import { englishLocalize, type LocalizeFunction } from "../core/localization";
import { renderIcon } from "../ui/icons";
import { activityFilterStyles } from "./activity/activity-filter.styles";
import { ActivityPopoverController } from "./activity/activity-popover.controller";
import type {
  ExportFilterContext,
  ExportFilterState,
} from "./export-filter-context";

const EMPTY_STATE: ExportFilterState = { cameras: [], selectedEntityIds: [] };

/** Stage-owned camera filter for an independently placeable Exports module. */
export class ExportFilter extends LitElement {
  public static properties = {
    filterContext: { attribute: false },
    localize: { attribute: false },
    scopeId: { attribute: false },
    _open: { state: true },
    _state: { state: true },
  };

  public filterContext?: ExportFilterContext;
  public localize: LocalizeFunction = englishLocalize;
  public scopeId = "";

  private _open = false;
  private _state = EMPTY_STATE;
  private _subscribedContext?: ExportFilterContext;
  private _subscribedScope = "";
  private _unsubscribe?: () => void;
  private readonly _popover = new ActivityPopoverController(
    this,
    () => this._open,
    ".filter-trigger",
  );

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("pointerdown", this._handleDocumentPointerDown);
    document.addEventListener("keydown", this._handleDocumentKeyDown);
  }

  public disconnectedCallback(): void {
    document.removeEventListener(
      "pointerdown",
      this._handleDocumentPointerDown,
    );
    document.removeEventListener("keydown", this._handleDocumentKeyDown);
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    super.disconnectedCallback();
  }

  protected willUpdate(): void {
    if (
      this.filterContext === this._subscribedContext &&
      this.scopeId === this._subscribedScope
    ) {
      return;
    }
    this._unsubscribe?.();
    this._subscribedContext = this.filterContext;
    this._subscribedScope = this.scopeId;
    this._state = EMPTY_STATE;
    if (this.filterContext && this.scopeId) {
      this._unsubscribe = this.filterContext.subscribe(
        this.scopeId,
        (state) => {
          this._state = state;
        },
      );
    }
  }

  protected render() {
    const selected = this._state.selectedEntityIds.length > 0;
    return html`<button
        class=${`filter-trigger${selected ? " selected" : ""}`}
        type="button"
        aria-expanded=${this._open ? "true" : "false"}
        aria-haspopup="dialog"
        aria-label=${this.localize("exports.filter_open")}
        title=${this.localize("exports.filter_open")}
        @click=${() => {
          this._open = !this._open;
        }}
      >
        ${renderIcon("filter")}
      </button>
      ${this._open ? this._renderPopover() : nothing}`;
  }

  private _renderPopover() {
    const selected = this._state.selectedEntityIds.length > 0;
    return html`<section
      class="popover"
      popover="manual"
      role="dialog"
      aria-label=${this.localize("exports.filter_title")}
    >
      <h3 class="title">${this.localize("exports.filter_title")}</h3>
      <fieldset>
        <legend>${this.localize("exports.filter_cameras")}</legend>
        <div class="options">
          <label class="chip">
            <input
              type="checkbox"
              .checked=${this._state.selectedEntityIds.length === 0}
              @change=${() => this.filterContext?.clearSelection(this.scopeId)}
            />
            <span>${this.localize("filter.all")}</span>
          </label>
          ${this._state.cameras.map(
            (camera) =>
              html`<label class="chip">
                <input
                  type="checkbox"
                  .checked=${this._state.selectedEntityIds.includes(
                    camera.entityId,
                  )}
                  @change=${() =>
                    this.filterContext?.toggleCamera(
                      this.scopeId,
                      camera.entityId,
                    )}
                />
                <span>${camera.label}</span>
              </label>`,
          )}
        </div>
      </fieldset>
      <footer class="footer">
        <button
          class="reset"
          type="button"
          ?disabled=${!selected}
          @click=${() => this.filterContext?.clearSelection(this.scopeId)}
        >
          ${this.localize("filter.reset")}
        </button>
      </footer>
    </section>`;
  }

  private readonly _handleDocumentPointerDown = (event: PointerEvent): void => {
    if (!this._open || event.composedPath().includes(this)) return;
    this._open = false;
  };

  private readonly _handleDocumentKeyDown = (event: KeyboardEvent): void => {
    if (!this._open || event.key !== "Escape") return;
    this._open = false;
    this.shadowRoot
      ?.querySelector<HTMLButtonElement>(".filter-trigger")
      ?.focus();
  };

  static styles = activityFilterStyles;
}

if (!customElements.get(EXPORT_FILTER_TAG)) {
  customElements.define(EXPORT_FILTER_TAG, ExportFilter);
}

declare global {
  interface HTMLElementTagNameMap {
    [EXPORT_FILTER_TAG]: ExportFilter;
  }
}
