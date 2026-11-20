import type { LiveConnectionType } from "../../core/config";
import type { HomeAssistantApi } from "../../core/home-assistant";
import { getMediaSessionManager } from "../../core/media-session-manager";
import type { LocalizeFunction } from "../../core/localization";
import type { ActiveCameraSession } from "../../stage/camera-session-context";
import type { TalkConnection } from "../../providers/talk-source-resolver";
import { TalkSourceResolver } from "../../providers/talk-source-resolver";

export type PersistentTalkStatus =
  "connected" | "connecting" | "idle" | "ready";

export interface PersistentTalkTarget {
  readonly api: HomeAssistantApi;
  readonly connection: LiveConnectionType;
  readonly entityId: string;
  readonly label: string;
  readonly localize: LocalizeFunction;
  readonly returnPath: string;
}

export interface PersistentTalkSurface extends PersistentTalkTarget {
  readonly camera: ActiveCameraSession;
  readonly host: HTMLElement;
}

export interface PersistentTalkSnapshot {
  readonly connection?: TalkConnection;
  readonly errorRevision: number;
  readonly incomingStream?: MediaStream;
  readonly microphoneMuted: boolean;
  readonly muted: boolean;
  readonly status: PersistentTalkStatus;
  readonly surfaceActive: boolean;
  readonly target?: PersistentTalkTarget;
}

type PersistentTalkListener = (snapshot: PersistentTalkSnapshot) => void;

/** Owns the one document-scoped outgoing talk peer and restart target. */
export class PersistentTalkSession {
  private _abort?: AbortController;
  private _audioCamera?: ActiveCameraSession;
  private _connection?: TalkConnection;
  private _errorRevision = 0;
  private _incomingStream?: MediaStream;
  private readonly _listeners = new Set<PersistentTalkListener>();
  private _microphoneMuted = false;
  private _returnRequested = false;
  private readonly _surfaces = new Map<object, PersistentTalkSurface>();
  private _target?: PersistentTalkTarget;

  public constructor(
    private readonly _resolver: Pick<
      TalkSourceResolver,
      "connect"
    > = new TalkSourceResolver(),
  ) {
    document.addEventListener("visibilitychange", this._handleVisibility);
    document.addEventListener("freeze", this._handleBackground);
  }

  public get snapshot(): PersistentTalkSnapshot {
    const surface = this._matchingSurface();
    const entityId = this._target?.entityId;
    return {
      connection: this._connection,
      errorRevision: this._errorRevision,
      incomingStream: surface?.camera.incomingStream ?? this._incomingStream,
      microphoneMuted: this._microphoneMuted,
      muted:
        surface?.camera.muted ??
        (entityId
          ? getMediaSessionManager().getCameraMuted(entityId, true)
          : true),
      status: this._connection
        ? "connected"
        : this._abort
          ? "connecting"
          : this._target
            ? "ready"
            : "idle",
      surfaceActive: Boolean(surface),
      target: this._target,
    };
  }

  public subscribe(listener: PersistentTalkListener): () => void {
    this._listeners.add(listener);
    listener(this.snapshot);
    return () => this._listeners.delete(listener);
  }

  public dispose(): void {
    this.dismiss();
    document.removeEventListener("visibilitychange", this._handleVisibility);
    document.removeEventListener("freeze", this._handleBackground);
    this._surfaces.clear();
    this._listeners.clear();
  }

  public updateSurface(owner: object, surface: PersistentTalkSurface): void {
    const previous = this._surfaces.get(owner);
    if (
      previous?.api === surface.api &&
      previous.camera === surface.camera &&
      previous.connection === surface.connection &&
      previous.entityId === surface.entityId &&
      previous.host === surface.host &&
      previous.label === surface.label &&
      previous.localize === surface.localize &&
      previous.returnPath === surface.returnPath
    ) {
      return;
    }
    this._surfaces.set(owner, surface);
    this._syncAudioCamera();
    if (
      this._returnRequested &&
      this._target?.entityId === surface.camera.entityId
    ) {
      this._returnRequested = false;
      requestAnimationFrame(() => {
        if (surface.host.isConnected) {
          surface.host.scrollIntoView({ block: "center", inline: "nearest" });
        }
      });
    }
    this._publish();
  }

  public removeSurface(owner: object): void {
    if (!this._surfaces.delete(owner)) return;
    if (this._abort && !this._matchingSurface()) {
      this.dismiss();
      return;
    }
    this._syncAudioCamera();
    this._publish();
  }

