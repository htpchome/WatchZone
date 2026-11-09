export interface ActivityDateFilterState {
  readonly selectedDate?: string;
}

type ActivityDateFilterListener = (state: ActivityDateFilterState) => void;

const EMPTY_STATE: ActivityDateFilterState = {};

/** Shares one activity date selection across sibling activity modules. */
export class ActivityDateFilterContext {
  private readonly _listeners = new Set<ActivityDateFilterListener>();
  private _state = EMPTY_STATE;

  public get state(): ActivityDateFilterState {
    return this._state;
  }

  public select(selectedDate: string): void {
    if (this._state.selectedDate === selectedDate) return;
    this._state = { selectedDate };
    this._publish();
  }

  public reset(): void {
    if (!this._state.selectedDate) return;
    this._state = EMPTY_STATE;
    this._publish();
  }

  public subscribe(listener: ActivityDateFilterListener): () => void {
    this._listeners.add(listener);
    listener(this._state);
    return () => this._listeners.delete(listener);
  }

  private _publish(): void {
    for (const listener of this._listeners) listener(this._state);
  }
}
