import { html, LitElement, nothing } from "lit";

import { ACTIVITY_FILTER_TAG } from "../../core/constants";
import type { HomeAssistantLocale } from "../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { renderIcon } from "../../ui/icons";
import { PopoverInteractionController } from "../../ui/popover-interaction.controller";
import type { CameraSelectionContext } from "../camera-selection-context";
import type {
  ActivityClassificationFilter,
  ActivityFilterContext,
  ActivityFilterState,
  ActivityReviewStatusFilter,
} from "./activity-filter-context";
import { activityFilterStyles } from "./activity-filter.styles";
import { ActivityPopoverController } from "./activity-popover.controller";

const EMPTY_STATE: ActivityFilterState = {
  classification: "all",
  events: [],
  labels: [],
  reviews: [],
  reviewStatus: "all",
  zones: [],
};

/** Camera-scoped activity-filter popover shared by the activity module stack. */
export class ActivityFilter extends LitElement {
  public static properties = {
    cameraSelection: { attribute: false },
    disabled: { type: Boolean },
    filterContext: { attribute: false },
    locale: { attribute: false },
    localize: { attribute: false },
    targetModuleId: { attribute: false },
    _open: { state: true },
    _state: { state: true },
  };

  public cameraSelection?: CameraSelectionContext;
  public disabled = false;
  public filterContext?: ActivityFilterContext;
  public locale?: HomeAssistantLocale;
  public localize: LocalizeFunction = englishLocalize;
  public targetModuleId = "";

  private _activeEntityId?: string;
  private _open = false;
  private _state = EMPTY_STATE;
  private _subscribedContext?: ActivityFilterContext;
  private _subscribedSelection?: CameraSelectionContext;
  private _subscribedTarget = "";
  private _unsubscribeFilter?: () => void;
  private _unsubscribeSelection?: () => void;
  private readonly _popover = new ActivityPopoverController(
    this,
    () => this._open,
    ".filter-trigger",
  );
  private readonly _popoverInteraction = new PopoverInteractionController(
    this,
    () => this._open,
    (open) => {
      this._open = open;
    },
    ".filter-trigger",
  );

  public connectedCallback(): void {
    super.connectedCallback();
  }

