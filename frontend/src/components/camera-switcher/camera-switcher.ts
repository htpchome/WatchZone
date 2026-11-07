import { html, LitElement, nothing, type PropertyValues } from "lit";
import { repeat } from "lit/directives/repeat.js";

import type {
  CameraSelectionContext,
  CameraSelectionState,
} from "../../core/camera-selection-context";
import { CAMERA_SWITCHER_TAG } from "../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { cameraSwitcherStyles } from "./camera-switcher.styles";

/** Portable camera selector presentation backed by shared layout selection. */
export class CameraSwitcherComponent extends LitElement {
  public static properties = {
    cameraSelection: { attribute: false },
    localize: { attribute: false },
    shadows: { attribute: false, type: Boolean },
    targetModuleId: { attribute: false },
  };

  private _frame?: number;
  private _observedScroller?: HTMLElement;
  private _resizeObserver?: ResizeObserver;
  private _state: CameraSelectionState = { items: [] };
  private _unsubscribe?: () => void;

  public cameraSelection?: CameraSelectionContext;
  public localize: LocalizeFunction = englishLocalize;
  public shadows = true;
  public targetModuleId = "";

  public connectedCallback(): void {
    super.connectedCallback();
    this._subscribe();
  }

  public disconnectedCallback(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this._observedScroller = undefined;
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = undefined;
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
      class=${this.shadows ? "scroller shadows" : "scroller"}
      aria-label=${this.localize("camera.switcher")}
    >
      <div class="track" role="tablist">
        <span class="active-indicator" aria-hidden="true"></span>
        ${repeat(
          this._state.items,
          ({ entityId }) => entityId,
          ({ entityId, label }) =>
            html`<button
              type="button"
              role="tab"
              data-entity-id=${entityId}
              aria-selected=${
                entityId === this._state.activeEntityId ? "true" : "false"
              }
              @click=${this._select}
            >
              ${label}
            </button>`,
        )}
      </div>
    </nav>`;
  }

  protected updated(): void {
    if (!this._resizeObserver && typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this._scheduleGeometry());
    }
    const scroller = this.renderRoot.querySelector<HTMLElement>(".scroller");
    if (scroller !== this._observedScroller) {
      this._resizeObserver?.disconnect();
      this._observedScroller = scroller ?? undefined;
      if (scroller) this._resizeObserver?.observe(scroller);
    }
    this._scheduleGeometry();
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

  private readonly _select = (event: Event): void => {
    const entityId = (event.currentTarget as HTMLElement).dataset.entityId;
    if (entityId) this.cameraSelection?.select(this.targetModuleId, entityId);
  };

  private _scheduleGeometry(): void {
    if (this._frame !== undefined) cancelAnimationFrame(this._frame);
    this._frame = requestAnimationFrame(() => {
      this._frame = undefined;
      const scroller = this.renderRoot.querySelector<HTMLElement>(".scroller");
      const track = this.renderRoot.querySelector<HTMLElement>(".track");
      const active = this.renderRoot.querySelector<HTMLElement>(
        'button[aria-selected="true"]',
      );
      if (!scroller || !track || !active) return;
      track.style.setProperty(
        "--wzc-camera-switcher-active-offset",
        `${active.offsetLeft}px`,
      );
      const indicator = track.querySelector<HTMLElement>(".active-indicator");
      if (indicator) indicator.style.inlineSize = `${active.offsetWidth}px`;
      const activeStart = active.offsetLeft;
      const activeEnd = activeStart + active.offsetWidth;
      const viewportStart = scroller.scrollLeft;
      const viewportEnd = viewportStart + scroller.clientWidth;
      if (activeStart < viewportStart || activeEnd > viewportEnd) {
        const centeredLeft =
          activeStart - (scroller.clientWidth - active.offsetWidth) / 2;
        scroller.scrollTo({
          behavior: reducedMotion() ? "auto" : "smooth",
          left: Math.max(0, centeredLeft),
        });
      }
    });
  }

  static styles = cameraSwitcherStyles;
}

function reducedMotion(): boolean {
  return (
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

if (!customElements.get(CAMERA_SWITCHER_TAG)) {
  customElements.define(CAMERA_SWITCHER_TAG, CameraSwitcherComponent);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_SWITCHER_TAG]: CameraSwitcherComponent;
  }
}
