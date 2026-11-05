import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  LIGHT_ERROR_TOAST_DURATION_MS,
  LIGHT_LONG_PRESS_MS,
  LIGHT_TAG,
  TOAST_REGION_TAG,
} from "../../core/constants";
import type {
  ActiveCameraSession,
  CameraSessionContext,
} from "../../core/camera-session-context";
import type {
  HomeAssistant,
  HomeAssistantEntity,
} from "../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { lightIconForState } from "../../core/light-icons";
import { renderIcon } from "../../ui/icons";
import { roundControlStyles } from "../../ui/round-control.styles";
import { ToastManager } from "../../ui/toast-manager";
import "../../ui/toast-region";
import type { CameraLightConfig } from "./index";
import { lightControlStyles } from "./light-control.styles";

const toastRegionTag = unsafeStatic(TOAST_REGION_TAG);
const LIGHT_TOAST_KEY = "light-control-status";

/** Independently placeable Home Assistant light controls for the active camera. */
export class LightControlComponent extends LitElement {
  public static properties = {
    cameras: { attribute: false },
    cameraSession: { attribute: false },
    hass: { attribute: false },
    localize: { attribute: false },
  };

  private _activeCamera?: ActiveCameraSession;
  private _cameraContext?: CameraSessionContext;
  private _longPressOpened = false;
  private _openLightId?: string;
  private readonly _optimisticLevels = new Map<string, number>();
  private _panelBrightness = 100;
  private _pendingLightIds = new Set<string>();
  private _pressLightId?: string;
  private _pressTimer?: ReturnType<typeof setTimeout>;
  private _releaseOverlay?: () => void;
  private _unsubscribeCamera?: () => void;
  private readonly _toasts = new ToastManager(this);

