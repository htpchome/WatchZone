export interface ExportCameraFacet {
  readonly entityId: string;
  readonly label: string;
}

export type ExportSortDirection = "ascending" | "descending";

export interface ExportFilterState {
  readonly cameras: readonly ExportCameraFacet[];
  readonly selectedEntityIds: readonly string[];
  readonly sortDirection: ExportSortDirection;
}

type ExportFilterListener = (state: ExportFilterState) => void;

interface ExportFilterChannel {
  readonly listeners: Set<ExportFilterListener>;
  owner?: object;
  state: ExportFilterState;
}

const EMPTY_STATE: ExportFilterState = {
  cameras: [],
  selectedEntityIds: [],
  sortDirection: "descending",
};

/** Coordinates one exports module with its Stage-owned camera filter. */
export class ExportFilterContext {
  private readonly _channels = new Map<string, ExportFilterChannel>();

  public publish(
    scopeId: string,
    owner: object,
    cameras: readonly ExportCameraFacet[],
  ): void {
    const channel = this._channel(scopeId);
    channel.owner = owner;
    const allowed = new Set(cameras.map(({ entityId }) => entityId));
    this._update(scopeId, channel, {
      cameras,
      selectedEntityIds: channel.state.selectedEntityIds.filter((id) =>
        allowed.has(id),
      ),
      sortDirection: channel.state.sortDirection,
    });
  }

  public clear(scopeId: string, owner: object): void {
    const channel = this._channels.get(scopeId);
    if (!channel || channel.owner !== owner) return;
    channel.owner = undefined;
    this._update(scopeId, channel, EMPTY_STATE);
    if (channel.listeners.size === 0) this._channels.delete(scopeId);
  }

  public toggleCamera(scopeId: string, entityId: string): void {
    const channel = this._channel(scopeId);
    if (!channel.state.cameras.some((camera) => camera.entityId === entityId)) {
      return;
    }
    const selected = channel.state.selectedEntityIds;
    this._update(scopeId, channel, {
      ...channel.state,
      selectedEntityIds: selected.includes(entityId)
        ? selected.filter((id) => id !== entityId)
        : [...selected, entityId],
    });
  }

  public clearSelection(scopeId: string): void {
    const channel = this._channel(scopeId);
    this._update(scopeId, channel, { ...channel.state, selectedEntityIds: [] });
  }

  public setSortDirection(
    scopeId: string,
    sortDirection: ExportSortDirection,
  ): void {
    const channel = this._channel(scopeId);
    this._update(scopeId, channel, { ...channel.state, sortDirection });
  }

  public reset(scopeId: string): void {
    const channel = this._channel(scopeId);
    this._update(scopeId, channel, {
      ...channel.state,
      selectedEntityIds: [],
      sortDirection: "descending",
    });
  }

  public subscribe(
    scopeId: string,
    listener: ExportFilterListener,
  ): () => void {
    const channel = this._channel(scopeId);
    channel.listeners.add(listener);
    listener(channel.state);
    return () => {
      channel.listeners.delete(listener);
      if (!channel.owner && channel.listeners.size === 0) {
        this._channels.delete(scopeId);
      }
    };
  }

  private _channel(scopeId: string): ExportFilterChannel {
    const existing = this._channels.get(scopeId);
    if (existing) return existing;
    const channel: ExportFilterChannel = {
      listeners: new Set(),
      state: EMPTY_STATE,
    };
    this._channels.set(scopeId, channel);
    return channel;
  }

  private _update(
    scopeId: string,
    channel: ExportFilterChannel,
    state: ExportFilterState,
  ): void {
    if (sameState(channel.state, state)) return;
    channel.state = state;
    for (const listener of channel.listeners) listener(state);
    if (!channel.owner && channel.listeners.size === 0) {
      this._channels.delete(scopeId);
    }
  }
}

function sameState(
  current: ExportFilterState,
  next: ExportFilterState,
): boolean {
  return (
    current.cameras.length === next.cameras.length &&
    current.cameras.every(
      (camera, index) =>
        camera.entityId === next.cameras[index]?.entityId &&
        camera.label === next.cameras[index]?.label,
    ) &&
    current.selectedEntityIds.length === next.selectedEntityIds.length &&
    current.selectedEntityIds.every(
      (entityId, index) => entityId === next.selectedEntityIds[index],
    ) &&
    current.sortDirection === next.sortDirection
  );
}
