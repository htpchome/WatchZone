import { html, LitElement } from "lit";

import {
  MEDIA_CONTROL_EVENT,
  MEDIA_CONTROLS_TAG,
  MEDIA_OVERLAY_INTERACTION_EVENT,
} from "../core/constants";
import { renderIcon, type IconName } from "./icons";
import { releaseTouchFocus } from "./control-interaction";
import { mediaControlsOverlayStyles } from "./media-controls-overlay.styles";
import { mediaOverlayControlButtonStyles } from "./overlay-control.styles";

export interface MediaControlDescriptor<Action extends string = string> {
  readonly action: Action;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly icon: IconName;
  readonly label: string;
  readonly pending?: boolean;
}

export interface MediaControlEventDetail<Action extends string = string> {
  readonly action: Action;
}

/** Renders provider- and player-neutral media controls in one geometry system. */
export class MediaControlsOverlay extends LitElement {
  public static properties = {
    controls: { attribute: false },
    label: { attribute: false },
    visible: { reflect: true, type: Boolean },
    viewportEdge: {
      attribute: "viewport-edge",
      reflect: true,
      type: Boolean,
    },
  };

  public controls: readonly MediaControlDescriptor[] = [];
  public label = "";
  public visible = true;
  public viewportEdge = false;

  protected render() {
    return html`<div
      class="control-group"
      role="toolbar"
      aria-label=${this.label}
      @pointerdown=${this._handlePointerDown}
      @keydown=${this._stopPropagation}
    >
      ${this.controls.map(
        (control) =>
          html`<button
            class="control-button"
            type="button"
            data-control=${control.action}
            title=${control.label}
            aria-label=${control.label}
            aria-busy=${control.pending ? "true" : "false"}
            aria-pressed=${control.active ? "true" : "false"}
            ?disabled=${control.disabled || control.pending}
            @pointerup=${releaseTouchFocus}
            @pointercancel=${releaseTouchFocus}
            @click=${() => this._dispatch(control.action)}
          >
            ${renderIcon(control.icon)}
          </button>`,
      )}
    </div>`;
  }

  private readonly _stopPropagation = (event: Event): void =>
    event.stopPropagation();

  private readonly _handlePointerDown = (event: PointerEvent): void => {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent(MEDIA_OVERLAY_INTERACTION_EVENT, {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private _dispatch(action: string): void {
    this.dispatchEvent(
      new CustomEvent<MediaControlEventDetail>(MEDIA_CONTROL_EVENT, {
        bubbles: true,
        composed: true,
        detail: { action },
      }),
    );
  }

  static styles = [mediaOverlayControlButtonStyles, mediaControlsOverlayStyles];
}

if (!customElements.get(MEDIA_CONTROLS_TAG)) {
  customElements.define(MEDIA_CONTROLS_TAG, MediaControlsOverlay);
}

declare global {
  interface HTMLElementTagNameMap {
    [MEDIA_CONTROLS_TAG]: MediaControlsOverlay;
  }
}
