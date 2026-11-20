import { html, LitElement, nothing } from "lit";

import { PERSISTENT_TALK_TAG } from "../../core/constants";
import { englishLocalize } from "../../core/localization";
import { themeTokens } from "../../styles/theme-tokens";
import { renderIcon } from "../../ui/icons";
import { roundButtonStyles } from "../../ui/overlay-control.styles";
import { TalkSoundwaveController } from "../../ui/talk-soundwave.controller";
import { OwnedMotion, reducedMotionRequested } from "../../ui/motion";
import { getPersistentTalkSession, type PersistentTalkSnapshot } from "./index";
import { persistentTalkStyles } from "./persistent-talk.styles";

/** Document-level TWT surface shown only away from the matching camera. */
export class PersistentTalkTile extends LitElement {
  private readonly _manager = getPersistentTalkSession();
  private _snapshot: PersistentTalkSnapshot = this._manager.snapshot;
  private readonly _soundwave = new TalkSoundwaveController();
  private readonly _spinner = new OwnedMotion();
  private _spinnerElement?: HTMLElement;
  private _unsubscribe?: () => void;
  private _dashboardPanel?: Element;
  private _layoutFrame?: number;
  private _layoutObserver?: ResizeObserver;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribe ??= this._manager.subscribe((snapshot) => {
      this._snapshot = snapshot;
      this.requestUpdate();
    });
    window.addEventListener("resize", this._scheduleDashboardLayout);
    window.addEventListener("location-changed", this._refreshDashboardPanel);
    this._refreshDashboardPanel();
  }

  public disconnectedCallback(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._soundwave.dispose();
    this._spinner.cancel();
    this._spinnerElement = undefined;
    window.removeEventListener("resize", this._scheduleDashboardLayout);
    window.removeEventListener("location-changed", this._refreshDashboardPanel);
    this._layoutObserver?.disconnect();
    this._layoutObserver = undefined;
    this._dashboardPanel = undefined;
    if (this._layoutFrame !== undefined) {
      cancelAnimationFrame(this._layoutFrame);
      this._layoutFrame = undefined;
    }
    super.disconnectedCallback();
  }

  protected render() {
    const { status, surfaceActive, target } = this._snapshot;
    if (!target || surfaceActive) return nothing;
    const t = target.localize ?? englishLocalize;
    const connected = status === "connected";
    const connecting = status === "connecting";
    return html`<aside
      class="persistent-talk"
      popover="manual"
      role="region"
      aria-label=${t("talk.persistent_controls")}
    >
      <button
        class="round-button dismiss"
        type="button"
        title=${t("talk.dismiss_persistent")}
        aria-label=${t("talk.dismiss_persistent")}
        @click=${this._dismiss}
      >
        ${renderIcon("close")}
      </button>
      <div class="identity">
        <div class="title">${t("talk.persistent_title")}</div>
        <div class="camera-name">${target.label}</div>
      </div>
      <div class="controls" role="group" aria-label=${t("talk.controls")}>
        ${connected ? html`<canvas aria-hidden="true"></canvas>` : nothing}
        <button
          class="round-button"
          type="button"
          title=${
            this._snapshot.microphoneMuted
              ? t("talk.unmute_microphone")
              : t("talk.mute_microphone")
          }
          aria-label=${
            this._snapshot.microphoneMuted
              ? t("talk.unmute_microphone")
              : t("talk.mute_microphone")
          }
          ?disabled=${!connected}
          @click=${this._toggleMicrophone}
        >
          ${renderIcon(
            this._snapshot.microphoneMuted ? "microphoneOff" : "microphone",
          )}
        </button>
        <button
          class=${[
            "round-button",
            "center",
            this._snapshot.microphoneMuted ? "muted" : "",
            connected ? "" : "ready",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          title=${
            connected
              ? t("talk.disconnect_keep_persistent")
              : connecting
                ? t("talk.cancel_connecting")
                : t("talk.restart")
          }
          aria-label=${
            connected
              ? t("talk.disconnect_keep_persistent")
              : connecting
                ? t("talk.cancel_connecting")
                : t("talk.restart")
          }
          aria-busy=${connecting ? "true" : "false"}
          @click=${this._toggleConnection}
        >
          ${renderIcon(connected || connecting ? "microphone" : "microphoneOff")}
          ${connecting ? html`<span class="connecting-spinner"></span>` : nothing}
        </button>
        <button
          class="round-button"
          type="button"
          title=${this._snapshot.muted ? t("camera.unmute") : t("camera.mute")}
          aria-label=${
            this._snapshot.muted ? t("camera.unmute") : t("camera.mute")
          }
          ?disabled=${!connected}
          @click=${this._toggleSpeaker}
        >
          ${renderIcon(this._snapshot.muted ? "volumeOff" : "volumeOn")}
        </button>
      </div>
      <button
        class="round-button navigate"
        type="button"
        title=${t("talk.return_to_camera")}
        aria-label=${t("talk.return_to_camera")}
        @click=${this._returnToCamera}
      >
        ${renderIcon("camera")}
      </button>
    </aside>`;
  }

  protected updated(): void {
    const panel =
      this.renderRoot.querySelector<HTMLElement>(".persistent-talk");
    if (panel && "showPopover" in panel && !panel.matches(":popover-open")) {
      try {
        panel.showPopover();
      } catch {
        // The fixed-layer fallback remains available if top-layer entry fails.
      }
    }
    this._scheduleDashboardLayout();
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
    const { connection, incomingStream, status } = this._snapshot;
    if (status !== "connected") {
      this._soundwave.dispose();
      return;
    }
    this._soundwave.attach(
      this.renderRoot.querySelector<HTMLCanvasElement>("canvas") ?? undefined,
      connection?.localStream,
      incomingStream,
    );
  }

  private readonly _dismiss = (): void => this._manager.dismiss();
  private readonly _returnToCamera = (): void => this._manager.returnToCamera();
  private readonly _toggleConnection = (): void => {
    if (this._snapshot.status === "connected") {
      this._manager.stopAndRetain();
    } else if (this._snapshot.status === "connecting") {
      this._manager.stopAndRetain();
    } else {
      void this._manager.start();
    }
  };
  private readonly _toggleMicrophone = (): void =>
    this._manager.toggleMicrophoneMute();
  private readonly _toggleSpeaker = (): void => this._manager.toggleSpeaker();

  private readonly _refreshDashboardPanel = (): void => {
    requestAnimationFrame(() => {
      if (!this.isConnected) return;
      const nextPanel = findHomeAssistantDashboardPanel();
      if (nextPanel !== this._dashboardPanel) {
        this._layoutObserver?.disconnect();
        this._dashboardPanel = nextPanel;
        if (nextPanel && typeof ResizeObserver !== "undefined") {
          this._layoutObserver = new ResizeObserver(
            this._scheduleDashboardLayout,
          );
          this._layoutObserver.observe(nextPanel);
        }
      }
      this._scheduleDashboardLayout();
    });
  };

  private readonly _scheduleDashboardLayout = (): void => {
    if (this._layoutFrame !== undefined) return;
    this._layoutFrame = requestAnimationFrame(() => {
      this._layoutFrame = undefined;
      const panel =
        this.renderRoot.querySelector<HTMLElement>(".persistent-talk");
      if (!panel) return;
      const bounds = this._dashboardPanel?.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const left = bounds && bounds.width > 0 ? Math.max(0, bounds.left) : 0;
      const right = bounds
        ? Math.min(viewportWidth, bounds.right)
        : viewportWidth;
      const width = Math.max(0, right - left);
      panel.style.setProperty(
        "--wzc-persistent-talk-center-x",
        `${left + width / 2}px`,
      );
      panel.style.setProperty(
        "--wzc-persistent-talk-available-width",
        `${width}px`,
      );
    });
  };

  static styles = [themeTokens, roundButtonStyles, persistentTalkStyles];
}

function findHomeAssistantDashboardPanel(): Element | undefined {
  const main = findAcrossOpenShadowRoots("home-assistant-main");
  return main?.shadowRoot?.querySelector("partial-panel-resolver") ?? undefined;
}

function findAcrossOpenShadowRoots(selector: string): Element | undefined {
  const roots: Array<Document | ShadowRoot> = [document];
  for (const root of roots) {
    const match = root.querySelector(selector);
    if (match) return match;
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }
  return undefined;
}

if (!customElements.get(PERSISTENT_TALK_TAG)) {
  customElements.define(PERSISTENT_TALK_TAG, PersistentTalkTile);
}

declare global {
  interface HTMLElementTagNameMap {
    [PERSISTENT_TALK_TAG]: PersistentTalkTile;
  }
}
