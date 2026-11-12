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
import "../../../ui/segmented-control";

/** Static camera navigation bar backed by shared layout selection. */
export class CameraNavigationComponent extends LitElement {
  public static properties = {
    cameraSelection: { attribute: false },
    localize: { attribute: false },
    roundedCorners: { attribute: false, type: Boolean },
    shadows: { attribute: false, type: Boolean },
    targetModuleId: { attribute: false },
  };

  private _state: CameraSelectionState = { items: [] };
  private _unsubscribe?: () => void;

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
      <wzc-segmented-control
        class="items"
        appearance="navigation"
        mode="tab"
        .label=${this.localize("camera.navigation")}
        .options=${this._state.items.map(({ activity, entityId, label }) => ({
          accessibleLabel: activity
            ? this.localize(`camera.activity_${activity}`, { camera: label })
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
          value: entityId,
        }))}
        .value=${this._state.activeEntityId ?? ""}
        @wzc-segmented-control-value=${this._select}
      ></wzc-segmented-control>
    </nav>`;
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
    this.cameraSelection?.select(this.targetModuleId, event.detail.value);
  };

  static styles = cameraNavigationStyles;
}

if (!customElements.get(CAMERA_NAVIGATION_TAG)) {
  customElements.define(CAMERA_NAVIGATION_TAG, CameraNavigationComponent);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_NAVIGATION_TAG]: CameraNavigationComponent;
  }
}