  public async start(target?: PersistentTalkTarget): Promise<void> {
    const nextTarget = target ?? this._target;
    if (!nextTarget || this._connection || this._abort) return;
    if (this._target && this._target.entityId !== nextTarget.entityId) {
      this._closeConnection();
    }
    this._target = nextTarget;
    const abort = new AbortController();
    this._abort = abort;
    this._microphoneMuted = false;
    this._publish();
    try {
      const connection = await this._resolver.connect(
        nextTarget.api,
        nextTarget.connection,
        nextTarget.entityId,
        abort.signal,
        () => this._handleConnectionFailure(nextTarget.entityId),
      );
      if (abort.signal.aborted || this._target !== nextTarget) {
        connection.close();
        return;
      }
      this._connection = connection;
      this._incomingStream = this._matchingSurface()?.camera.incomingStream;
      this._syncAudioCamera();
    } catch {
      if (!abort.signal.aborted) this._errorRevision += 1;
    } finally {
      if (this._abort === abort) this._abort = undefined;
      this._publish();
    }
  }

  /** End the peer while retaining its camera as a restartable tile target. */
  public stopAndRetain(): void {
    this._closeConnection();
    this._publish();
  }

  /** End the peer and remove the persistent target and tile. */
  public dismiss(): void {
    this._closeConnection();
    this._target = undefined;
    this._incomingStream = undefined;
    this._returnRequested = false;
    this._publish();
  }

  /** Normal on-camera stop keeps the pre-existing non-persistent behavior. */
  public stopFromSurface(): void {
    this.dismiss();
  }

  public toggleMicrophoneMute(): void {
    if (!this._connection) return;
    this._microphoneMuted = !this._microphoneMuted;
    this._connection.setMicrophoneMuted(this._microphoneMuted);
    this._publish();
  }

  public toggleSpeaker(): void {
    const target = this._target;
    if (!target) return;
    const surface = this._matchingSurface();
    const muted =
      surface?.camera.muted ??
      getMediaSessionManager().getCameraMuted(target.entityId, true);
    if (surface) surface.camera.setMuted(!muted);
    else getMediaSessionManager().setCameraMuted(target.entityId, !muted);
    this._publish();
  }

  public returnToCamera(): void {
    const target = this._target;
    if (!target) return;
    const destination = new URL(target.returnPath, window.location.origin);
    destination.searchParams.set("camera", target.entityId);
    this._returnRequested = true;
    history.pushState(
      null,
      "",
      `${destination.pathname}${destination.search}${destination.hash}`,
    );
    window.dispatchEvent(new Event("location-changed"));
  }

  private _closeConnection(): void {
    this._abort?.abort();
    this._abort = undefined;
    this._connection?.close();
    this._connection = undefined;
    this._microphoneMuted = false;
    this._releaseAudioCamera();
  }

  private _matchingSurface(): PersistentTalkSurface | undefined {
    const entityId = this._target?.entityId;
    if (!entityId) return undefined;
    let matching: PersistentTalkSurface | undefined;
    for (const surface of this._surfaces.values()) {
      if (surface.camera.entityId === entityId) matching = surface;
    }
    return matching;
  }

  private _syncAudioCamera(): void {
    const next = this._connection ? this._matchingSurface()?.camera : undefined;
    if (next === this._audioCamera) return;
    if (
      next?.overlayOwner &&
      next.overlayOwner === this._audioCamera?.overlayOwner
    ) {
      this._audioCamera = next;
      return;
    }
    this._releaseAudioCamera();
    this._audioCamera = next;
    this._audioCamera?.setTalkAudioActive(true);
  }

  private _releaseAudioCamera(): void {
    this._audioCamera?.setTalkAudioActive(false);
    this._audioCamera = undefined;
  }

  private _handleConnectionFailure(entityId: string): void {
    if (this._target?.entityId !== entityId || !this._connection) return;
    this._connection.close();
    this._connection = undefined;
    this._releaseAudioCamera();
    this._microphoneMuted = false;
    this._errorRevision += 1;
    this._publish();
  }

  private _publish(): void {
    const snapshot = this.snapshot;
    for (const listener of this._listeners) listener(snapshot);
  }

  private readonly _handleVisibility = (): void => {
    if (document.visibilityState !== "visible") this.dismiss();
  };

  private readonly _handleBackground = (): void => this.dismiss();
}
