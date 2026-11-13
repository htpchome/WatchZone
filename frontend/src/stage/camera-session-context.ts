import type { LiveConnectionType } from "../core/config";

export interface ActiveCameraSession {
  readonly available: boolean;
  readonly connection: LiveConnectionType;
  readonly entityId: string;
  readonly incomingStream?: MediaStream;
  readonly lightEntityIds?: readonly string[];
  readonly muted: boolean;
  readonly overlayVisible: boolean;
  holdOverlay(): () => void;
  revealOverlay(): void;
  setMuted(muted: boolean): void;
  setTalkAudioActive(active: boolean): void;
}

export type ActiveCameraSessionListener = (
  session: ActiveCameraSession | undefined,
) => void;

/** Card-scoped interaction contract shared by camera-capability modules. */
export class CameraSessionContext {
  private readonly _listeners = new Set<ActiveCameraSessionListener>();
  private _owner?: object;
  private _session?: ActiveCameraSession;

  public get session(): ActiveCameraSession | undefined {
    return this._session;
  }

  public publish(owner: object, session: ActiveCameraSession): void {
    this._owner = owner;
    this._session = session;
    for (const listener of this._listeners) listener(session);
  }

  public clear(owner: object): void {
    if (this._owner !== owner) return;
    this._owner = undefined;
    this._session = undefined;
    for (const listener of this._listeners) listener(undefined);
  }

  public subscribe(listener: ActiveCameraSessionListener): () => void {
    this._listeners.add(listener);
    listener(this._session);
    return () => this._listeners.delete(listener);
  }
}
