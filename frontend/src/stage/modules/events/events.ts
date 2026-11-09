import { html, LitElement } from "lit";

import { listEvents, type EventItem } from "../../../api/events";
import { ActiveCameraActivityController } from "../../active-camera-activity.controller";
import type { CameraSelectionContext } from "../../camera-selection-context";
import {
  DEFAULT_EVENT_HISTORY_DAYS,
  EVENTS_TAG,
} from "../../../core/constants";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import type { ActivityListItem } from "../../../ui/activity-list";
import "../../../ui/activity-list";
import { ToastManager } from "../../../ui/toast-manager";
import "../../../ui/toast-region";
import { eventsStyles } from "./events.styles";

/** Active-camera event list with authoritative refresh reconciliation. */
export class EventsModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    cameraSelection: { attribute: false },
    displayEventTypeBadges: { attribute: false },
    displayObjectBadges: { attribute: false },
    displayZone: { attribute: false },
    historyDays: { attribute: false },
    localize: { attribute: false },
    roundedCorners: { attribute: false, type: Boolean },
    targetModuleId: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public cameraSelection?: CameraSelectionContext;
  public displayEventTypeBadges = true;
  public displayObjectBadges = true;
  public displayZone = true;
  public historyDays = DEFAULT_EVENT_HISTORY_DAYS;
  public localize: LocalizeFunction = englishLocalize;
  public roundedCorners = true;
  public targetModuleId = "";

  private readonly _toasts = new ToastManager(this);
  private readonly _activity = new ActiveCameraActivityController<EventItem>(
    this,
    () => ({
      api: this.api,
      cameraSelection: this.cameraSelection,
      historyDays: this.historyDays,
      targetModuleId: this.targetModuleId,
    }),
    listEvents,
    () =>
      this._toasts.error(this.localize("events.load_failed"), {
        key: "events-load-failed",
      }),
  );

  protected render() {
    const items = this._activity.items.map((event): ActivityListItem => ({
      cameraLabel: this._activity.activeCameraLabel ?? event.camera,
      clipUrl: event.clip_url,
      endTime: event.end_time,
      id: event.id,
      objectLabels: [
        event.label,
        ...(event.sub_label ? [event.sub_label] : []),
      ],
      playbackSources: event.playback_sources,
      preferredTransport: event.preferred_transport,
      revision: event.revision,
      snapshotUrl: event.snapshot_url,
      startTime: event.start_time,
      thumbnailUrl: event.thumbnail_url,
      typeBadge: event.has_clip
        ? { label: this.localize("events.clip"), variant: "success" }
        : undefined,
      zones: event.zones,
    }));
    return html`
      <wzc-activity-list
        .api=${this.api}
        .displayObjectBadges=${this.displayObjectBadges}
        .displayTypeBadges=${this.displayEventTypeBadges}
        .displayZone=${this.displayZone}
        .items=${items}
        .loading=${this._activity.loading}
        .localize=${this.localize}
        .retryMedia=${(item: ActivityListItem, url: string) =>
          this._activity.retryMedia(item, url)}
        .roundedCorners=${this.roundedCorners}
      ></wzc-activity-list>
      <wzc-toast-region .notices=${this._toasts.notices}></wzc-toast-region>
    `;
  }

  static styles = eventsStyles;
}

if (!customElements.get(EVENTS_TAG)) {
  customElements.define(EVENTS_TAG, EventsModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [EVENTS_TAG]: EventsModule;
  }
}
