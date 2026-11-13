import { html, LitElement, nothing, type PropertyValues } from "lit";

import type {
  CameraSelectionContext,
  CameraSelectionState,
} from "../../camera-selection-context";
import { CAMERA_NAVIGATION_TAG } from "../../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { cameraNavigationStyles } from "./camera-navigation.styles";
import type { SegmentedControlValueDetail } from "../../../ui/segmented-control";
import type { SegmentedControl } from "../../../ui/segmented-control";
import "../../../ui/segmented-control";
import { renderIcon } from "../../../ui/icons";
import { CameraNavigationOverflowController } from "./overflow.controller";

/** Standalone camera-navigation module backed by shared camera selection. */
export class CameraNavigationModule extends LitElement {
  public static properties = {
    cameraSelection: { attribute: false },
    localize: { attribute: false },
    roundedCorners: { attribute: false, type: Boolean },
    shadows: { attribute: false, type: Boolean },
    targetModuleId: { attribute: false },
  };

  private _state: CameraSelectionState = { items: [] };
  private _unsubscribe?: () => void;
  private readonly _overflow = new CameraNavigationOverflowController(this);

  public cameraSelection?: CameraSelectionContext;
  public localize: LocalizeFunction = englishLocalize;
  public roundedCorners = true;
  public shadows = true;
  public targetModuleId = "";

  public connectedCallback(): void {
    super.connectedCallback();
    this._subscribe();
  }

  public disconnectedCallback(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    super.disconnectedCallback();
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("cameraSelection") || changed.has("targetModuleId")) {
      this._subscribe();
    }
  }

  protected render() {
    if (this._state.items.length === 0) return nothing;
    const selectedValue =
      this._state.activeSelectionId ?? this._state.activeEntityId ?? "";
    return html`<nav
      class=${[
        "bar",
        this.roundedCorners ? "rounded" : "square",
        this.shadows ? "shadows" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label=${this.localize("camera.navigation")}
    >
      <span class="overflow-slot previous">
        ${
          this._overflow.previousCount > 0
            ? html`<button
                class="overflow-control"
                type="button"
                aria-label=${this.localize("camera.navigation_previous", {
                  count: this._overflow.previousCount,
                })}
                @click=${this._overflow.scrollPrevious}
              >
                ${renderIcon("chevronLeft")}
                <span class="overflow-count" aria-hidden="true"
                  >${this._overflow.previousCount}</span
                >
              </button>`
            : nothing
        }
      </span>
      <div class="viewport">
        <wzc-segmented-control
          class="items"
          appearance="navigation"
          mode="tab"
          .label=${this.localize("camera.navigation")}
          .options=${this._state.items.map(
            ({ activity, entityId, label, position }) => ({
              accessibleLabel: activity
                ? this.localize(`camera.activity_${activity}`, {
                    camera: label,
                  })
                : label,
              indicator: activity
                ? {
                    icon: "alertCircle" as const,
                    tone:
                      activity === "alert"
                        ? ("danger" as const)
                        : ("warning" as const),
                  }
                : undefined,
              label,
              leadingIcon: position
                ? (`arrow${position[0]?.toUpperCase()}${position.slice(1)}` as
                    "arrowDown" | "arrowLeft" | "arrowRight" | "arrowUp")
                : undefined,
              value: entityId,
            }),
          )}
          .value=${selectedValue}
          @wzc-segmented-control-value=${this._select}
        ></wzc-segmented-control>
      </div>
      <span class="overflow-slot next">
        ${
          this._overflow.nextCount > 0
            ? html`<button
                class="overflow-control"
                type="button"
                aria-label=${this.localize("camera.navigation_next", {
                  count: this._overflow.nextCount,
                })}
                @click=${this._overflow.scrollNext}
              >
                ${renderIcon("chevronRight")}
                <span class="overflow-count" aria-hidden="true"
                  >${this._overflow.nextCount}</span
                >
              </button>`
            : nothing
        }
      </span>
    </nav>`;
  }

  protected updated(): void {
    const selectedValue =
      this._state.activeSelectionId ?? this._state.activeEntityId ?? "";
    const items =
      this.renderRoot.querySelector<SegmentedControl>(".items") ?? undefined;
    if (!items) {
      this._overflow.observe(undefined, undefined, selectedValue);
      return;
    }
    void items.updateComplete.then(() => {
      if (
        !this.isConnected ||
        this.renderRoot.querySelector(".items") !== items
      )
        return;
      this._overflow.observe(items.scrollViewport, items, selectedValue);
    });
  }

  private _subscribe(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    if (!this.cameraSelection || !this.targetModuleId) {
      this._state = { items: [] };
      return;
    }
    this._unsubscribe = this.cameraSelection.subscribe(
      this.targetModuleId,
      (state) => {
        this._state = state;
        this.requestUpdate();
      },
    );
  }

  private readonly _select = (
    event: CustomEvent<SegmentedControlValueDetail>,
  ): void => {
    this.cameraSelection?.activate(this.targetModuleId, event.detail.value);
  };

  static styles = cameraNavigationStyles;
}

if (!customElements.get(CAMERA_NAVIGATION_TAG)) {
  customElements.define(CAMERA_NAVIGATION_TAG, CameraNavigationModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_NAVIGATION_TAG]: CameraNavigationModule;
  }
}
