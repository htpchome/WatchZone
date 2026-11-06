import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_RETAINED_CAMERA_SESSIONS,
  MEDIA_SESSION_RUNTIME_KEY,
} from "../src/core/constants";
import type {
  HomeAssistantApi,
  HomeAssistantConnection,
  HomeAssistantConnectionEvent,
  HomeAssistantConnectionEventListener,
} from "../src/core/home-assistant";
import {
  type ConnectionFactory,
  getMediaSessionManager,
} from "../src/core/media-session-manager";
import { MediaConnectionError } from "../src/core/media-connection-error";
import { TestMediaSessionManager as MediaSessionManager } from "./test-media-session-manager";

function createApi(identity: object = {}): HomeAssistantApi {
  return {
    identity: identity as HomeAssistantApi["identity"],
    callWS: vi.fn(),
    resolveUrl: (path) => path,
    subscribeMessage: vi.fn(),
  };
}

function createStream(): MediaStream {
  return { getTracks: () => [] } as unknown as MediaStream;
}

function createLifecycleApi(initiallyConnected = true): {
  readonly api: HomeAssistantApi;
  disconnect(): void;
  ready(): void;
} {
  const listeners = new Map<
    HomeAssistantConnectionEvent,
    Set<HomeAssistantConnectionEventListener>
  >();
  const connection: HomeAssistantConnection = {
    connected: initiallyConnected,
    addEventListener: (event, listener) => {
      const eventListeners = listeners.get(event) ?? new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
    },
    removeEventListener: (event, listener) => {
      listeners.get(event)?.delete(listener);
    },
    subscribeMessage: vi.fn(),
  };
  const emit = (event: HomeAssistantConnectionEvent): void => {
    Object.defineProperty(connection, "connected", {
      configurable: true,
      value: event === "ready",
    });
    for (const listener of listeners.get(event) ?? []) {
      listener(connection);
    }
  };
  return {
    api: createApi(connection),
    disconnect: () => emit("disconnected"),
    ready: () => emit("ready"),
  };
}