  public disconnectedCallback(): void {
    this._unsubscribeFilter?.();
    this._unsubscribeSelection?.();
    this._unsubscribeFilter = undefined;
    this._unsubscribeSelection = undefined;
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("disabled") && this.disabled && this._open) {
      this._open = false;
    }
    this._syncSelection();
  }

  protected render() {
    const selected = hasFilters(this._state);
    return html`
      <button
        class=${`filter-trigger wzc-toolbar-icon-button${selected ? " selected" : ""}`}
        type="button"
        ?disabled=${this.disabled}
        aria-expanded=${this._open ? "true" : "false"}
        aria-haspopup="dialog"
        aria-label=${this.localize("filter.open")}
        title=${this.localize("filter.open")}
        @click=${this._toggle}
      >
        ${renderIcon("filter")}
      </button>
      ${this._open ? this._renderPopover() : nothing}
    `;
  }

  private _renderPopover() {
    const labels = sortedValues(
      this._state.reviews
        .flatMap(({ labels }) => labels)
        .concat(this._state.events.flatMap(({ labels }) => labels)),
      this.locale,
    );
    const zones = sortedValues(
      this._state.reviews
        .flatMap(({ zones }) => zones)
        .concat(this._state.events.flatMap(({ zones }) => zones)),
      this.locale,
    );
    return html`<section
      class="popover"
      popover="manual"
      role="dialog"
      aria-label=${this.localize("filter.title")}
    >
      <h3 class="title">${this.localize("filter.title")}</h3>
      ${this._renderRadioGroup(
        "classification",
        this.localize("filter.activity_type"),
        [
          ["all", this.localize("filter.all")],
          ["alert", this.localize("filter.alerts")],
          ["detection", this.localize("filter.detections")],
        ],
        this._state.classification,
        (value) =>
          this.filterContext?.setClassification(
            this._activeEntityId ?? "",
            value as ActivityClassificationFilter,
          ),
      )}
      ${this._renderMultiSelect(
        this.localize("filter.objects_labels"),
        labels,
        this._state.labels,
        () => this._withEntity((context, id) => context.clearLabels(id)),
        (value) =>
          this._withEntity((context, id) => context.toggleLabel(id, value)),
      )}
      ${this._renderRadioGroup(
        "review-status",
        this.localize("filter.review_status"),
        [
          ["all", this.localize("filter.all")],
          ["reviewed", this.localize("filter.reviewed")],
          ["unreviewed", this.localize("filter.unreviewed")],
        ],
        this._state.reviewStatus,
        (value) =>
          this.filterContext?.setReviewStatus(
            this._activeEntityId ?? "",
            value as ActivityReviewStatusFilter,
          ),
      )}
      ${this._renderMultiSelect(
        this.localize("filter.zones"),
        zones,
        this._state.zones,
        () => this._withEntity((context, id) => context.clearZones(id)),
        (value) =>
          this._withEntity((context, id) => context.toggleZone(id, value)),
      )}
      <footer class="footer">
        <button
          class="reset"
          type="button"
          ?disabled=${!hasFilters(this._state)}
          @click=${this._reset}
        >
          ${this.localize("filter.reset")}
        </button>
      </footer>
    </section>`;
  }

  private _renderRadioGroup(
    name: string,
    legend: string,
    options: readonly (readonly [string, string])[],
    selected: string,
    select: (value: string) => void,
  ) {
    return html`<fieldset>
      <legend>${legend}</legend>
      <div class="options">
        ${options.map(
          ([value, label]) =>
            html`<label class="chip">
              <input
                type="radio"
                name=${name}
                value=${value}
                .checked=${selected === value}
                @change=${() => select(value)}
              />
              <span>${label}</span>
            </label>`,
        )}
      </div>
    </fieldset>`;
  }

  private _renderMultiSelect(
    legend: string,
    options: readonly string[],
    selected: readonly string[],
    clear: () => void,
    toggle: (value: string) => void,
  ) {
    return html`<fieldset>
      <legend>${legend}</legend>
      <div class="options">
        <label class="chip">
          <input
            type="checkbox"
            .checked=${selected.length === 0}
            @change=${clear}
          />
          <span>${this.localize("filter.all")}</span>
        </label>
        ${options.map(
          (value) =>
            html`<label class="chip">
              <input
                type="checkbox"
                .checked=${selected.includes(value)}
                @change=${() => toggle(value)}
              />
              <span>${value}</span>
            </label>`,
        )}
      </div>
    </fieldset>`;
  }

  private readonly _toggle = (): void => {
    this._open = !this._open;
  };

  private readonly _reset = (): void => {
    this._withEntity((context, id) => context.resetFilters(id));
  };

  private _withEntity(
    action: (context: ActivityFilterContext, entityId: string) => void,
  ): void {
    if (!this.filterContext || !this._activeEntityId) return;
    action(this.filterContext, this._activeEntityId);
  }

  private _syncSelection(): void {
    const selection = this.cameraSelection;
    if (
      selection === this._subscribedSelection &&
      this.targetModuleId === this._subscribedTarget &&
      this.filterContext === this._subscribedContext
    ) {
      return;
    }
    this._unsubscribeFilter?.();
    this._unsubscribeSelection?.();
    this._subscribedSelection = selection;
    this._subscribedTarget = this.targetModuleId;
    this._subscribedContext = this.filterContext;
    this._activeEntityId = undefined;
    this._state = EMPTY_STATE;
    if (selection && this.targetModuleId) {
      this._unsubscribeSelection = selection.subscribe(
        this.targetModuleId,
        ({ activeEntityId, settled }) => {
          if (settled !== false) this._cameraChanged(activeEntityId);
        },
      );
    }
  }

  private _cameraChanged(entityId: string | undefined): void {
    if (entityId === this._activeEntityId) return;
    this._unsubscribeFilter?.();
    this._activeEntityId = entityId;
    this._state = EMPTY_STATE;
    if (entityId && this.filterContext) {
      this._unsubscribeFilter = this.filterContext.subscribe(
        entityId,
        (state) => {
          this._state = state;
        },
      );
    }
    this.requestUpdate();
  }

  static styles = activityFilterStyles;
}

function hasFilters(state: ActivityFilterState): boolean {
  return (
    state.classification !== "all" ||
    state.labels.length > 0 ||
    state.reviewStatus !== "all" ||
    state.zones.length > 0
  );
}

function sortedValues(
  values: readonly string[],
  locale: HomeAssistantLocale | undefined,
): readonly string[] {
  let collator: Intl.Collator;
  try {
    collator = new Intl.Collator(locale?.language, {
      sensitivity: "base",
    });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    collator = new Intl.Collator("en", { sensitivity: "base" });
  }
  return [...new Set(values)].sort(collator.compare);
}

if (!customElements.get(ACTIVITY_FILTER_TAG)) {
  customElements.define(ACTIVITY_FILTER_TAG, ActivityFilter);
}

declare global {
  interface HTMLElementTagNameMap {
    [ACTIVITY_FILTER_TAG]: ActivityFilter;
  }
}
