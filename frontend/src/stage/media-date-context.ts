type MediaDateListener = (selectedDate: string | undefined) => void;
type MediaAvailabilityListener = (availableDates: readonly string[]) => void;

interface MediaAvailability {
  readonly availableDates: readonly string[];
  readonly listeners: Set<MediaAvailabilityListener>;
  owner?: object;
}

/** Camera-scoped date selection shared by media-list modules in one Stage. */
export class MediaDateContext {
  private readonly _dates = new Map<string, string>();
  private readonly _listeners = new Map<string, Set<MediaDateListener>>();
  private readonly _availability = new Map<string, MediaAvailability>();

  public selectedDate(entityId: string): string | undefined {
    return this._dates.get(entityId);
  }

  public select(entityId: string, selectedDate: string): void {
    if (this._dates.get(entityId) === selectedDate) return;
    this._dates.set(entityId, selectedDate);
    this._publish(entityId, selectedDate);
  }

  public reset(entityId: string): void {
    if (!this._dates.delete(entityId)) return;
    this._publish(entityId, undefined);
  }

  public subscribe(entityId: string, listener: MediaDateListener): () => void {
    const listeners = this._listeners.get(entityId) ?? new Set();
    listeners.add(listener);
    this._listeners.set(entityId, listeners);
    listener(this.selectedDate(entityId));
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this._listeners.delete(entityId);
    };
  }

  public publishAvailableDates(
    entityId: string,
    owner: object,
    availableDates: readonly string[],
  ): void {
    const availability = this._availabilityFor(entityId);
    const dates = [...availableDates];
    if (
      availability.owner === owner &&
      dates.length === availability.availableDates.length &&
      dates.every((date, index) => date === availability.availableDates[index])
    ) {
      return;
    }
    availability.owner = owner;
    this._availability.set(entityId, {
      ...availability,
      availableDates: dates,
    });
    for (const listener of availability.listeners) listener(dates);
  }

  public clearAvailableDates(entityId: string, owner: object): void {
    const availability = this._availability.get(entityId);
    if (!availability || availability.owner !== owner) return;
    availability.owner = undefined;
    if (availability.availableDates.length > 0) {
      this._availability.set(entityId, {
        ...availability,
        availableDates: [],
      });
      for (const listener of availability.listeners) listener([]);
    }
    if (availability.listeners.size === 0) this._availability.delete(entityId);
  }

  public subscribeAvailableDates(
    entityId: string,
    listener: MediaAvailabilityListener,
  ): () => void {
    const availability = this._availabilityFor(entityId);
    availability.listeners.add(listener);
    listener(availability.availableDates);
    return () => {
      availability.listeners.delete(listener);
      if (!availability.owner && availability.listeners.size === 0) {
        this._availability.delete(entityId);
      }
    };
  }

  private _publish(entityId: string, selectedDate: string | undefined): void {
    for (const listener of this._listeners.get(entityId) ?? []) {
      listener(selectedDate);
    }
  }

  private _availabilityFor(entityId: string): MediaAvailability {
    const existing = this._availability.get(entityId);
    if (existing) return existing;
    const availability: MediaAvailability = {
      availableDates: [],
      listeners: new Set(),
    };
    this._availability.set(entityId, availability);
    return availability;
  }
}
