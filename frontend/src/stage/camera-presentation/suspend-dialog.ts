import { html, LitElement, nothing } from "lit";

import { APP_NAME, CAMERA_SUSPEND_DIALOG_TAG } from "../../core/constants";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { renderIcon } from "../../ui/icons";
import { motionDurations, motionEasings, OwnedMotion } from "../../ui/motion";
import { cameraSuspendDialogStyles } from "./suspend-dialog.styles";

export interface CameraSuspendConfirmDetail {
  readonly resumeAfterSeconds?: number;
  readonly suspended: boolean;
}

export class CameraSuspendDialog extends LitElement {
  public static properties = {
    active: { attribute: false, type: Boolean },
    currentSuspended: { attribute: false, type: Boolean },
    localize: { attribute: false },
    pending: { attribute: false, type: Boolean },
  };

  public active = false;
  public currentSuspended = false;
  public localize: LocalizeFunction = englishLocalize;
  public pending = false;

  private _hours = 1;
  private _minutes = 0;
  private _timerEnabled = false;
  private readonly _switchMotion = new OwnedMotion();
  private readonly _knobMotion = new OwnedMotion();
  private _renderedTimerEnabled?: boolean;

  protected render() {
    const suspending = !this.currentSuspended;
    const durationSeconds = this._durationSeconds();
    return html`<dialog @cancel=${this._cancel} @close=${this._closed}>
      <form @submit=${this._confirm}>
        <header>
          <span
            class=${suspending ? "dialog-icon suspend" : "dialog-icon resume"}
            aria-hidden="true"
            >${renderIcon("power")}</span
          >
          <div class="heading-copy">
            <h2>
              ${
                suspending
                  ? this.localize("camera.suspend_question")
                  : this.localize("camera.resume_question")
              }
            </h2>
            <p>
              ${
                suspending
                  ? this.localize("camera.suspend_description")
                  : this.localize("camera.resume_description")
              }
            </p>
          </div>
        </header>
        ${
          suspending
            ? html`<p class="warning">
                  ${this.localize("camera.suspend_warning", { app: APP_NAME })}
                </p>
                <label class="timer-toggle">
                  <span>${this.localize("camera.automatically_resume")}</span>
                  <span
                    class=${this._timerEnabled ? "timer-switch enabled" : "timer-switch"}
                  >
                    <input
                      type="checkbox"
                      role="switch"
                      .checked=${this._timerEnabled}
                      ?disabled=${this.pending}
                      @change=${this._toggleTimer}
                    />
                    <span class="timer-knob" aria-hidden="true"></span>
                  </span>
                </label>
                ${
                  this._timerEnabled
                    ? html`<div class="duration">
                        <label>
                          ${this.localize("camera.hours")}
                          <input
                            type="number"
                            inputmode="numeric"
                            min="0"
                            max="720"
                            .value=${String(this._hours)}
                            ?disabled=${this.pending}
                            @input=${this._changeHours}
                          />
                        </label>
                        <label>
                          ${this.localize("camera.minutes")}
                          <input
                            type="number"
                            inputmode="numeric"
                            min="0"
                            max="59"
                            .value=${String(this._minutes)}
                            ?disabled=${this.pending}
                            @input=${this._changeMinutes}
                          />
                        </label>
                      </div>`
                    : nothing
                }`
            : nothing
        }
        <footer>
          <button
            type="button"
            ?disabled=${this.pending}
            @click=${this._cancel}
          >
            ${this.localize("common.cancel")}
          </button>
          <button
            class=${suspending ? "primary" : "resume"}
            type="submit"
            ?disabled=${
              this.pending ||
              (suspending && this._timerEnabled && durationSeconds < 60)
            }
          >
            ${
              this.pending
                ? suspending
                  ? this.localize("camera.suspending_progress")
                  : this.localize("camera.resuming_progress")
                : suspending
                  ? this.localize("camera.suspend")
                  : this.localize("camera.resume")
            }
          </button>
        </footer>
      </form>
    </dialog>`;
  }

  protected updated(changed: Map<PropertyKey, unknown>): void {
    const timerSwitch =
      this.renderRoot.querySelector<HTMLElement>(".timer-switch") ?? undefined;
    const knob =
      this.renderRoot.querySelector<HTMLElement>(".timer-knob") ?? undefined;
    if (
      timerSwitch &&
      knob &&
      this._renderedTimerEnabled !== undefined &&
      this._renderedTimerEnabled !== this._timerEnabled
    ) {
      this._switchMotion.start(
        timerSwitch,
        {
          backgroundColor: this._timerEnabled
            ? "var(--wzc-color-primary)"
            : "var(--wzc-color-surface-secondary)",
          borderColor: this._timerEnabled
            ? "var(--wzc-color-primary)"
            : "var(--wzc-color-border-control)",
        },
        { duration: motionDurations.overlay, ease: motionEasings.standard },
      );
      this._knobMotion.start(
        knob,
        {
          insetInlineStart: this._timerEnabled
            ? "calc(100% - 1.1875rem)"
            : "0.1875rem",
        },
        { duration: motionDurations.overlay, ease: motionEasings.standard },
      );
    }
    this._renderedTimerEnabled = this._timerEnabled;
    if (changed.has("active")) {
      const dialog = this.renderRoot.querySelector("dialog");
      if (!dialog) return;
      if (this.active && !dialog.open) dialog.showModal();
      else if (!this.active && dialog.open) dialog.close();
    }
  }

  public disconnectedCallback(): void {
    this._switchMotion.cancel();
    this._knobMotion.cancel();
    super.disconnectedCallback();
  }

  private _durationSeconds(): number {
    return (this._hours * 60 + this._minutes) * 60;
  }

  private readonly _toggleTimer = (event: Event): void => {
    this._timerEnabled = (event.currentTarget as HTMLInputElement).checked;
    this.requestUpdate();
  };

  private readonly _changeHours = (event: Event): void => {
    this._hours = clampNumber(event, 0, 720);
    this.requestUpdate();
  };

  private readonly _changeMinutes = (event: Event): void => {
    this._minutes = clampNumber(event, 0, 59);
    this.requestUpdate();
  };

  private readonly _confirm = (event: SubmitEvent): void => {
    event.preventDefault();
    const suspended = !this.currentSuspended;
    this.dispatchEvent(
      new CustomEvent<CameraSuspendConfirmDetail>("camera-suspend-confirm", {
        bubbles: true,
        composed: true,
        detail: {
          suspended,
          ...(suspended && this._timerEnabled
            ? { resumeAfterSeconds: this._durationSeconds() }
            : {}),
        },
      }),
    );
  };

  private readonly _cancel = (event: Event): void => {
    event.preventDefault();
    if (this.pending) return;
    this.dispatchEvent(
      new CustomEvent("camera-suspend-cancel", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private readonly _closed = (): void => {
    if (!this.active) return;
    this.dispatchEvent(
      new CustomEvent("camera-suspend-cancel", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  static styles = cameraSuspendDialogStyles;
}

function clampNumber(event: Event, minimum: number, maximum: number): number {
  const value = Number((event.currentTarget as HTMLInputElement).value);
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

if (!customElements.get(CAMERA_SUSPEND_DIALOG_TAG)) {
  customElements.define(CAMERA_SUSPEND_DIALOG_TAG, CameraSuspendDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    [CAMERA_SUSPEND_DIALOG_TAG]: CameraSuspendDialog;
  }
}
