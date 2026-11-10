export type ActivityClassificationFilter = "all" | "alert" | "detection";
export type ActivityReviewStatusFilter = "all" | "reviewed" | "unreviewed";

export interface ActivityReviewFacet {
  readonly classification: "alert" | "detection";
  readonly id: string;
  readonly labels: readonly string[];
  readonly relatedEventIds: readonly string[];
  readonly reviewed: boolean;
  readonly zones: readonly string[];
}

export interface ActivityEventFacet {
  readonly id: string;
  readonly labels: readonly string[];
  readonly zones: readonly string[];
}

export interface ActivityFilterState {
  readonly classification: ActivityClassificationFilter;
  readonly events: readonly ActivityEventFacet[];
  readonly labels: readonly string[];
  readonly reviews: readonly ActivityReviewFacet[];
  readonly reviewStatus: ActivityReviewStatusFilter;
  readonly zones: readonly string[];
}

type ActivityFilterListener = (state: ActivityFilterState) => void;

const EMPTY_STATE: ActivityFilterState = {
  classification: "all",
  events: [],
  labels: [],
  reviews: [],
  reviewStatus: "all",
  zones: [],
};

/** Owns camera-scoped activity filters and the facets that populate them. */
export class ActivityFilterContext {
  private _activeEntityId?: string;
  private readonly _listeners = new Map<string, Set<ActivityFilterListener>>();
  private readonly _states = new Map<string, ActivityFilterState>();

  public stateFor(entityId: string): ActivityFilterState {
    return this._states.get(entityId) ?? EMPTY_STATE;
  }

  public setClassification(
    entityId: string,
    classification: ActivityClassificationFilter,
  ): void {
    this._update(entityId, { classification });
  }

  public setReviewStatus(
    entityId: string,
    reviewStatus: ActivityReviewStatusFilter,
  ): void {
    this._update(entityId, { reviewStatus });
  }

  public toggleLabel(entityId: string, label: string): void {
    const current = this.stateFor(entityId).labels;
    this._update(entityId, {
      labels: current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label],
    });
  }

  public clearLabels(entityId: string): void {
    this._update(entityId, { labels: [] });
  }

  public toggleZone(entityId: string, zone: string): void {
    const current = this.stateFor(entityId).zones;
    this._update(entityId, {
      zones: current.includes(zone)
        ? current.filter((item) => item !== zone)
        : [...current, zone],
    });
  }

  public clearZones(entityId: string): void {
    this._update(entityId, { zones: [] });
  }

  public resetFilters(entityId: string): void {
    this._update(entityId, {
      classification: "all",
      labels: [],
      reviewStatus: "all",
      zones: [],
    });
  }

  public publishReviews(
    entityId: string,
    reviews: readonly ActivityReviewFacet[],
  ): void {
    this._activate(entityId);
    this._update(entityId, { reviews });
  }

  public mergeReviews(
    entityId: string,
    reviews: readonly ActivityReviewFacet[],
  ): void {
    const merged = new Map(
      this.stateFor(entityId).reviews.map((review) => [review.id, review]),
    );
    for (const review of reviews) merged.set(review.id, review);
    this.publishReviews(entityId, [...merged.values()]);
  }

  public publishEvents(
    entityId: string,
    events: readonly ActivityEventFacet[],
  ): void {
    this._activate(entityId);
    this._update(entityId, { events });
  }

  public subscribe(
    entityId: string,
    listener: ActivityFilterListener,
  ): () => void {
    const listeners = this._listeners.get(entityId) ?? new Set();
    listeners.add(listener);
    this._listeners.set(entityId, listeners);
    listener(this.stateFor(entityId));
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this._listeners.delete(entityId);
    };
  }

  private _update(
    entityId: string,
    update: Partial<ActivityFilterState>,
  ): void {
    const previous = this.stateFor(entityId);
    const next = { ...previous, ...update };
    if (sameState(previous, next)) return;
    this._states.set(entityId, next);
    for (const listener of this._listeners.get(entityId) ?? []) listener(next);
  }

  private _activate(entityId: string): void {
    const previous = this._activeEntityId;
    if (previous && previous !== entityId) {
      this._update(previous, { events: [], reviews: [] });
    }
    this._activeEntityId = entityId;
  }
}

function sameState(
  previous: ActivityFilterState,
  next: ActivityFilterState,
): boolean {
  return (
    previous.classification === next.classification &&
    previous.events === next.events &&
    previous.labels === next.labels &&
    previous.reviews === next.reviews &&
    previous.reviewStatus === next.reviewStatus &&
    previous.zones === next.zones
  );
}
