import { html, LitElement, type PropertyValues } from "lit";

import { ACTIVITY_SLIDESHOW_TOGGLE_TAG } from "../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { renderIcon } from "../../ui/icons";
import type {
  CameraSelectionContext,
  CameraSelectionState,
} from "../camera-selection-context";
import { activitySlideshowToggleStyles } from "./activity-slideshow-toggle.styles";

const EMPTY_STATE: CameraSelectionState = { items: [] };

/** Toolbar slideshow toggle backed by the target Camera module. */
export class ActivitySlideshowToggle extends LitElement {
  public static properties = {
    cameraSelection: { attribute: false },
    localize: { attribute: false },
    targetModuleId: { attribute: false },
  };

  public cameraSelection?: CameraSelectionContext;
  public localize: LocalizeFunction = englishLocalize;
  public targetModuleId = "";

  private _state = EMPTY_STATE;
  private _unsubscribe?: () => void;

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
    const available = this._state.slideshowAvailable === true;
    const enabled = available && this._state.slideshowEnabled === true;
    const label = !available
      ? this.localize("camera.slideshow_unavailable")
      : this._state.slideshowHeld
        ? this.localize("camera.slideshow_resume")
        : this.localize(
            enabled ? "camera.slideshow_disable" : "camera.slideshow_enable",
          );
    return html`<button
      class=${`wzc-toolbar-icon-button no-hover${enabled ? " active" : ""}`}
      type="button"
      ?disabled=${!available}
      aria-label=${label}
      aria-pressed=${enabled ? "true" : "false"}
      title=${label}
      @click=${this._toggle}
    >
      ${renderIcon("presentationPlay")}
    </button>`;
  }

  private _subscribe(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._state = EMPTY_STATE;
    if (!this.cameraSelection || !this.targetModuleId) return;
    this._unsubscribe = this.cameraSelection.subscribe(
      this.targetModuleId,
      (state) => {
        this._state = state;
        this.requestUpdate();
      },
    );
  }

  private readonly _toggle = (): void => {
    this.cameraSelection?.toggleSlideshow(this.targetModuleId);
  };

  static styles = activitySlideshowToggleStyles;
}

if (!customElements.get(ACTIVITY_SLIDESHOW_TOGGLE_TAG)) {
  customElements.define(ACTIVITY_SLIDESHOW_TOGGLE_TAG, ActivitySlideshowToggle);
}

declare global {
  interface HTMLElementTagNameMap {
    [ACTIVITY_SLIDESHOW_TOGGLE_TAG]: ActivitySlideshowToggle;
  }
}