describe("MediaSessionManager", () => {
  afterEach(() => {
    vi.useRealTimers();
    const runtime = window as unknown as Record<string, unknown>;
    delete runtime[MEDIA_SESSION_RUNTIME_KEY];
  });

  it("uses configured mute defaults until the user makes a document-lifetime choice", () => {
    const manager = new MediaSessionManager();

    expect(manager.getCameraMuted("camera.front", false)).toBe(false);
    expect(manager.getCameraMuted("camera.front", true)).toBe(true);

    manager.setCameraMuted("camera.front", true);
    expect(manager.getCameraMutePreference("camera.front")).toBe("muted");
    expect(manager.getCameraMuted("camera.front", false)).toBe(true);

    manager.setCameraMuted("camera.front", false);
    expect(manager.getCameraMutePreference("camera.front")).toBe("unmuted");
    expect(manager.getCameraMuted("camera.front", true)).toBe(false);

    expect(
      new MediaSessionManager().getCameraMutePreference("camera.front"),
    ).toBeUndefined();
  });

  it("deduplicates concurrent leases and retains the connection", async () => {
    vi.useFakeTimers();
    const stream = createStream();
    const close = vi.fn();
    const factory = vi.fn<ConnectionFactory>(async () => ({ stream, close }));
    const manager = new MediaSessionManager(factory);
    const api = createApi();

    const first = manager.acquireHomeAssistant(api, "camera.front");
    const second = manager.acquireHomeAssistant(api, "camera.front");
    await vi.waitFor(() => expect(first.getSnapshot().state).toBe("live"));

    expect(factory).toHaveBeenCalledOnce();
    expect(second.getSnapshot().stream).toBe(stream);
    first.release();
    second.release();
    expect(second.getSnapshot().state).toBe("parked");

    const returned = manager.acquireHomeAssistant(api, "camera.front");
    expect(returned.getSnapshot()).toMatchObject({ state: "live", stream });
    expect(factory).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();

    returned.release();
    manager.closeAll();
  });

  it("reconnects an unhealthy parked transport instead of reusing it", async () => {
    let healthy = true;
    const factory = vi.fn<ConnectionFactory>(async () => ({
      close: vi.fn(),
      isHealthy: () => healthy,
      stream: createStream(),
      transport: "webrtc",
    }));
    const manager = new MediaSessionManager(factory);
    const lease = manager.acquireHomeAssistant(createApi(), "camera.front");

    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
    lease.release();
    expect(lease.getSnapshot().state).toBe("parked");
    healthy = false;

    const returned = manager.acquireHomeAssistant(createApi(), "camera.front");
    await vi.waitFor(() => expect(returned.getSnapshot().state).toBe("live"));
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("hands one retained media element between concurrent presentations", async () => {
    const video = document.createElement("video");
    const factory = vi.fn<ConnectionFactory>(async () => ({
      close: vi.fn(),
      transport: "hls_mse",
      video,
    }));
    const manager = new MediaSessionManager(factory, factory);
    const api = createApi();
    const first = manager.acquireHomeAssistantHls(api, "camera.front");
    await vi.waitFor(() => expect(first.getSnapshot().state).toBe("live"));
    expect(first.getSnapshot().video).toBe(video);

    const second = manager.acquireHomeAssistantHls(api, "camera.front");
    expect(first.getSnapshot().video).toBeUndefined();
    expect(second.getSnapshot().video).toBe(video);

    second.release();
    expect(first.getSnapshot().video).toBe(video);

    first.release();
    manager.closeAll();
  });

  it("does not treat pagehide as final document teardown", async () => {
    const close = vi.fn();
    const factory = vi.fn<ConnectionFactory>(async () => ({
      stream: createStream(),
      close,
    }));
    const manager = new MediaSessionManager(factory);
    const runtime = window as unknown as Record<string, unknown>;
    runtime[MEDIA_SESSION_RUNTIME_KEY] = manager;
    expect(getMediaSessionManager()).toBe(manager);
    const api = createApi();
    const lease = manager.acquireHomeAssistant(api, "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
    lease.release();

    const cachedPageHide = new Event("pagehide");
    Object.defineProperty(cachedPageHide, "persisted", { value: true });
    window.dispatchEvent(cachedPageHide);
    expect(close).not.toHaveBeenCalled();

    const finalPageHide = new Event("pagehide");
    Object.defineProperty(finalPageHide, "persisted", { value: false });
    window.dispatchEvent(finalPageHide);
    expect(close).not.toHaveBeenCalled();
    expect(lease.getSnapshot().state).toBe("parked");

    const returned = manager.acquireHomeAssistant(api, "camera.front");
    expect(returned.getSnapshot().state).toBe("live");
    expect(factory).toHaveBeenCalledOnce();
    returned.release();
    manager.closeAll();
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps a parked connection for the document lifetime", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const factory = vi.fn<ConnectionFactory>(async () => ({
      stream: createStream(),
      close,
    }));
    const manager = new MediaSessionManager(factory);
    const api = createApi();
    const lease = manager.acquireHomeAssistant(api, "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    lease.release();
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(close).not.toHaveBeenCalled();

    const returned = manager.acquireHomeAssistant(api, "camera.front");
    expect(returned.getSnapshot().state).toBe("live");
    expect(factory).toHaveBeenCalledOnce();
    returned.release();
    manager.closeAll();
    expect(close).toHaveBeenCalledOnce();
  });

  it("reconnects when Home Assistant replaces its transport", async () => {
    const closes: Array<ReturnType<typeof vi.fn>> = [];
    const factory = vi.fn<ConnectionFactory>(async () => {
      const close = vi.fn();
      closes.push(close);
      return { stream: createStream(), close };
    });
    const manager = new MediaSessionManager(factory);
    const first = manager.acquireHomeAssistant(createApi(), "camera.front");
    await vi.waitFor(() => expect(first.getSnapshot().state).toBe("live"));

    const second = manager.acquireHomeAssistant(createApi(), "camera.front");
    await vi.waitFor(() => expect(second.getSnapshot().state).toBe("live"));

    expect(closes[0]).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledTimes(2);
    first.release();
    second.release();
    manager.closeAll();
  });

  it("restarts active media exactly once when Home Assistant reconnects", async () => {
    const closes: Array<ReturnType<typeof vi.fn>> = [];
    const factory = vi.fn<ConnectionFactory>(async () => {
      const close = vi.fn();
      closes.push(close);
      return { stream: createStream(), close };
    });
    const manager = new MediaSessionManager(factory);
    const lifecycle = createLifecycleApi();
    const lease = manager.acquireHomeAssistant(lifecycle.api, "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    lifecycle.disconnect();
    expect(lease.getSnapshot().state).toBe("failed");
    expect(closes[0]).toHaveBeenCalledOnce();

    lifecycle.ready();
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
    expect(factory).toHaveBeenCalledTimes(2);

    lifecycle.ready();
    expect(factory).toHaveBeenCalledTimes(2);
    lease.release();
    manager.closeAll();
  });

  it("restores interrupted sessions sequentially in acquisition order", async () => {
    let firstRecoveryComplete: (() => void) | undefined;
    let initialConnections = 0;
    const recoveryOrder: string[] = [];
    const factory = vi.fn<ConnectionFactory>(async (_api, entityId) => {
      initialConnections += 1;
      if (initialConnections <= 2) {
        return { stream: createStream(), close: vi.fn() };
      }
      recoveryOrder.push(entityId);
      if (entityId === "camera.zero") {
        await new Promise<void>((resolve) => {
          firstRecoveryComplete = resolve;
        });
      }
      return { stream: createStream(), close: vi.fn() };
    });
    const manager = new MediaSessionManager(factory);
    const lifecycle = createLifecycleApi();
    const zero = manager.acquireHomeAssistant(lifecycle.api, "camera.zero");
    const one = manager.acquireHomeAssistant(lifecycle.api, "camera.one");
    await vi.waitFor(() => expect(one.getSnapshot().state).toBe("live"));

    lifecycle.disconnect();
    lifecycle.ready();
    await vi.waitFor(() => expect(recoveryOrder).toEqual(["camera.zero"]));

    firstRecoveryComplete?.();
    await vi.waitFor(() =>
      expect(recoveryOrder).toEqual(["camera.zero", "camera.one"]),
    );
    await vi.waitFor(() => expect(one.getSnapshot().state).toBe("live"));

    zero.release();
    one.release();
    manager.closeAll();
  });

  it("serializes provider-failure retries in acquisition order", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const failures = new Map<string, (error: Error) => void>();
    const recoveryOrder: string[] = [];
    let calls = 0;
    let finishFirstRecovery: (() => void) | undefined;
    const factory = vi.fn<ConnectionFactory>(
      async (_api, entityId, _signal, onFailure) => {
        calls += 1;
        if (calls <= 2) {
          failures.set(entityId, onFailure);
          return { stream: createStream(), close: vi.fn() };
        }
        recoveryOrder.push(entityId);
        if (entityId === "camera.zero") {
          await new Promise<void>((resolve) => {
            finishFirstRecovery = resolve;
          });
        }
        return { stream: createStream(), close: vi.fn() };
      },
    );
    const manager = new MediaSessionManager(factory);
    const api = createApi();
    const zero = manager.acquireHomeAssistant(api, "camera.zero");
    const one = manager.acquireHomeAssistant(api, "camera.one");
    await vi.waitFor(() => expect(one.getSnapshot().state).toBe("live"));

    failures.get("camera.one")?.(new Error("provider stopped"));
    failures.get("camera.zero")?.(new Error("provider stopped"));
    await vi.advanceTimersByTimeAsync(501);
    expect(recoveryOrder).toEqual(["camera.zero"]);

    finishFirstRecovery?.();
    await vi.waitFor(() =>
      expect(recoveryOrder).toEqual(["camera.zero", "camera.one"]),
    );

    zero.release();
    one.release();
    manager.closeAll();
  });

  it("retries while the backend finishes starting after Home Assistant is ready", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const factory = vi
      .fn<ConnectionFactory>()
      .mockResolvedValueOnce({ stream: createStream(), close: vi.fn() })
      .mockRejectedValueOnce(new Error("WatchZone backend is starting"))
      .mockResolvedValueOnce({ stream: createStream(), close: vi.fn() });
    const manager = new MediaSessionManager(factory);
    const lifecycle = createLifecycleApi();
    const lease = manager.acquireHomeAssistant(lifecycle.api, "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    lifecycle.disconnect();
    lifecycle.ready();
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("failed"));

    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
    expect(factory).toHaveBeenCalledTimes(3);

    lease.release();
    manager.closeAll();
  });

  it("bounds Home Assistant restart recovery when the backend stays unavailable", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const factory = vi
      .fn<ConnectionFactory>()
      .mockResolvedValueOnce({ stream: createStream(), close: vi.fn() })
      .mockRejectedValue(new Error("WatchZone backend is unavailable"));
    const manager = new MediaSessionManager(factory);
    const lifecycle = createLifecycleApi();
    const lease = manager.acquireHomeAssistant(lifecycle.api, "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    lifecycle.disconnect();
    lifecycle.ready();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(factory).toHaveBeenCalledTimes(7);
    expect(lease.getSnapshot()).toMatchObject({
      state: "failed",
      error: "WatchZone backend is unavailable",
    });

    lease.release();
    manager.closeAll();
  });

  it("waits for Home Assistant ready when acquired during a reboot", async () => {
    const factory = vi.fn<ConnectionFactory>(async () => ({
      stream: createStream(),
      close: vi.fn(),
    }));
    const manager = new MediaSessionManager(factory);
    const lifecycle = createLifecycleApi(false);
    const lease = manager.acquireHomeAssistant(lifecycle.api, "camera.front");

    expect(lease.getSnapshot().state).toBe("failed");
    expect(factory).not.toHaveBeenCalled();

    lifecycle.ready();
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
    expect(factory).toHaveBeenCalledOnce();
    lease.release();
    manager.closeAll();
  });

  it("does not reconnect a parked session until it is reacquired", async () => {
    const factory = vi.fn<ConnectionFactory>(async () => ({
      stream: createStream(),
      close: vi.fn(),
    }));
    const manager = new MediaSessionManager(factory);
    const lifecycle = createLifecycleApi();
    const initial = manager.acquireHomeAssistant(lifecycle.api, "camera.front");
    await vi.waitFor(() => expect(initial.getSnapshot().state).toBe("live"));
    initial.release();

    lifecycle.disconnect();
    lifecycle.ready();
    expect(factory).toHaveBeenCalledOnce();

    const returned = manager.acquireHomeAssistant(
      lifecycle.api,
      "camera.front",
    );
    await vi.waitFor(() => expect(returned.getSnapshot().state).toBe("live"));
    expect(factory).toHaveBeenCalledTimes(2);
    returned.release();
    manager.closeAll();
  });

  it("retains Home Assistant restart recovery for a parked session", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const factory = vi
      .fn<ConnectionFactory>()
      .mockResolvedValueOnce({ stream: createStream(), close: vi.fn() })
      .mockRejectedValueOnce(new Error("WatchZone backend is starting"))
      .mockResolvedValueOnce({ stream: createStream(), close: vi.fn() });
    const manager = new MediaSessionManager(factory);
    const lifecycle = createLifecycleApi();
    const initial = manager.acquireHomeAssistant(lifecycle.api, "camera.front");
    await vi.waitFor(() => expect(initial.getSnapshot().state).toBe("live"));
    initial.release();

    lifecycle.disconnect();
    lifecycle.ready();
    expect(factory).toHaveBeenCalledOnce();

    const returned = manager.acquireHomeAssistant(
      lifecycle.api,
      "camera.front",
    );
    await vi.waitFor(() => expect(returned.getSnapshot().state).toBe("failed"));
    await vi.advanceTimersByTimeAsync(501);
    await vi.waitFor(() => expect(returned.getSnapshot().state).toBe("live"));
    expect(factory).toHaveBeenCalledTimes(3);

    returned.release();
    manager.closeAll();
  });

  it("bounds automatic reconnect after an established connection fails", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const failures: Array<(error: Error) => void> = [];
    const factory = vi.fn<ConnectionFactory>(
      async (_api, _entity, _signal, onFailure) => {
        failures.push(onFailure);
        return { stream: createStream(), close: vi.fn() };
      },
    );
    const manager = new MediaSessionManager(factory);
    const lease = manager.acquireHomeAssistant(createApi(), "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    failures[0](new Error("connection lost"));
    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    failures[1](new Error("connection lost again"));
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(3));

    failures[2](new Error("connection still unavailable"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(factory).toHaveBeenCalledTimes(3);

    lease.release();
    manager.closeAll();
  });

  it("honors a provider reconnect cadence without changing shared recovery", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const failures: Array<(error: Error) => void> = [];
    const factory = vi.fn<ConnectionFactory>(
      async (_api, _entity, _signal, onFailure) => {
        failures.push(onFailure);
        return { stream: createStream(), close: vi.fn() };
      },
    );
    const manager = new MediaSessionManager(factory);
    const lease = manager.acquire({
      api: createApi(),
      cameraKey: "camera.front",
      entityId: "camera.front",
      factory,
      key: "test:spaced:camera.front",
      mediaReconnectPolicy: { baseDelayMs: 30_000, maxAttempts: 2 },
      retention: "preferred",
    });
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    failures[0](new Error("connection unavailable"));
    await vi.advanceTimersByTimeAsync(29_999);
    expect(factory).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));

    failures[1](new Error("connection still unavailable"));
    await vi.advanceTimersByTimeAsync(59_999);
    expect(factory).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(3));

    failures[2](new Error("connection remains unavailable"));
    await vi.advanceTimersByTimeAsync(180_000);
    expect(factory).toHaveBeenCalledTimes(3);

    lease.release();
    manager.closeAll();
  });

  it("bounds opt-in retries for an initial connection failure", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const factory = vi
      .fn<ConnectionFactory>()
      .mockRejectedValueOnce(new Error("cellular manifest request failed"))
      .mockResolvedValueOnce({ stream: createStream(), close: vi.fn() });
    const manager = new MediaSessionManager(factory, factory);
    const lease = manager.acquire({
      api: createApi(),
      cameraKey: "camera.front",
      entityId: "camera.front",
      factory,
      key: "test:hls:camera.front",
      retention: "fallback",
      retryInitialFailure: true,
    });

    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("failed"));
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"), {
      timeout: 1_000,
    });
    expect(factory).toHaveBeenCalledTimes(2);

    lease.release();
    manager.closeAll();
  });

  it("publishes typed failure diagnostics without changing retry policy", async () => {
    const factory = vi.fn<ConnectionFactory>(async () => {
      throw new MediaConnectionError(
        "signaling_failed",
        "provider signaling unavailable",
      );
    });
    const manager = new MediaSessionManager(factory);
    const lease = manager.acquireHomeAssistant(createApi(), "camera.front");

    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("failed"));
    expect(lease.getSnapshot()).toMatchObject({
      error: "provider signaling unavailable",
      errorCode: "signaling_failed",
    });
    expect(lease.getSnapshot().timing?.snapshot()).toMatchObject({
      failureCode: "signaling_failed",
    });
    expect(factory).toHaveBeenCalledOnce();

    lease.release();
    manager.closeAll();
  });

  it("deduplicates and retains Home Assistant HLS sessions", async () => {
    vi.useFakeTimers();
    const video = document.createElement("video");
    const close = vi.fn();
    const hlsFactory = vi.fn<ConnectionFactory>(async () => ({
      video,
      close,
    }));
    const manager = new MediaSessionManager(vi.fn(), hlsFactory);
    const api = createApi();

    const first = manager.acquireHomeAssistantHls(api, "camera.front");
    const second = manager.acquireHomeAssistantHls(api, "camera.front");
    await vi.waitFor(() => expect(first.getSnapshot().state).toBe("live"));

    expect(hlsFactory).toHaveBeenCalledOnce();
    expect(second.getSnapshot().video).toBe(video);
    first.release();
    second.release();
    expect(second.getSnapshot().state).toBe("parked");

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(close).not.toHaveBeenCalled();
    const returned = manager.acquireHomeAssistantHls(api, "camera.front");
    expect(returned.getSnapshot().video).toBe(video);
    expect(hlsFactory).toHaveBeenCalledOnce();
    returned.release();
    manager.closeAll();
    expect(close).toHaveBeenCalledOnce();
  });

  it("evicts a parked fallback before a preferred session at capacity", async () => {
    const fallbackClose = vi.fn();
    const preferredCloses = Array.from(
      { length: MAX_RETAINED_CAMERA_SESSIONS },
      () => vi.fn(),
    );
    let preferredIndex = 0;
    const preferredFactory = vi.fn<ConnectionFactory>(async () => ({
      stream: createStream(),
      close: preferredCloses[preferredIndex++],
    }));
    const fallbackFactory = vi.fn<ConnectionFactory>(async () => ({
      video: document.createElement("video"),
      close: fallbackClose,
    }));
    const manager = new MediaSessionManager(preferredFactory, fallbackFactory);
    const api = createApi();
    const fallback = manager.acquireHomeAssistantHls(api, "camera.fallback");
    await vi.waitFor(() => expect(fallback.getSnapshot().state).toBe("live"));
    fallback.release();

    for (let index = 1; index < MAX_RETAINED_CAMERA_SESSIONS; index += 1) {
      const entity = `camera.${index}`;
      const lease = manager.acquireHomeAssistant(api, entity);
      await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
      lease.release();
    }

    const next = manager.acquireHomeAssistant(api, "camera.next");
    await vi.waitFor(() => expect(next.getSnapshot().state).toBe("live"));
    expect(fallbackClose).toHaveBeenCalledOnce();
    for (const close of preferredCloses.slice(0, -1)) {
      expect(close).not.toHaveBeenCalled();
    }
    next.release();
    manager.closeAll();
  });

  it("publishes the HLS media element while an unmuted connection is starting", async () => {
    const video = document.createElement("video");
    let resolveConnection:
      | ((connection: { video: HTMLVideoElement; close(): void }) => void)
      | undefined;
    const connection = new Promise<{
      video: HTMLVideoElement;
      close(): void;
    }>((resolve) => {
      resolveConnection = resolve;
    });
    const hlsFactory = vi.fn<ConnectionFactory>(
      async (_api, _entity, _signal, _failure, _timing, options) => {
        options.onVideo?.(video);
        return connection;
      },
    );
    const manager = new MediaSessionManager(vi.fn(), hlsFactory);
    const lease = manager.acquireHomeAssistantHls(createApi(), "camera.front", {
      initialMuted: false,
    });

    expect(lease.getSnapshot()).toMatchObject({
      state: "connecting",
      video,
    });
    expect(hlsFactory.mock.calls[0][5].initialMuted).toBe(false);

    resolveConnection?.({ video, close: vi.fn() });
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
    lease.release();
    manager.closeAll();
  });

  it("hands a shared HLS element back to remaining leases without reconnecting", async () => {
    const video = document.createElement("video");
    const hlsFactory = vi.fn<ConnectionFactory>(async () => ({
      video,
      close: vi.fn(),
    }));
    const manager = new MediaSessionManager(vi.fn(), hlsFactory);
    const api = createApi();
    const preEditor = manager.acquireHomeAssistantHls(api, "camera.front");
    const editor = manager.acquireHomeAssistantHls(api, "camera.front");
    await vi.waitFor(() => expect(preEditor.getSnapshot().state).toBe("live"));
    const preEditorListener = vi.fn();
    const editorListener = vi.fn();
    preEditor.subscribe(preEditorListener);
    const unsubscribeEditor = editor.subscribe(editorListener);
    preEditorListener.mockClear();

    unsubscribeEditor();
    editor.release();

    expect(preEditorListener).toHaveBeenCalledOnce();
    expect(preEditorListener).toHaveBeenCalledWith(
      expect.objectContaining({ state: "live", video }),
    );
    expect(hlsFactory).toHaveBeenCalledOnce();
    preEditor.release();
    manager.closeAll();
  });

  it("reconnects a retained session that failed while parked", async () => {
    const failures: Array<(error: Error) => void> = [];
    const factory = vi.fn<ConnectionFactory>(
      async (_api, _entity, _signal, onFailure) => {
        failures.push(onFailure);
        return { stream: createStream(), close: vi.fn() };
      },
    );
    const manager = new MediaSessionManager(factory);
    const api = createApi();
    const initial = manager.acquireHomeAssistant(api, "camera.front");
    await vi.waitFor(() => expect(initial.getSnapshot().state).toBe("live"));
    initial.release();
    failures[0](new Error("parked connection expired"));
    expect(initial.getSnapshot().state).toBe("failed");

    const returned = manager.acquireHomeAssistant(api, "camera.front");
    await vi.waitFor(() => expect(returned.getSnapshot().state).toBe("live"));
    expect(factory).toHaveBeenCalledTimes(2);
    returned.release();
    manager.closeAll();
  });

  it("immediately discards an unshared losing HLS session", async () => {
    const close = vi.fn();
    const hlsFactory = vi.fn<ConnectionFactory>(async () => ({
      video: document.createElement("video"),
      close,
    }));
    const manager = new MediaSessionManager(vi.fn(), hlsFactory);
    const lease = manager.acquireHomeAssistantHls(createApi(), "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    lease.discard();
    expect(close).toHaveBeenCalledOnce();
    expect(lease.getSnapshot().state).toBe("closed");
  });
});
