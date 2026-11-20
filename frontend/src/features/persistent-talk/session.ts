import type { LiveConnectionType } from "../../core/config";
import type { HomeAssistantApi } from "../../core/home-assistant";
import { getMediaSessionManager } from "../../core/media-session-manager";
import {
  playMediaElement,
  setMediaElementMuted,
} from "../../core/media-playback";
import type { LocalizeFunction } from "../../core/localization";
import type {
  ActiveCameraSession,
  RetainedCameraAudio,
} from "../../stage/camera-session-context";
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
  private _incomingAudio?: HTMLAudioElement;
  private _incomingAudioRetention?: RetainedCameraAudio;
  private readonly _listeners = new Set<PersistentTalkListener>();
  private _microphoneMuted = false;
  private _returnRequested = false;
  private _speakerMuted = false;
  private _speakerMuteExplicit = false;
  private readonly _surfaces = new Map<object, PersistentTalkSurface>();
  private readonly _surfaceVisibility = new Map<HTMLElement, boolean>();
  private readonly _surfaceObserver?: IntersectionObserver;
  private _target?: PersistentTalkTarget;

  public constructor(
    private readonly _resolver: Pick<
      TalkSourceResolver,
      "connect"
    > = new TalkSourceResolver(),
  ) {
    if ("IntersectionObserver" in window) {
      this._surfaceObserver = new IntersectionObserver((entries) => {
        let changed = false;
        for (const entry of entries) {
          if (!(entry.target instanceof HTMLElement)) continue;
          const visible = entry.isIntersecting && entry.intersectionRatio > 0;
          if (this._surfaceVisibility.get(entry.target) === visible) continue;
          this._surfaceVisibility.set(entry.target, visible);
          changed = true;
        }
        if (changed) {
          this._syncIncomingAudio();
          this._publish();
        }
      });
    }
    document.addEventListener("visibilitychange", this._handleVisibility);
    document.addEventListener("freeze", this._handleBackground);
    window.addEventListener("location-changed", this._handleLocationChanged);
    window.addEventListener("popstate", this._handleLocationChanged);
  }

  public get snapshot(): PersistentTalkSnapshot {
    const surface = this._matchingSurface();
    const entityId = this._target?.entityId;
    return {
      connection: this._connection,
      errorRevision: this._errorRevision,
      incomingStream: surface?.camera.incomingStream ?? this._incomingStream,
      microphoneMuted: this._microphoneMuted,
      muted: entityId ? this._speakerMuted : true,
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
    window.removeEventListener("location-changed", this._handleLocationChanged);
    window.removeEventListener("popstate", this._handleLocationChanged);
    this._surfaceObserver?.disconnect();
    this._surfaceVisibility.clear();
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
    const hostAlreadyObserved = [...this._surfaces.entries()].some(
      ([surfaceOwner, item]) =>
        surfaceOwner !== owner && item.host === surface.host,
    );
    if (
      previous?.host !== surface.host &&
      previous &&
      ![...this._surfaces.entries()].some(
        ([surfaceOwner, item]) =>
          surfaceOwner !== owner && item.host === previous.host,
      )
    ) {
      this._surfaceObserver?.unobserve(previous.host);
      this._surfaceVisibility.delete(previous.host);
    }
    this._surfaces.set(owner, surface);
    if (!hostAlreadyObserved && previous?.host !== surface.host) {
      this._surfaceVisibility.set(surface.host, true);
      this._surfaceObserver?.observe(surface.host);
    }
    this._syncIncomingAudio();
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
    const removed = this._surfaces.get(owner);
    if (!removed || !this._surfaces.delete(owner)) return;
    if (
      ![...this._surfaces.values()].some((item) => item.host === removed.host)
    ) {
      this._surfaceObserver?.unobserve(removed.host);
      this._surfaceVisibility.delete(removed.host);
    }
    if (this._abort && !this._matchingSurface()) {
      this.dismiss();
      return;
    }
    this._syncIncomingAudio();
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
    this._speakerMuted = false;
    this._speakerMuteExplicit = true;
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
      this._setCameraMuted(false);
      this._retainIncomingAudio();
      this._syncIncomingAudio();
    } catch {
      if (!abort.signal.aborted) {
        this._errorRevision += 1;
        this._setCameraMuted(true);
        this._target = undefined;
        this._releaseIncomingAudio();
      }
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
    if (!target || !this._connection) return;
    const surface = this._matchingSurface();
    this._speakerMuted = !this._speakerMuted;
    this._speakerMuteExplicit = true;
    if (surface) surface.camera.setMuted(this._speakerMuted);
    else
      getMediaSessionManager().setCameraMuted(
        target.entityId,
        this._speakerMuted,
      );
    this._syncIncomingAudioElement();
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
    if (this._target) this._setCameraMuted(true);
    this._abort?.abort();
    this._abort = undefined;
    this._connection?.close();
    this._connection = undefined;
    this._microphoneMuted = false;
    this._releaseAudioCamera();
    this._releaseIncomingAudio();
  }

  private _matchingSurface(): PersistentTalkSurface | undefined {
    const entityId = this._target?.entityId;
    if (!entityId) return undefined;
    let matching: PersistentTalkSurface | undefined;
    for (const surface of this._surfaces.values()) {
      if (
        surface.camera.entityId === entityId &&
        this._surfacePresented(surface)
      )
        matching = surface;
    }
    return matching;
  }

  private _surfacePresented(surface: PersistentTalkSurface): boolean {
    if (!this._surfaceObserver) return true;
    const host = surface.host;
    if (
      !host.isConnected ||
      this._surfaceVisibility.get(host) === false ||
      host.closest("[inert], [aria-hidden='true']")
    )
      return false;
    return typeof host.checkVisibility !== "function" || host.checkVisibility();
  }

  private _syncIncomingAudio(): void {
    const next = this._connection ? this._matchingSurface()?.camera : undefined;
    if (next !== this._audioCamera) {
      if (
        next?.overlayOwner &&
        next.overlayOwner === this._audioCamera?.overlayOwner
      ) {
        this._audioCamera = next;
      } else {
        this._releaseAudioCamera();
        this._audioCamera = next;
        this._audioCamera?.setTalkAudioActive(true);
        if (this._audioCamera && this._speakerMuteExplicit) {
          this._audioCamera.setMuted(this._speakerMuted);
        }
      }
    }
    this._syncIncomingAudioElement();
  }

  private _releaseAudioCamera(): void {
    this._audioCamera?.setTalkAudioActive(false);
    this._audioCamera = undefined;
  }

  private _handleConnectionFailure(entityId: string): void {
    if (this._target?.entityId !== entityId || !this._connection) return;
    this._setCameraMuted(true);
    this._connection.close();
    this._connection = undefined;
    this._releaseAudioCamera();
    this._releaseIncomingAudio();
    this._microphoneMuted = false;
    this._target = undefined;
    this._errorRevision += 1;
    this._publish();
  }

  private _publish(): void {
    const snapshot = this.snapshot;
    for (const listener of this._listeners) listener(snapshot);
  }

  private _retainIncomingAudio(): void {
    this._releaseIncomingAudio();
    const surface = this._matchingSurface();
    const retained = surface?.camera.retainIncomingAudio?.();
    const stream = retained?.stream ?? surface?.camera.incomingStream;
    if (!stream) {
      retained?.release();
      return;
    }
    this._incomingAudioRetention = retained;
    this._incomingStream = stream;
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.hidden = true;
    audio.srcObject = stream;
    setMediaElementMuted(audio, true);
    document.body.append(audio);
    this._incomingAudio = audio;
    void playMediaElement(audio).catch(() => undefined);
  }

  private _syncIncomingAudioElement(): void {
    const audio = this._incomingAudio;
    if (!audio) return;
    setMediaElementMuted(
      audio,
      Boolean(this._audioCamera) || this._speakerMuted || !this._connection,
    );
    if (!audio.muted) void playMediaElement(audio).catch(() => undefined);
  }

  private _setCameraMuted(muted: boolean): void {
    const target = this._target;
    if (!target) return;
    this._speakerMuted = muted;
    this._speakerMuteExplicit = true;
    const surface = this._matchingSurface();
    if (surface) surface.camera.setMuted(muted);
    else getMediaSessionManager().setCameraMuted(target.entityId, muted);
    this._syncIncomingAudioElement();
  }

  private _releaseIncomingAudio(): void {
    if (this._incomingAudio) {
      this._incomingAudio.pause();
      this._incomingAudio.srcObject = null;
      this._incomingAudio.remove();
      this._incomingAudio = undefined;
    }
    this._incomingAudioRetention?.release();
    this._incomingAudioRetention = undefined;
    this._incomingStream = undefined;
  }

  private readonly _handleVisibility = (): void => {
    if (document.visibilityState !== "visible") this.dismiss();
  };

  private readonly _handleBackground = (): void => this.dismiss();

  private readonly _handleLocationChanged = (): void => {
    if (this._target && !this._connection && !this._abort) {
      this.dismiss();
      return;
    }
    const sync = (): void => {
      this._syncIncomingAudio();
      this._publish();
    };
    sync();
    requestAnimationFrame(() => requestAnimationFrame(sync));
  };
}
