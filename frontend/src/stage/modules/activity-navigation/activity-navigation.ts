import { html, LitElement, nothing, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";

import { ACTIVITY_NAVIGATION_TAG } from "../../../core/constants";
import type { HomeAssistantLocale } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { isIconName, renderIcon } from "../../../ui/icons";
import "../../activity";
import type { ActivityFilterContext } from "../../activity";
import type { CameraSelectionContext } from "../../camera-selection-context";
import type { CameraSelectionState } from "../../camera-selection-context";
import type { ExportFilterContext } from "../../export-filter-context";
import type { MediaDateContext } from "../../media-date-context";
import type {
  ModuleStackNavigationContext,
  ModuleStackNavigationState,
  StageStackAccessoryConfiguration,
} from "../../module-stack-navigation-context";
import { activityNavigationStyles } from "./activity-navigation.styles";
import type { ActivityNavigationPresentation } from ".";

let exportFilterDefinition: Promise<unknown> | undefined;

function defineExportFilter(): Promise<unknown> {
  return (exportFilterDefinition ??= import("../../export-filter"));
}

const EMPTY_STATE: ModuleStackNavigationState = { items: [] };

/** Independently placeable navigation and accessories for one module stack. */
export class ActivityNavigationModule extends LitElement {
  public static properties = {
    activityFilter: { attribute: false },
    cameraSelection: { attribute: false },
    exportFilter: { attribute: false },
    locale: { attribute: false },
    localize: { attribute: false },
    mediaDate: { attribute: false },
    hideSlideshow: { attribute: false },
    navigationContext: { attribute: false },
    presentation: { reflect: true },
    targetStackId: { attribute: false },
  };

  public activityFilter?: ActivityFilterContext;
  public cameraSelection?: CameraSelectionContext;
  public exportFilter?: ExportFilterContext;
  public locale?: HomeAssistantLocale;
  public localize: LocalizeFunction = englishLocalize;
  public mediaDate?: MediaDateContext;
  public hideSlideshow = false;
  public navigationContext?: ModuleStackNavigationContext;
  public presentation: ActivityNavigationPresentation = "toolbar";
  public targetStackId = "";

  private _state = EMPTY_STATE;
  private _unsubscribe?: () => void;
  private readonly _availabilityStates = new Map<
    string,
    CameraSelectionState
  >();
  private readonly _availabilityUnsubscribes = new Map<string, () => void>();

  public connectedCallback(): void {
    super.connectedCallback();
    this._subscribe();
  }

  public disconnectedCallback(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._clearAvailabilitySubscriptions();
    super.disconnectedCallback();
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("navigationContext") || changed.has("targetStackId")) {
      this._subscribe();
    }
    if (changed.has("cameraSelection")) {
      this._syncAvailabilitySubscriptions();
    }
  }

  protected render() {
    const items = this._availableItems();
    if (items.length === 0) return nothing;
    const active = items.find(({ id }) => id === this._state.activeId);
    return html`<nav
      class="stage-stack-navigation"
      aria-label=${this.localize("navigation.activity")}
    >
      ${repeat(
        items,
        ({ id }) => id,
        (item) => {
          const label = item.labelKey ? this.localize(item.labelKey) : item.id;
          return html`<button
            class=${`round-button stage-stack-button${item.id === active?.id ? " active" : ""}`}
            type="button"
            aria-label=${label}
            aria-pressed=${item.id === active?.id ? "true" : "false"}
            title=${label}
            @pointerenter=${this._handlePointerEnter}
            @pointerleave=${this._handlePointerLeave}
            @pointerdown=${this._handlePointerDown}
            @click=${() => this.navigationContext?.select(this.targetStackId, item.id)}
          >
            ${
              item.icon && isIconName(item.icon) ? renderIcon(item.icon) : label
            }
          </button>`;
        },
      )}
      ${this._renderAccessories(active?.accessories, active?.id)}
    </nav>`;
  }

  private _renderAccessories(
    accessories: StageStackAccessoryConfiguration | undefined,
    scopeId: string | undefined,
  ) {
    if (!accessories || !scopeId) return nothing;
    if (accessories.filter === "exports") void defineExportFilter();
    return html`<span class="stage-stack-accessories">
      ${
        this.hideSlideshow
          ? nothing
          : html`<wzc-activity-slideshow-toggle
              .cameraSelection=${this.cameraSelection}
              .localize=${this.localize}
              .targetModuleId=${accessories.targetModuleId ?? ""}
            ></wzc-activity-slideshow-toggle>`
      }
      <wzc-activity-takeover-toggle
        .cameraSelection=${this.cameraSelection}
        .localize=${this.localize}
        .targetModuleId=${accessories.targetModuleId ?? ""}
      ></wzc-activity-takeover-toggle>
      ${
        accessories.filter === "activity" || accessories.filter === "disabled"
          ? html`<wzc-activity-filter
              .cameraSelection=${this.cameraSelection}
              .disabled=${accessories.filter === "disabled"}
              .filterContext=${this.activityFilter}
              .locale=${this.locale}
              .localize=${this.localize}
              .targetModuleId=${accessories.targetModuleId ?? ""}
            ></wzc-activity-filter>`
          : accessories.filter === "exports"
            ? html`<wzc-export-filter
                .filterContext=${this.exportFilter}
                .localize=${this.localize}
                .scopeId=${scopeId}
              ></wzc-export-filter>`
            : nothing
      }
      <wzc-activity-calendar
        .cameraSelection=${this.cameraSelection}
        .dateContext=${this.mediaDate}
        .disabled=${accessories.calendar === "disabled"}
        .disabledLabel=${
          accessories.calendar === "disabled"
            ? this.localize("exports.calendar_unavailable")
            : ""
        }
        .historyDays=${accessories.historyDays ?? 1}
        .localize=${this.localize}
        .locale=${this.locale}
        .mode=${
          accessories.calendar === "recordings" ? "recordings" : "activity"
        }
        .targetModuleId=${accessories.targetModuleId ?? ""}
      ></wzc-activity-calendar>
    </span>`;
  }

  private _subscribe(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._state = EMPTY_STATE;
    if (!this.navigationContext || !this.targetStackId) return;
    this._unsubscribe = this.navigationContext.subscribe(
      this.targetStackId,
      (state) => {
        this._state = state;
        this._syncAvailabilitySubscriptions();
        this._selectAvailableFallback();
        this.requestUpdate();
      },
    );
  }

  private _availableItems() {
    return this._state.items.filter((item) => {
      const availability = this._availability(item.config);
      if (!availability) return true;
      const activeEntityId = this._availabilityStates.get(
        availability.targetModuleId,
      )?.activeEntityId;
      return (
        activeEntityId !== undefined &&
        availability.cameraEntityIds.includes(activeEntityId)
      );
    });
  }

  private _syncAvailabilitySubscriptions(): void {
    this._clearAvailabilitySubscriptions();
    if (!this.cameraSelection) return;
    const targetIds = new Set(
      this._state.items.flatMap(({ config }) => {
        const availability = this._availability(config);
        return availability ? [availability.targetModuleId] : [];
      }),
    );
    for (const targetId of targetIds) {
      let subscribing = true;
      const unsubscribe = this.cameraSelection.subscribe(targetId, (state) => {
        this._availabilityStates.set(targetId, state);
        if (!subscribing) this._selectAvailableFallback();
        this.requestUpdate();
      });
      this._availabilityUnsubscribes.set(targetId, unsubscribe);
      subscribing = false;
    }
    this._selectAvailableFallback();
  }

  private _availability(config: unknown) {
    if (typeof config !== "object" || config === null) return undefined;
    const source = config as Record<string, unknown>;
    return Array.isArray(source.cameraEntityIds) &&
      typeof source.targetModuleId === "string"
      ? {
          cameraEntityIds: source.cameraEntityIds,
          targetModuleId: source.targetModuleId,
        }
      : undefined;
  }

  private _clearAvailabilitySubscriptions(): void {
    for (const unsubscribe of this._availabilityUnsubscribes.values()) {
      unsubscribe();
    }
    this._availabilityUnsubscribes.clear();
    this._availabilityStates.clear();
  }

  private _selectAvailableFallback(): void {
    const items = this._availableItems();
    if (
      !this._state.activeId ||
      items.some(({ id }) => id === this._state.activeId)
    ) {
      return;
    }
    const fallback = items[0];
    if (fallback) {
      this.navigationContext?.select(this.targetStackId, fallback.id);
    }
  }

  private readonly _handlePointerEnter = (event: PointerEvent): void => {
    if (event.pointerType === "mouse") {
      (event.currentTarget as HTMLElement).classList.add("hovered");
    }
  };

  private readonly _handlePointerLeave = (event: PointerEvent): void => {
    (event.currentTarget as HTMLElement).classList.remove("hovered");
  };

  private readonly _handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== "mouse") {
      (event.currentTarget as HTMLElement).classList.remove("hovered");
    }
  };

  static styles = activityNavigationStyles;
}

if (!customElements.get(ACTIVITY_NAVIGATION_TAG)) {
  customElements.define(ACTIVITY_NAVIGATION_TAG, ActivityNavigationModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [ACTIVITY_NAVIGATION_TAG]: ActivityNavigationModule;
  }
}
