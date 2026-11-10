import { html, LitElement, type PropertyValues } from "lit";

import { listEvents, type EventItem } from "../../../api/events";
import {
  ActiveCameraActivityController,
  ActivityFilterController,
  type ActivityFilterContext,
} from "../../activity";
import type { CameraSelectionContext } from "../../camera-selection-context";
import type { MediaDateContext } from "../../media-date-context";
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
    activityFilter: { attribute: false },
    cameraSelection: { attribute: false },
    displayEventTypeBadges: { attribute: false },
    displayObjectBadges: { attribute: false },
    displayZone: { attribute: false },
    historyDays: { attribute: false },
    localize: { attribute: false },
    mediaDate: { attribute: false },
    roundedCorners: { attribute: false, type: Boolean },
    shadows: { attribute: false, type: Boolean },
    targetModuleId: { attribute: false },
  };

  public api?: HomeAssistantApi;
  public activityFilter?: ActivityFilterContext;
  public cameraSelection?: CameraSelectionContext;
  public displayEventTypeBadges = true;
  public displayObjectBadges = true;
  public displayZone = true;
  public historyDays = DEFAULT_EVENT_HISTORY_DAYS;
  public localize: LocalizeFunction = englishLocalize;
  public mediaDate?: MediaDateContext;
  public roundedCorners = true;
  public shadows = true;
  public targetModuleId = "";

  private readonly _toasts = new ToastManager(this);
  private _publishedActivity?: readonly EventItem[];
  private _publishedEntityId?: string;
  private _publishedFilter?: ActivityFilterContext;
  private readonly _filter = new ActivityFilterController(
    this,
    () => this.activityFilter,
    () => this.mediaDate,
    () => this.cameraSelection,
    () => this.targetModuleId,
    () => this.api?.locale,
    "events",
  );
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
    "events",
  );

  protected update(changed: PropertyValues<this>): void {
    const entityId = this._activity.activeEntityId;
    if (
      entityId &&
      this.activityFilter &&
      (this._publishedActivity !== this._activity.items ||
        this._publishedEntityId !== entityId ||
        this._publishedFilter !== this.activityFilter)
    ) {
      this._publishedActivity = this._activity.items;
      this._publishedEntityId = entityId;
      this._publishedFilter = this.activityFilter;
      this.activityFilter.publishEvents(
        entityId,
        this._activity.items.map((event) => ({
          id: event.id,
          labels: [event.label, ...(event.sub_label ? [event.sub_label] : [])],
          zones: event.zones,
        })),
      );
    }
    super.update(changed);
  }

  protected render() {
    const items = this._activity.items
      .filter((event) =>
        this._filter.includesEvent({
          id: event.id,
          labels: [event.label, ...(event.sub_label ? [event.sub_label] : [])],
          startTime: event.start_time,
          zones: event.zones,
        }),
      )
      .map((event): ActivityListItem => ({
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
        .selectedDate=${this._filter.selectedDate()}
        .shadows=${this.shadows}
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
