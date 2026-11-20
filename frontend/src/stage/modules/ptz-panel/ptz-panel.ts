import { LitElement, type PropertyValues } from "lit";

import { PTZ_PANEL_TAG } from "../../../core/constants";
import type {
  CameraSelectionContext,
  CameraSelectionState,
} from "../../camera-selection-context";
import { ptzPanelStyles } from "./ptz-panel.styles";

const EMPTY_SELECTION: CameraSelectionState = { items: [] };

/** Owns the independently placeable PTZ panel surface and availability. */
export class PtzPanelModule extends LitElement {
  public static properties = {
    available: { reflect: true, type: Boolean },
    cameraEntityIds: { attribute: false },
    cameraSelection: { attribute: false },
    targetModuleId: { attribute: false },
  };

  public available = false;
  public cameraEntityIds: readonly string[] = [];
  public cameraSelection?: CameraSelectionContext;
  public targetModuleId = "";

  private _selection = EMPTY_SELECTION;
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
    if (changed.has("cameraEntityIds")) this._updateAvailability();
  }

  private _subscribe(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._selection = EMPTY_SELECTION;
    if (!this.cameraSelection || !this.targetModuleId) {
      this._updateAvailability();
      return;
    }
    this._unsubscribe = this.cameraSelection.subscribe(
      this.targetModuleId,
      (selection) => {
        this._selection = selection;
        this._updateAvailability();
      },
    );
  }

  private _updateAvailability(): void {
    this.available =
      this._selection.activeEntityId !== undefined &&
      this.cameraEntityIds.includes(this._selection.activeEntityId);
  }

  static styles = ptzPanelStyles;
}

if (!customElements.get(PTZ_PANEL_TAG)) {
  customElements.define(PTZ_PANEL_TAG, PtzPanelModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [PTZ_PANEL_TAG]: PtzPanelModule;
  }
}
