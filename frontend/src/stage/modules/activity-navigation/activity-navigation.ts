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
import type {
  ActiveCameraSession,
  CameraSessionContext,
} from "../../camera-session-context";
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
    cameraSession: { attribute: false },
    exportFilter: { attribute: false },
    locale: { attribute: false },
    localize: { attribute: false },
    mediaDate: { attribute: false },
    navigationContext: { attribute: false },
    presentation: { reflect: true },
    targetStackId: { attribute: false },
  };

  public activityFilter?: ActivityFilterContext;
  public cameraSelection?: CameraSelectionContext;
  public cameraSession?: CameraSessionContext;
  public exportFilter?: ExportFilterContext;
  public locale?: HomeAssistantLocale;
  public localize: LocalizeFunction = englishLocalize;
  public mediaDate?: MediaDateContext;
  public navigationContext?: ModuleStackNavigationContext;
  public presentation: ActivityNavigationPresentation = "toolbar";
  public targetStackId = "";

  private _state = EMPTY_STATE;
  private _activeEntityId?: string;
  private _cameraUnsubscribe?: () => void;
  private _unsubscribe?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this._subscribe();
    this._subscribeCamera();
  }

  public disconnectedCallback(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._cameraUnsubscribe?.();
    this._cameraUnsubscribe = undefined;
    super.disconnectedCallback();
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("navigationContext") || changed.has("targetStackId")) {
      this._subscribe();
    }
    if (changed.has("cameraSession")) this._subscribeCamera();
  }

  protected render() {
    const items = this._visibleItems();
    if (items.length === 0) return nothing;
    const active = this._state.items.find(
      ({ id }) => id === this._state.activeId,
    );
    return html`<nav
      class="stage-stack-navigation"
      aria-label=${this.localize("navigation.activity")}
    >
      ${repeat(
        items,
        ({ id }) => id,
        (item) => {
          const label = item.labelKey ? this.localize(item.labelKey) : item.id;
          const icons = item.entityIcons
            ? (item.entityIcons[this._activeEntityId ?? ""] ?? [])
            : item.icon
              ? [item.icon]
              : [];
          return html`<button
            class=${`round-button stage-stack-button${icons.length > 1 ? " joined" : ""}${item.id === active?.id ? " active" : ""}`}
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
              icons.length > 0
                ? icons.map((icon) =>
                    isIconName(icon) ? renderIcon(icon) : nothing,
                  )
                : label
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
      <wzc-activity-slideshow-toggle
        .cameraSelection=${this.cameraSelection}
        .localize=${this.localize}
        .targetModuleId=${accessories.targetModuleId ?? ""}
      ></wzc-activity-slideshow-toggle>
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
        this.requestUpdate();
      },
    );
  }

  private _subscribeCamera(): void {
    this._cameraUnsubscribe?.();
    this._cameraUnsubscribe = undefined;
    this._activeEntityId = undefined;
    if (!this.cameraSession) return;
    this._cameraUnsubscribe = this.cameraSession.subscribe(
      this._handleCameraSession,
    );
  }

  private readonly _handleCameraSession = (
    session: ActiveCameraSession | undefined,
  ): void => {
    this._activeEntityId = session?.entityId;
    const visible = this._visibleItems();
    if (
      session &&
      this._state.activeId &&
      !visible.some(({ id }) => id === this._state.activeId) &&
      visible[0]
    ) {
      this.navigationContext?.select(this.targetStackId, visible[0].id);
    }
    this.requestUpdate();
  };

  private _visibleItems(): ModuleStackNavigationState["items"] {
    return this._state.items.filter(
      ({ entityIcons }) =>
        !entityIcons ||
        Boolean(this._activeEntityId && entityIcons[this._activeEntityId]),
    );
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
