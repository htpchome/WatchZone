import type { TranslationKey } from "../core/localization";

export interface StageStackAccessoryConfiguration {
  readonly calendar: "activity" | "disabled" | "recordings";
  readonly filter: "activity" | "disabled" | "exports" | "none";
  readonly historyDays?: number;
  readonly targetModuleId?: string;
}

export interface ModuleStackNavigationItem {
  readonly accessories?: StageStackAccessoryConfiguration;
  readonly icon?: string;
  readonly id: string;
  readonly labelKey?: TranslationKey;
}

export interface ModuleStackNavigationState {
  readonly activeId?: string;
  readonly items: readonly ModuleStackNavigationItem[];
}

type Listener = (state: ModuleStackNavigationState) => void;

interface Channel {
  readonly listeners: Set<Listener>;
  state: ModuleStackNavigationState;
}

const EMPTY_STATE: ModuleStackNavigationState = { items: [] };

/** Stage-owned selection state shared by a stack and its navigation module. */
export class ModuleStackNavigationContext {
  private readonly _channels = new Map<string, Channel>();

  public constructor(
    private readonly _select: (stackId: string, moduleId: string) => void,
  ) {}

  public publish(stackId: string, state: ModuleStackNavigationState): void {
    const channel = this._channel(stackId);
    channel.state = state;
    for (const listener of channel.listeners) listener(state);
  }

  public retain(stackIds: ReadonlySet<string>): void {
    for (const [stackId, channel] of this._channels) {
      if (stackIds.has(stackId)) continue;
      channel.state = EMPTY_STATE;
      for (const listener of channel.listeners) listener(EMPTY_STATE);
      if (channel.listeners.size === 0) this._channels.delete(stackId);
    }
  }

  public select(stackId: string, moduleId: string): void {
    const state = this._channels.get(stackId)?.state;
    if (!state?.items.some(({ id }) => id === moduleId)) return;
    this._select(stackId, moduleId);
  }

  public subscribe(stackId: string, listener: Listener): () => void {
    const channel = this._channel(stackId);
    channel.listeners.add(listener);
    listener(channel.state);
    return () => {
      channel.listeners.delete(listener);
      if (channel.state === EMPTY_STATE && channel.listeners.size === 0) {
        this._channels.delete(stackId);
      }
    };
  }

  private _channel(stackId: string): Channel {
    const existing = this._channels.get(stackId);
    if (existing) return existing;
    const channel: Channel = { listeners: new Set(), state: EMPTY_STATE };
    this._channels.set(stackId, channel);
    return channel;
  }
}
