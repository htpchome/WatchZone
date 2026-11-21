import { html, LitElement, nothing } from "lit";

import {
  TWO_WAY_TALK_CONNECT_EVENT,
  TWO_WAY_TALK_CONTROLS_TAG,
  TWO_WAY_TALK_MICROPHONE_EVENT,
  TWO_WAY_TALK_SPEAKER_EVENT,
  TWO_WAY_TALK_STOP_EVENT,
} from "../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { renderIcon } from "../icons";
import { OwnedMotion, reducedMotionRequested } from "../motion";
import { roundButtonStyles } from "../overlay-control.styles";
import { PressInteractionController } from "../press-interaction.controller";
import { TalkSoundwaveController } from "../talk-soundwave.controller";
import { twoWayTalkControlsStyles } from "./controls.styles";

export type TwoWayTalkControlsStatus = "connected" | "connecting" | "ready";
type TalkControlAction = "connect" | "microphone" | "speaker" | "stop";

/** Shared, non-placeable TWT controls used by every presentation surface. */
export class TwoWayTalkControls extends LitElement {
  public static properties = {
    connectLabel: { attribute: false },
    disabled: { type: Boolean, reflect: true },
    incomingStream: { attribute: false },
    localize: { attribute: false },
    microphoneMuted: { type: Boolean },
    outgoingStream: { attribute: false },
    presentation: { reflect: true },
    speakerMuted: { type: Boolean },
    status: { reflect: true },
    stopLabel: { attribute: false },
  };

  public connectLabel = "";
  public disabled = false;
  public incomingStream?: MediaStream;
  public localize: LocalizeFunction = englishLocalize;
  public microphoneMuted = false;
  public outgoingStream?: MediaStream;
  public presentation: "overlay" | "standard" = "standard";
  public speakerMuted = true;
  public status: TwoWayTalkControlsStatus = "ready";
  public stopLabel = "";

  private readonly _press = new PressInteractionController<TalkControlAction>(
    this,
    {
      actionFor: (target) =>
        target.dataset.talkAction as TalkControlAction | undefined,
      start: () => undefined,
      end: (action, cancelled) => {
        if (!cancelled) this._dispatch(action);
      },
    },
  );
  private readonly _soundwave = new TalkSoundwaveController();
  private readonly _spinner = new OwnedMotion();
  private _spinnerElement?: HTMLElement;

  protected render() {
    if (this.status !== "connected") {
      const connecting = this.status === "connecting";
      return this._renderButton(
        "connect",
        connecting
          ? "round-button talk-button inactive inactive-button connecting"
          : "round-button talk-button inactive inactive-button",
        connecting
          ? this.localize("talk.cancel_connecting")
          : this.connectLabel || this.localize("talk.connect"),
        renderIcon("microphoneOff"),
        this.disabled && !connecting,
        connecting,
      );
    }
    return html`<div
      class="talk-controls"
      role="group"
      aria-label=${this.localize("talk.controls")}
    >
      <canvas aria-hidden="true"></canvas>
      ${this._renderButton(
        "microphone",
        "round-button talk-button",
        this.microphoneMuted
          ? this.localize("talk.unmute_microphone")
          : this.localize("talk.mute_microphone"),
        renderIcon(this.microphoneMuted ? "microphoneOff" : "microphone"),
      )}
      ${this._renderButton(
        "stop",
        this.microphoneMuted
          ? "round-button talk-button center muted"
          : "round-button talk-button center",
        this.stopLabel || this.localize("talk.disconnect"),
        renderIcon("microphone"),
      )}
      ${this._renderButton(
        "speaker",
        "round-button talk-button",
        this.speakerMuted
          ? this.localize("camera.unmute")
          : this.localize("camera.mute"),
        renderIcon(this.speakerMuted ? "volumeOff" : "volumeOn"),
      )}
    </div>`;
  }

  protected updated(): void {
    const spinner =
      this.renderRoot.querySelector<HTMLElement>(".connecting-spinner") ??
      undefined;
    if (spinner !== this._spinnerElement) {
      this._spinner.cancel();
      this._spinnerElement = spinner;
      if (spinner && !reducedMotionRequested()) {
        this._spinner.start(
          spinner,
          { transform: ["rotate(0deg)", "rotate(360deg)"] },
          { duration: 0.7, ease: "linear", repeat: Infinity },
        );
      }
    }
    if (this.status !== "connected") {
      this._soundwave.dispose();
      return;
    }
    this._soundwave.attach(
      this.renderRoot.querySelector<HTMLCanvasElement>("canvas") ?? undefined,
      this.outgoingStream,
      this.incomingStream,
    );
  }

  public disconnectedCallback(): void {
    this._spinner.cancel();
    this._spinnerElement = undefined;
    this._soundwave.dispose();
    super.disconnectedCallback();
  }

  private _renderButton(
    action: TalkControlAction,
    className: string,
    label: string,
    icon: unknown,
    disabled = false,
    busy = false,
  ) {
    return html`<button
      class=${className}
      type="button"
      data-talk-action=${action}
      aria-busy=${busy ? "true" : "false"}
      aria-label=${label}
      title=${label}
      ?disabled=${disabled}
      @click=${this._preventClick}
      @pointerdown=${this._press.handlePointerDown}
      @pointerup=${this._press.handlePointerUp}
      @pointercancel=${this._press.handlePointerCancel}
      @lostpointercapture=${this._press.handlePointerCancel}
      @keydown=${this._press.handleKeyDown}
      @keyup=${this._press.handleKeyUp}
    >
      ${icon}${busy ? html`<span class="connecting-spinner"></span>` : nothing}
    </button>`;
  }

  private _dispatch(action: TalkControlAction): void {
    const type =
      action === "connect"
        ? TWO_WAY_TALK_CONNECT_EVENT
        : action === "stop"
          ? TWO_WAY_TALK_STOP_EVENT
          : action === "microphone"
            ? TWO_WAY_TALK_MICROPHONE_EVENT
            : TWO_WAY_TALK_SPEAKER_EVENT;
    this.dispatchEvent(
      new CustomEvent(type, { bubbles: true, composed: true }),
    );
  }

  private readonly _preventClick = (event: Event): void =>
    event.preventDefault();

  static styles = [roundButtonStyles, twoWayTalkControlsStyles];
}

if (!customElements.get(TWO_WAY_TALK_CONTROLS_TAG)) {
  customElements.define(TWO_WAY_TALK_CONTROLS_TAG, TwoWayTalkControls);
}

declare global {
  interface HTMLElementTagNameMap {
    [TWO_WAY_TALK_CONTROLS_TAG]: TwoWayTalkControls;
  }
}
