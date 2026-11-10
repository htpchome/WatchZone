import type { ReactiveController, ReactiveControllerHost } from "lit";

import { homeAssistantDateKey } from "../../core/date-time";
import type { HomeAssistantLocale } from "../../core/home-assistant";
import type { CameraSelectionContext } from "../camera-selection-context";
import type {
  ActivityFilterContext,
  ActivityFilterState,
} from "./activity-filter-context";

interface ReviewCandidate {
  readonly classification: "alert" | "detection";
  readonly labels: readonly string[];
  readonly reviewed: boolean;
  readonly startTime: number;
  readonly zones: readonly string[];
}

interface EventCandidate {
  readonly id: string;
  readonly labels: readonly string[];
  readonly startTime: number;
  readonly zones: readonly string[];
}

const EMPTY_STATE: ActivityFilterState = {
  classification: "all",
  events: [],
  labels: [],
  reviews: [],
  reviewStatus: "all",
  zones: [],
};

/** Makes camera-scoped activity filtering reactive inside a placeable. */
export class ActivityFilterController implements ReactiveController {
  public state = EMPTY_STATE;

  private _activeEntityId?: string;
  private _connected = false;
  private _subscribedContext?: ActivityFilterContext;
  private _subscribedEntityId?: string;
  private _subscribedSelection?: CameraSelectionContext;
  private _subscribedTarget = "";
  private _unsubscribeFilter?: () => void;
  private _unsubscribeSelection?: () => void;

  public constructor(
    private readonly _host: ReactiveControllerHost,
    private readonly _context: () => ActivityFilterContext | undefined,
    private readonly _cameraSelection: () => CameraSelectionContext | undefined,
    private readonly _targetModuleId: () => string,
    private readonly _locale: () => HomeAssistantLocale | undefined,
    private readonly _kind: "reviews" | "events",
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this._connected = true;
    this._syncSelection();
  }

  public hostDisconnected(): void {
    this._connected = false;
    this._unsubscribeFilter?.();
    this._unsubscribeSelection?.();
    this._unsubscribeFilter = undefined;
    this._unsubscribeSelection = undefined;
    this._subscribedContext = undefined;
    this._subscribedEntityId = undefined;
    this._subscribedSelection = undefined;
  }

  public hostUpdated(): void {
    this._syncSelection();
    this._syncFilter();
  }

  public includesReview(review: ReviewCandidate): boolean {
    return (
      this._includesDate(review.startTime) &&
      (this.state.classification === "all" ||
        review.classification === this.state.classification) &&
      (this.state.reviewStatus === "all" ||
        review.reviewed === (this.state.reviewStatus === "reviewed")) &&
      includesAny(review.labels, this.state.labels) &&
      includesAny(review.zones, this.state.zones)
    );
  }

  public includesEvent(event: EventCandidate): boolean {
    const related = this.state.reviews.filter(({ relatedEventIds }) =>
      relatedEventIds.includes(event.id),
    );
    const classificationMatches =
      this.state.classification === "all" ||
      related.some(
        ({ classification }) => classification === this.state.classification,
      );
    const reviewedMatches =
      this.state.reviewStatus === "all" ||
      (this.state.reviewStatus === "reviewed"
        ? related.some(({ reviewed }) => reviewed)
        : related.length === 0 || related.some(({ reviewed }) => !reviewed));
    return (
      this._includesDate(event.startTime) &&
      classificationMatches &&
      reviewedMatches &&
      includesAny(event.labels, this.state.labels) &&
      includesAny(event.zones, this.state.zones)
    );
  }

  private _includesDate(timestampSeconds: number): boolean {
    return (
      !this.state.selectedDate ||
      homeAssistantDateKey(timestampSeconds, this._locale()) ===
        this.state.selectedDate
    );
  }

  private _syncSelection(): void {
    if (!this._connected) return;
    const selection = this._cameraSelection();
    const target = this._targetModuleId();
    if (
      selection === this._subscribedSelection &&
      target === this._subscribedTarget
    ) {
      return;
    }
    this._unsubscribeSelection?.();
    this._subscribedSelection = selection;
    this._subscribedTarget = target;
    this._activeEntityId = undefined;
    if (selection && target) {
      this._unsubscribeSelection = selection.subscribe(
        target,
        ({ activeEntityId, settled }) => {
          if (settled === false) return;
          if (activeEntityId === this._activeEntityId) return;
          this._activeEntityId = activeEntityId;
          this._syncFilter();
        },
      );
    }
    this._syncFilter();
  }

  private _syncFilter(): void {
    const context = this._context();
    const entityId = this._activeEntityId;
    if (
      context === this._subscribedContext &&
      entityId === this._subscribedEntityId
    ) {
      return;
    }
    this._unsubscribeFilter?.();
    this._subscribedContext = context;
    this._subscribedEntityId = entityId;
    this.state = EMPTY_STATE;
    if (context && entityId) {
      this._unsubscribeFilter = context.subscribe(entityId, (state) => {
        if (state === this.state) return;
        const previous = this.state;
        this.state = state;
        if (
          filterSelectionChanged(previous, state) ||
          (this._kind === "events" && previous.reviews !== state.reviews)
        ) {
          this._host.requestUpdate();
        }
      });
    }
  }
}

function filterSelectionChanged(
  previous: ActivityFilterState,
  next: ActivityFilterState,
): boolean {
  return (
    previous.classification !== next.classification ||
    previous.labels !== next.labels ||
    previous.reviewStatus !== next.reviewStatus ||
    previous.selectedDate !== next.selectedDate ||
    previous.zones !== next.zones
  );
}

function includesAny(
  candidates: readonly string[],
  selected: readonly string[],
): boolean {
  return (
    selected.length === 0 || selected.some((item) => candidates.includes(item))
  );
}