  public cameras: readonly CameraLightConfig[] = [];
  public cameraSession?: CameraSessionContext;
  public hass?: HomeAssistant;
  public localize: LocalizeFunction = englishLocalize;

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    this._bindCameraContext();
    if (changed.has("hass") && changed.get("hass") !== undefined) {
      this._optimisticLevels.clear();
    }
  }

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener(
      "pointerdown",
      this._handleOutsidePointerDown,
      true,
    );
    document.addEventListener("keydown", this._handleDocumentKeyDown);
  }

  public disconnectedCallback(): void {
    document.removeEventListener(
      "pointerdown",
      this._handleOutsidePointerDown,
      true,
    );
    document.removeEventListener("keydown", this._handleDocumentKeyDown);
    this._unsubscribeCamera?.();
    this._unsubscribeCamera = undefined;
    this._cameraContext = undefined;
    this._cancelPress();
    this._closeDimmer();
    super.disconnectedCallback();
  }

  protected render() {
    const camera = this._activeCamera;
    const config = this._activeConfig();
    if (!camera || !config || !this.hass) return nothing;
    const lights = config.lights.map(({ entityId, icon }) => ({
      entity: this.hass?.states[entityId],
      entityId,
      icon,
    }));
    const visible = camera.overlayVisible || this._openLightId !== undefined;
    const openLight = lights.find(
      ({ entityId }) => entityId === this._openLightId,
    );

    return staticHtml`<div class="light-layer">
      <${toastRegionTag}
        class="light-toast"
        mode="overlay"
        .notices=${this._toasts.notices}
      ></${toastRegionTag}>
      <div class=${visible ? "light-stack visible" : "light-stack"}>
        ${
          openLight
            ? this._renderDimmer(openLight.entityId, openLight.entity)
            : nothing
        }
        <div
          class="light-buttons"
          role="group"
          aria-label=${this.localize("light.controls")}
        >
          ${lights.map(({ entityId, entity, icon }) =>
            this._renderLightButton(entityId, icon, entity),
          )}
        </div>
      </div>
    </div>`;
  }

  private _renderLightButton(
    entityId: string,
    icon: string,
    entity: HomeAssistantEntity | undefined,
  ) {
    const name = lightName(entityId, entity);
    const level = this._displayLevel(entityId, entity);
    const pending = this._pendingLightIds.has(entityId);
    const title =
      entity?.state === "on"
        ? this.localize("light.turn_off", { name })
        : this.localize("light.turn_on", { name });
    return html`<button
      class=${
        entity?.state === "on"
          ? "wzc-round-control light-button on"
          : "wzc-round-control light-button"
      }
      type="button"
      data-light-id=${entityId}
      style=${`--wzc-light-level:${level}%`}
      title=${title}
      aria-label=${title}
      aria-pressed=${entity?.state === "on" ? "true" : "false"}
      aria-haspopup="dialog"
      ?disabled=${!entity || pending}
      @click=${this._preventClick}
      @contextmenu=${this._preventClick}
      @pointerdown=${this._handlePointerDown}
      @pointerup=${this._handlePointerUp}
      @pointercancel=${this._handlePointerCancel}
      @lostpointercapture=${this._handlePointerCancel}
      @keydown=${this._handleKeyDown}
      @keyup=${this._handleKeyUp}
      @focus=${this._revealOverlay}
      @pointerenter=${this._revealOverlay}
    >
      <ha-icon
        .icon=${lightIconForState(icon, entity?.state === "on")}
      ></ha-icon>
    </button>`;
  }

  private _renderDimmer(
    entityId: string,
    entity: HomeAssistantEntity | undefined,
  ) {
    const name = lightName(entityId, entity);
    const on = entity?.state === "on";
    return html`<div
      class="dimmer-panel"
      role="dialog"
      aria-label=${this.localize("light.dimmer", { name })}
    >
      <span class="dimmer-name">${name}</span>
      <span class="brightness-value" aria-live="polite">
        ${this._panelBrightness}%
      </span>
      <ha-control-slider
        vertical
        .min=${1}
        .max=${100}
        .step=${1}
        .value=${this._panelBrightness}
        .unit=${"%"}
        .tooltipMode=${"never"}
        title=${this.localize("light.brightness", { name })}
        aria-label=${this.localize("light.brightness", { name })}
        @slider-moved=${this._handleBrightnessInput}
        @value-changed=${this._handleBrightnessChange}
      ></ha-control-slider>
      <button
        class=${
          on
            ? "wzc-round-control power-button on"
            : "wzc-round-control power-button"
        }
        type="button"
        data-light-id=${entityId}
        title=${
          on
            ? this.localize("light.turn_off", { name })
            : this.localize("light.turn_on", { name })
        }
        aria-label=${
          on
            ? this.localize("light.turn_off", { name })
            : this.localize("light.turn_on", { name })
        }
        aria-pressed=${on ? "true" : "false"}
        ?disabled=${this._pendingLightIds.has(entityId)}
        @click=${this._toggleFromButton}
      >
        ${renderIcon("power")}
      </button>
    </div>`;
  }

  private _bindCameraContext(): void {
    if (this._cameraContext === this.cameraSession) return;
    this._unsubscribeCamera?.();
    this._cameraContext = this.cameraSession;
    this._unsubscribeCamera = this.cameraSession?.subscribe((camera) => {
      if (camera?.entityId !== this._activeCamera?.entityId) {
        this._closeDimmer();
      }
      this._activeCamera = camera;
      this.requestUpdate();
    });
  }

  private _activeConfig(): CameraLightConfig | undefined {
    return this.cameras.find(
      ({ cameraEntityId }) => cameraEntityId === this._activeCamera?.entityId,
    );
  }

  private _displayLevel(
    entityId: string,
    entity: HomeAssistantEntity | undefined,
  ): number {
    const optimistic = this._optimisticLevels.get(entityId);
    if (optimistic !== undefined) return optimistic;
    return brightnessPercentage(entity);
  }

  private readonly _handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget as HTMLButtonElement;
    button.setPointerCapture(event.pointerId);
    this._beginPress(button.dataset.lightId ?? "");
  };

  private readonly _handlePointerUp = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this._finishPress((event.currentTarget as HTMLElement).dataset.lightId);
  };

  private readonly _handlePointerCancel = (event: PointerEvent): void => {
    event.preventDefault();
    this._cancelPress();
  };

  private readonly _handleKeyDown = (event: KeyboardEvent): void => {
    const entityId = (event.currentTarget as HTMLElement).dataset.lightId;
    if (event.key === "ArrowUp" && entityId) {
      event.preventDefault();
      this._openDimmer(entityId);
      return;
    }
    if ((event.key !== " " && event.key !== "Enter") || event.repeat) return;
    event.preventDefault();
    this._beginPress(entityId ?? "");
  };

  private readonly _handleKeyUp = (event: KeyboardEvent): void => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    this._finishPress((event.currentTarget as HTMLElement).dataset.lightId);
  };

  private _beginPress(entityId: string): void {
    if (!entityId) return;
    this._cancelPress();
    this._pressLightId = entityId;
    this._longPressOpened = false;
    this._activeCamera?.revealOverlay();
    this._pressTimer = setTimeout(() => {
      if (this._pressLightId !== entityId) return;
      this._longPressOpened = true;
      this._openDimmer(entityId);
    }, LIGHT_LONG_PRESS_MS);
  }

  private _finishPress(entityId: string | undefined): void {
    const toggle =
      Boolean(entityId) &&
      entityId === this._pressLightId &&
      !this._longPressOpened;
    this._cancelPress();
    if (toggle && entityId) void this._toggle(entityId);
  }

  private _cancelPress(): void {
    if (this._pressTimer) clearTimeout(this._pressTimer);
    this._pressTimer = undefined;
    this._pressLightId = undefined;
    this._longPressOpened = false;
  }

  private _openDimmer(entityId: string): void {
    const entity = this.hass?.states[entityId];
    this._openLightId = entityId;
    this._panelBrightness = Math.max(1, brightnessPercentage(entity) || 100);
    this._releaseOverlay?.();
    this._releaseOverlay = this._activeCamera?.holdOverlay();
    this._activeCamera?.revealOverlay();
    this.requestUpdate();
  }

  private readonly _closeDimmer = (): void => {
    this._openLightId = undefined;
    this._releaseOverlay?.();
    this._releaseOverlay = undefined;
    this.requestUpdate();
  };

  private readonly _handleBrightnessInput = (event: Event): void => {
    this._setPanelBrightness(sliderValue(event));
  };

  private _setPanelBrightness(value: number): void {
    if (!Number.isFinite(value)) return;
    this._panelBrightness = Math.max(1, Math.min(100, Math.round(value)));
    if (this._openLightId) {
      this._optimisticLevels.set(this._openLightId, this._panelBrightness);
    }
    this.requestUpdate();
  }

  private readonly _handleBrightnessChange = (event: Event): void => {
    this._setPanelBrightness(sliderValue(event));
    if (!this._openLightId) return;
    void this._callLight(this._openLightId, "turn_on", {
      brightness_pct: this._panelBrightness,
    });
  };

  private readonly _toggleFromButton = (event: Event): void => {
    const entityId = (event.currentTarget as HTMLElement).dataset.lightId;
    if (entityId) void this._toggle(entityId);
  };

  private async _toggle(entityId: string): Promise<void> {
    const entity = this.hass?.states[entityId];
    const service = entity?.state === "on" ? "turn_off" : "turn_on";
    if (service === "turn_off") this._optimisticLevels.set(entityId, 0);
    else
      this._optimisticLevels.set(entityId, brightnessPercentage(entity) || 100);
    this.requestUpdate();
    await this._callLight(entityId, service);
  }

  private async _callLight(
    entityId: string,
    service: "turn_off" | "turn_on",
    data?: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const hass = this.hass;
    if (!hass || this._pendingLightIds.has(entityId)) return;
    this._pendingLightIds = new Set(this._pendingLightIds).add(entityId);
    this.requestUpdate();
    try {
      await hass.callService("light", service, data, { entity_id: entityId });
    } catch {
      this._optimisticLevels.delete(entityId);
      this._toasts.error(this.localize("light.failed"), {
        durationMs: LIGHT_ERROR_TOAST_DURATION_MS,
        key: LIGHT_TOAST_KEY,
      });
    } finally {
      const pending = new Set(this._pendingLightIds);
      pending.delete(entityId);
      this._pendingLightIds = pending;
      this.requestUpdate();
    }
  }

  private readonly _preventClick = (event: Event): void =>
    event.preventDefault();
  private readonly _revealOverlay = (): void =>
    this._activeCamera?.revealOverlay();

  private readonly _handleOutsidePointerDown = (event: PointerEvent): void => {
    if (!this._openLightId) return;
    const panel = this.renderRoot.querySelector(".dimmer-panel");
    if (panel && !event.composedPath().includes(panel)) this._closeDimmer();
  };

  private readonly _handleDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this._openLightId) this._closeDimmer();
  };

  static styles = [roundControlStyles, lightControlStyles];
}

function sliderValue(event: Event): number {
  const detail = (event as CustomEvent<{ value?: unknown }>).detail;
  const value =
    detail?.value ?? (event.currentTarget as { value?: unknown }).value;
  return typeof value === "number" ? value : Number(value);
}

function lightName(
  entityId: string,
  entity: HomeAssistantEntity | undefined,
): string {
  const name = entity?.attributes.friendly_name;
  return typeof name === "string" && name.trim() ? name : entityId;
}

function brightnessPercentage(entity: HomeAssistantEntity | undefined): number {
  if (entity?.state !== "on") return 0;
  const brightness = entity.attributes.brightness;
  return typeof brightness === "number"
    ? Math.round((Math.max(0, Math.min(255, brightness)) / 255) * 100)
    : 100;
}

if (!customElements.get(LIGHT_TAG)) {
  customElements.define(LIGHT_TAG, LightControlComponent);
}

declare global {
  interface HTMLElementTagNameMap {
    [LIGHT_TAG]: LightControlComponent;
  }
}
