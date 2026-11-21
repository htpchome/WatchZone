import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  PERSISTENT_TALK_TAG,
  TWO_WAY_TALK_CONNECT_EVENT,
  TWO_WAY_TALK_CONTROLS_TAG,
  TWO_WAY_TALK_MICROPHONE_EVENT,
  TWO_WAY_TALK_SPEAKER_EVENT,
  TWO_WAY_TALK_STOP_EVENT,
} from "../../core/constants";
import { englishLocalize } from "../../core/localization";
import { RESPONSIVE_WIDTHS } from "../../core/responsive-widths";
import { themeTokens } from "../../styles/theme-tokens";
import { renderIcon } from "../../ui/icons";
import { roundButtonStyles } from "../../ui/overlay-control.styles";
import "../../ui/two-way-talk/controls";
import { getPersistentTalkSession, type PersistentTalkSnapshot } from "./index";
import { persistentTalkStyles } from "./persistent-talk.styles";

const twoWayTalkControlsTag = unsafeStatic(TWO_WAY_TALK_CONTROLS_TAG);

/** Document-level TWT surface shown only away from the matching camera. */
export class PersistentTalkTile extends LitElement {
  private readonly _manager = getPersistentTalkSession();
  private _snapshot: PersistentTalkSnapshot = this._manager.snapshot;
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
      ${staticHtml`<${twoWayTalkControlsTag}
        class="controls"
        .connectLabel=${t("talk.restart")}
        .incomingStream=${this._snapshot.incomingStream}
        .localize=${t}
        .microphoneMuted=${this._snapshot.microphoneMuted}
        .outgoingStream=${this._snapshot.connection?.localStream}
        presentation="standard"
        .speakerMuted=${this._snapshot.muted}
        .status=${connected ? "connected" : connecting ? "connecting" : "ready"}
        .stopLabel=${t("talk.disconnect_keep_persistent")}
        @${unsafeStatic(TWO_WAY_TALK_CONNECT_EVENT)}=${this._toggleConnection}
        @${unsafeStatic(TWO_WAY_TALK_STOP_EVENT)}=${this._toggleConnection}
        @${unsafeStatic(TWO_WAY_TALK_MICROPHONE_EVENT)}=${this._toggleMicrophone}
        @${unsafeStatic(TWO_WAY_TALK_SPEAKER_EVENT)}=${this._toggleSpeaker}
      ></${twoWayTalkControlsTag}>`}
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
      this._layoutCompactControls(panel);
    });
  };

  private _layoutCompactControls(panel: HTMLElement): void {
    const identity = panel.querySelector<HTMLElement>(".identity");
    const controls = panel.querySelector<HTMLElement>(".controls");
    const navigate = panel.querySelector<HTMLElement>(".navigate");
    identity?.style.removeProperty("max-inline-size");
    if (
      window.innerWidth > RESPONSIVE_WIDTHS.compact ||
      !identity ||
      !controls ||
      !navigate
    ) {
      panel.style.removeProperty("--wzc-persistent-talk-compact-controls-left");
      return;
    }
    const panelBounds = panel.getBoundingClientRect();
    let identityBounds = identity.getBoundingClientRect();
    const controlsBounds = controls.getBoundingClientRect();
    const navigateBounds = navigate.getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(panel).columnGap) || 0;
    const centeredLeft = (panelBounds.width - controlsBounds.width) / 2;
    const maximumLeft =
      navigateBounds.left - panelBounds.left - gap - controlsBounds.width;
    let minimumLeft = identityBounds.right - panelBounds.left + gap;
    if (minimumLeft > maximumLeft) {
      const identityWidth = Math.max(
        0,
        maximumLeft - (identityBounds.left - panelBounds.left) - gap,
      );
      identity.style.maxInlineSize = `${identityWidth}px`;
      identityBounds = identity.getBoundingClientRect();
      minimumLeft = identityBounds.right - panelBounds.left + gap;
    }
    const left = Math.min(maximumLeft, Math.max(centeredLeft, minimumLeft));
    panel.style.setProperty(
      "--wzc-persistent-talk-compact-controls-left",
      `${Math.max(0, left)}px`,
    );
  }

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
