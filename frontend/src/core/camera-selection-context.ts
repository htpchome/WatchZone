export interface CameraSelectionItem {
  readonly entityId: string;
  readonly label: string;
}

export interface CameraSelectionState {
  readonly activeEntityId?: string;
  readonly items: readonly CameraSelectionItem[];
}

type SelectionListener = (state: CameraSelectionState) => void;
type SelectionHandler = (entityId: string) => void;

interface SelectionChannel {
  readonly listeners: Set<SelectionListener>;
  owner?: object;
  select?: SelectionHandler;
  state: CameraSelectionState;
}

const EMPTY_STATE: CameraSelectionState = { items: [] };

/** Coordinates a camera module with portable selectors in the same layout. */
export class CameraSelectionContext {
  private readonly _channels = new Map<string, SelectionChannel>();

  public publish(
    targetId: string,
    owner: object,
    state: CameraSelectionState,
    select: SelectionHandler,
  ): void {
    const channel = this._channel(targetId);
    channel.owner = owner;
    channel.select = select;
    if (sameState(channel.state, state)) return;
    channel.state = state;
    for (const listener of channel.listeners) listener(state);
  }

  public clear(targetId: string, owner: object): void {
    const channel = this._channels.get(targetId);
    if (!channel || channel.owner !== owner) return;
    channel.owner = undefined;
    channel.select = undefined;
    if (!sameState(channel.state, EMPTY_STATE)) {
      channel.state = EMPTY_STATE;
      for (const listener of channel.listeners) listener(EMPTY_STATE);
    }
    if (channel.listeners.size === 0) this._channels.delete(targetId);
  }

  public select(targetId: string, entityId: string): boolean {
    const channel = this._channels.get(targetId);
    if (!channel?.select) return false;
    if (!channel.state.items.some((item) => item.entityId === entityId)) {
      return false;
    }
    channel.select(entityId);
    return true;
  }

  public subscribe(targetId: string, listener: SelectionListener): () => void {
    const channel = this._channel(targetId);
    channel.listeners.add(listener);
    listener(channel.state);
    return () => {
      channel.listeners.delete(listener);
      if (!channel.owner && channel.listeners.size === 0) {
        this._channels.delete(targetId);
      }
    };
  }

  private _channel(targetId: string): SelectionChannel {
    const existing = this._channels.get(targetId);
    if (existing) return existing;
    const channel: SelectionChannel = {
      listeners: new Set(),
      state: EMPTY_STATE,
    };
    this._channels.set(targetId, channel);
    return channel;
  }
}

function sameState(
  current: CameraSelectionState,
  next: CameraSelectionState,
): boolean {
  if (
    current.activeEntityId !== next.activeEntityId ||
    current.items.length !== next.items.length
  ) {
    return false;
  }
  return current.items.every(
    (item, index) =>
      item.entityId === next.items[index]?.entityId &&
      item.label === next.items[index]?.label,
  );
}
