import type { ReviewItem } from "../api/reviews";

export interface CameraSelectionItem {
  readonly activity?: "alert" | "detection";
  readonly entityId: string;
  readonly entityIds?: readonly string[];
  readonly entityLabels?: readonly {
    readonly entityId: string;
    readonly label: string;
  }[];
  readonly label: string;
  readonly position?: "down" | "left" | "right" | "up";
}

export interface CameraSelectionState {
  readonly activeReviews?: readonly ReviewItem[];
  readonly activeEntityId?: string;
  readonly activeEntityIds?: readonly string[];
  readonly activeSelectionId?: string;
  readonly items: readonly CameraSelectionItem[];
  /** False while a direct-manipulation camera transition is still moving. */
  readonly settled?: boolean;
  readonly slideshowAvailable?: boolean;
  readonly slideshowEnabled?: boolean;
  readonly slideshowHeld?: boolean;
  readonly slideshowRemainingSeconds?: number;
  readonly takeoverAvailable?: boolean;
  readonly takeoverEnabled?: boolean;
}

type SelectionListener = (state: CameraSelectionState) => void;
type SelectionHandler = (entityId: string) => void;
type TakeoverToggleHandler = () => void;
type SlideshowToggleHandler = () => void;

interface SelectionChannel {
  activate?: SelectionHandler;
  readonly listeners: Set<SelectionListener>;
  owner?: object;
  select?: SelectionHandler;
  toggleTakeover?: TakeoverToggleHandler;
  toggleSlideshow?: SlideshowToggleHandler;
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
    toggleTakeover?: TakeoverToggleHandler,
    activate?: SelectionHandler,
    toggleSlideshow?: SlideshowToggleHandler,
  ): void {
    const channel = this._channel(targetId);
    channel.owner = owner;
    channel.select = select;
    channel.toggleTakeover = toggleTakeover;
    channel.activate = activate;
    channel.toggleSlideshow = toggleSlideshow;
    if (sameState(channel.state, state)) return;
    channel.state = state;
    for (const listener of channel.listeners) listener(state);
  }

  public clear(targetId: string, owner: object): void {
    const channel = this._channels.get(targetId);
    if (!channel || channel.owner !== owner) return;
    channel.owner = undefined;
    channel.select = undefined;
    channel.toggleTakeover = undefined;
    channel.activate = undefined;
    channel.toggleSlideshow = undefined;
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

  public activate(targetId: string, entityId: string): boolean {
    const channel = this._channels.get(targetId);
    if (!channel?.activate) return this.select(targetId, entityId);
    if (!channel.state.items.some((item) => item.entityId === entityId)) {
      return false;
    }
    channel.activate(entityId);
    return true;
  }

  public toggleTakeover(targetId: string): boolean {
    const channel = this._channels.get(targetId);
    if (!channel?.toggleTakeover || !channel.state.takeoverAvailable) {
      return false;
    }
    channel.toggleTakeover();
    return true;
  }

  public toggleSlideshow(targetId: string): boolean {
    const channel = this._channels.get(targetId);
    if (!channel?.toggleSlideshow || !channel.state.slideshowAvailable) {
      return false;
    }
    channel.toggleSlideshow();
    return true;
  }

  public subscribe(targetId: string, listener: SelectionListener): () => void {
    const channel = this._channel(targetId);
    channel.listeners.add(listener);
    listener(channel.state);
    return () => {
      channel.listeners.delete(listener);
      if (
        !channel.owner &&
        channel.listeners.size === 0 &&
        this._channels.get(targetId) === channel
      ) {
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
  const currentReviews = current.activeReviews ?? [];
  const nextReviews = next.activeReviews ?? [];
  if (
    current.activeEntityId !== next.activeEntityId ||
    current.activeSelectionId !== next.activeSelectionId ||
    current.takeoverAvailable !== next.takeoverAvailable ||
    current.takeoverEnabled !== next.takeoverEnabled ||
    current.slideshowAvailable !== next.slideshowAvailable ||
    current.slideshowEnabled !== next.slideshowEnabled ||
    current.slideshowHeld !== next.slideshowHeld ||
    current.slideshowRemainingSeconds !== next.slideshowRemainingSeconds ||
    (current.settled !== false) !== (next.settled !== false) ||
    current.items.length !== next.items.length
  ) {
    return false;
  }
  const currentEntityIds = current.activeEntityIds ?? [];
  const nextEntityIds = next.activeEntityIds ?? [];
  if (
    currentEntityIds.length !== nextEntityIds.length ||
    !currentEntityIds.every(
      (entityId, index) => entityId === nextEntityIds[index],
    )
  ) {
    return false;
  }
  if (
    currentReviews.length !== nextReviews.length ||
    !currentReviews.every(
      (review, index) =>
        review.id === nextReviews[index]?.id &&
        review.revision === nextReviews[index]?.revision,
    )
  ) {
    return false;
  }
  return current.items.every(
    (item, index) =>
      item.entityId === next.items[index]?.entityId &&
      item.label === next.items[index]?.label &&
      item.activity === next.items[index]?.activity &&
      item.position === next.items[index]?.position &&
      (item.entityIds ?? []).join("\u0000") ===
        (next.items[index]?.entityIds ?? []).join("\u0000") &&
      (item.entityLabels ?? [])
        .map(({ entityId, label }) => `${entityId}\u0001${label}`)
        .join("\u0000") ===
        (next.items[index]?.entityLabels ?? [])
          .map(({ entityId, label }) => `${entityId}\u0001${label}`)
          .join("\u0000"),
  );
}
