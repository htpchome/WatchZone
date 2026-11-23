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

function createApi(identity: object = {}, revision?: object): HomeAssistantApi {
  return {
    identity: identity as HomeAssistantApi["identity"],
    r: revision,
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
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
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

  it("holds forced mute until every recorded-media owner releases it", () => {
    const manager = new MediaSessionManager();
    const states: boolean[] = [];
    const unsubscribe = manager.subscribeForcedMute((active) =>
      states.push(active),
    );
    const first = {};
    const second = {};

    manager.acquireForcedMute(first);
    manager.acquireForcedMute(first);
    manager.acquireForcedMute(second);
    manager.releaseForcedMute(first);
    manager.releaseForcedMute(first);
    manager.releaseForcedMute(second);

    expect(states).toEqual([false, true, false]);
    unsubscribe();
  });

  it("deduplicates concurrent leases and retains the connection", async () => {
    vi.useFakeTimers();
    const stream = createStream();
    const close = vi.fn();
    const park = vi.fn();
    const resume = vi.fn();
    const factory = vi.fn<ConnectionFactory>(async () => ({
      stream,
      close,
      park,
      resume,
    }));
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
    expect(park).toHaveBeenCalledOnce();

    const returned = manager.acquireHomeAssistant(api, "camera.front");
    expect(returned.getSnapshot()).toMatchObject({ state: "live", stream });
    expect(factory).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    expect(resume).toHaveBeenCalledOnce();

    returned.release();
    manager.closeAll();
  });

  it("keeps desktop WebRTC running inside two hidden minutes", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const park = vi.fn();
    const resume = vi.fn();
    const factory = vi.fn<ConnectionFactory>(async () => ({
      close,
      park,
      resume,
      stream: createStream(),
      transport: "webrtc",
    }));
    const manager = new MediaSessionManager(factory, factory, {
      clientDeviceClass: "desktop",
    });
    const lease = manager.acquireHomeAssistant(createApi(), "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(119_999);
    expect(park).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(resume).not.toHaveBeenCalled();
    expect(factory).toHaveBeenCalledOnce();
    expect(lease.getSnapshot().state).toBe("live");

    lease.release();
    manager.closeAll();
  });

  it("closes unleased retained WebRTC after two hidden minutes and waits for demand", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const factory = vi.fn<ConnectionFactory>(async () => ({
      close,
      stream: createStream(),
      transport: "webrtc",
      video: document.createElement("video"),
    }));
    const manager = new MediaSessionManager(factory, factory, {
      clientDeviceClass: "desktop",
    });
    const api = createApi();
    const key = "home_assistant:webrtc:camera.front";
    const lease = manager.acquireHomeAssistant(api, "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
    lease.markUsable();
    expect(lease.getSnapshot().usable).toBe(true);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    lease.release();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(lease.getSnapshot()).toMatchObject({ state: "failed" });
    expect(close).toHaveBeenCalledOnce();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(manager.acquireUsable(key, api)).toBeUndefined();
    expect(factory).toHaveBeenCalledOnce();

    const returned = manager.acquireHomeAssistant(api, "camera.front");
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(returned.getSnapshot().state).toBe("live"));

    returned.release();
    manager.closeAll();
  });

  it.each(["mse"] as const)(
    "reuses desktop %s when returning inside two hidden minutes",
    async (transport) => {
      const close = vi.fn();
      const resume = vi.fn();
      const factory = vi.fn<ConnectionFactory>(async () => ({
        close,
        resume,
        stream: createStream(),
        transport,
      }));
      const manager = new MediaSessionManager(factory, factory, {
        clientDeviceClass: "desktop",
      });
      const lease = manager.acquireHomeAssistant(createApi(), "camera.front");
      await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
      vi.useFakeTimers();

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(119_999);
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(close).not.toHaveBeenCalled();
      expect(resume).not.toHaveBeenCalled();
      expect(factory).toHaveBeenCalledOnce();
      expect(lease.getSnapshot().state).toBe("live");

      lease.release();
      manager.closeAll();
    },
  );

  it.each(["hls_mse", "hls_native"] as const)(
    "resumes and validates desktop %s when returning inside two hidden minutes",
    async (transport) => {
      const close = vi.fn();
      const resume = vi.fn();
      const factory = vi.fn<ConnectionFactory>(async () => ({
        close,
        resume,
        stream: createStream(),
        transport,
      }));
      const manager = new MediaSessionManager(factory, factory, {
        clientDeviceClass: "desktop",
      });
      const lease = manager.acquireHomeAssistant(createApi(), "camera.front");
      await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(resume).toHaveBeenCalledOnce();
      expect(close).not.toHaveBeenCalled();
      expect(factory).toHaveBeenCalledOnce();
      expect(lease.getSnapshot().state).toBe("live");

      lease.release();
      manager.closeAll();
    },
  );

  it("replaces retained HLS immediately when foreground validation fails", async () => {
    const firstClose = vi.fn();
    const firstResume = vi.fn(() =>
      Promise.reject(new Error("Retained HLS did not resume")),
    );
    const factory = vi
      .fn<ConnectionFactory>()
      .mockResolvedValueOnce({
        close: firstClose,
        resume: firstResume,
        stream: createStream(),
        transport: "hls_mse",
      })
      .mockResolvedValueOnce({
        close: vi.fn(),
        stream: createStream(),
        transport: "hls_mse",
      });
    const manager = new MediaSessionManager(factory, factory, {
      clientDeviceClass: "desktop",
    });
    const lease = manager.acquireHomeAssistant(createApi(), "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
    expect(firstResume).toHaveBeenCalledOnce();
    expect(firstClose).toHaveBeenCalledOnce();

    lease.release();
    manager.closeAll();
  });

  it.each(["webrtc", "mse", "hls_mse", "hls_native"] as const)(
    "retains desktop %s for two hidden minutes, then reconnects on return",
    async (transport) => {
      const closes: Array<ReturnType<typeof vi.fn>> = [];
      const factory = vi.fn<ConnectionFactory>(async () => {
        const close = vi.fn();
        closes.push(close);
        return { close, stream: createStream(), transport };
      });
      const manager = new MediaSessionManager(factory, factory, {
        clientDeviceClass: "desktop",
      });
      const lease = manager.acquireHomeAssistant(createApi(), "camera.front");
      await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
      vi.useFakeTimers();

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(119_999);
      expect(closes[0]).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(closes[0]).toHaveBeenCalledOnce();
      expect(factory).toHaveBeenCalledOnce();

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

      lease.release();
      manager.closeAll();
    },
  );

  it.each([
    {
      hlsKey: "home_assistant:hls:camera.front",
      label: "Home Assistant",
      webRtcKey: "home_assistant:webrtc:camera.front",
    },
    {
      hlsKey: "frigate_go2rtc:camera.front:main:hls",
      label: "Frigate go2rtc",
      webRtcKey: "frigate_go2rtc:camera.front:main:webrtc",
    },
  ])(
    "does not hold $label foreground HLS recovery behind an unavailable WebRTC candidate",
    async ({ hlsKey, webRtcKey }) => {
      vi.useFakeTimers();
      const webRtcFactory = vi
        .fn<ConnectionFactory>()
        .mockRejectedValueOnce(new Error("WebRTC is unavailable"))
        .mockImplementationOnce(
          () =>
            new Promise(() => {
              // Model a candidate that remains pending until its adapter timeout.
            }),
        );
      const hlsFactory = vi.fn<ConnectionFactory>(async () => ({
        close: vi.fn(),
        transport: "hls_mse",
        video: document.createElement("video"),
      }));
      const manager = new MediaSessionManager(webRtcFactory, hlsFactory, {
        clientDeviceClass: "desktop",
      });
      const api = createApi();
      const webRtc = manager.acquire({
        api,
        cameraKey: "camera.front",
        entityId: "camera.front",
        factory: webRtcFactory,
        key: webRtcKey,
        retention: "preferred",
      });
      const hls = manager.acquire({
        api,
        cameraKey: "camera.front",
        entityId: "camera.front",
        factory: hlsFactory,
        key: hlsKey,
        retention: "fallback",
      });
      await vi.waitFor(() => expect(webRtc.getSnapshot().state).toBe("failed"));
      await vi.waitFor(() => expect(hls.getSnapshot().state).toBe("live"));

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(120_000);
      expect(hls.getSnapshot().state).toBe("failed");

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);

      expect(webRtcFactory).toHaveBeenCalledTimes(2);
      expect(hlsFactory).toHaveBeenCalledTimes(2);
      await vi.waitFor(() => expect(hls.getSnapshot().state).toBe("live"));

      webRtc.release();
      hls.release();
      manager.closeAll();
    },
  );

  it("defers a hidden desktop replacement until the document is visible", async () => {
    const failures: Array<(error: Error) => void> = [];
    const factory = vi.fn<ConnectionFactory>(
      async (_api, _entity, _signal, onFailure) => {
        failures.push(onFailure);
        return { close: vi.fn(), stream: createStream() };
      },
    );
    const manager = new MediaSessionManager(factory, factory, {
      clientDeviceClass: "desktop",
    });
    const lease = manager.acquireHomeAssistant(createApi(), "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    failures[0](new Error("hidden transport failed"));
    expect(lease.getSnapshot().state).toBe("failed");
    expect(factory).toHaveBeenCalledOnce();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    lease.release();
    manager.closeAll();
  });

  it("replaces only a retained desktop transport that fails foreground validation", async () => {
    const firstClose = vi.fn();
    const firstResume = vi.fn(() =>
      Promise.reject(new Error("Retained media did not resume")),
    );
    const factory = vi
      .fn<ConnectionFactory>()
      .mockResolvedValueOnce({
        close: firstClose,
        park: vi.fn(),
        resume: firstResume,
        stream: createStream(),
      })
      .mockResolvedValueOnce({ close: vi.fn(), stream: createStream() });
    const manager = new MediaSessionManager(factory, factory, {
      clientDeviceClass: "desktop",
    });
    const api = createApi();
    const lease = manager.acquireHomeAssistant(api, "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
    lease.release();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    const returned = manager.acquireHomeAssistant(api, "camera.front");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(returned.getSnapshot().state).toBe("live"));
    expect(firstResume).toHaveBeenCalledOnce();
    expect(firstClose).toHaveBeenCalledOnce();

    returned.release();
    manager.closeAll();
  });

  it("closes mobile media while hidden and reconnects in the foreground", async () => {
    const closes: Array<ReturnType<typeof vi.fn>> = [];
    const factory = vi.fn<ConnectionFactory>(async () => {
      const close = vi.fn();
      closes.push(close);
      return { close, stream: createStream() };
    });
    const manager = new MediaSessionManager(factory, factory, {
      clientDeviceClass: "phone",
    });
    const lease = manager.acquireHomeAssistant(createApi(), "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(closes[0]).toHaveBeenCalledOnce();
    expect(lease.getSnapshot().state).toBe("failed");

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    lease.release();
    manager.closeAll();
  });

  it("parks a connection that finishes after its last lease is released", async () => {
    let finishConnection:
      | ((connection: Awaited<ReturnType<ConnectionFactory>>) => void)
      | undefined;
    const park = vi.fn();
    const close = vi.fn();
    const factory = vi.fn<ConnectionFactory>(
      () =>
        new Promise((resolve) => {
          finishConnection = resolve;
        }),
    );
    const manager = new MediaSessionManager(factory);
    const lease = manager.acquireHomeAssistant(createApi(), "camera.front");

    lease.release();
    finishConnection?.({ close, park });

    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("parked"));
    expect(park).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    manager.closeAll();
  });

  it("reacquires only a retained player that proved usable", async () => {
    const stream = createStream();
    const video = document.createElement("video");
    video.srcObject = stream;
    const close = vi.fn();
    const factory = vi.fn<ConnectionFactory>(async () => ({
      stream,
      video,
      close,
    }));
    const manager = new MediaSessionManager(factory);
    const api = createApi();
    const first = manager.acquireHomeAssistant(api, "camera.front");
    await vi.waitFor(() => expect(first.getSnapshot().state).toBe("live"));

    expect(
      manager.acquireUsable("home_assistant:webrtc:camera.front", api),
    ).toBeUndefined();
    first.markUsable();
    first.release();

    const returned = manager.acquireUsable(
      "home_assistant:webrtc:camera.front",
      api,
    );
    expect(returned?.getSnapshot()).toMatchObject({
      state: "live",
      stream,
      usable: true,
      video,
    });
    expect(factory).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    returned?.release();
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

  it("restarts with a current API wrapper after Home Assistant restores the same transport", async () => {
    const identity = {};
    const firstApi = createApi(identity);
    const restoredApi = createApi(identity, {});
    const closes: Array<ReturnType<typeof vi.fn>> = [];
    const factory = vi.fn<ConnectionFactory>(async () => {
      const close = vi.fn();
      closes.push(close);
      return { stream: createStream(), close };
    });
    const manager = new MediaSessionManager(factory);
    const first = manager.acquireHomeAssistant(firstApi, "camera.front");
    await vi.waitFor(() => expect(first.getSnapshot().state).toBe("live"));

    const restored = manager.acquireHomeAssistant(restoredApi, "camera.front");
    await vi.waitFor(() => expect(restored.getSnapshot().state).toBe("live"));

    expect(closes[0]).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenNthCalledWith(
      2,
      restoredApi,
      "camera.front",
      expect.any(AbortSignal),
      expect.any(Function),
      expect.anything(),
      expect.anything(),
    );
    first.release();
    restored.release();
    manager.closeAll();
  });

  it("preserves healthy active media when Home Assistant reconnects", async () => {
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
    expect(lease.getSnapshot().state).toBe("live");
    expect(closes[0]).not.toHaveBeenCalled();

    lifecycle.ready();
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
    expect(factory).toHaveBeenCalledOnce();

    lifecycle.ready();
    expect(factory).toHaveBeenCalledOnce();
    lease.release();
    manager.closeAll();
  });

  it("restores interrupted sessions sequentially in acquisition order", async () => {
    let firstRecoveryComplete: (() => void) | undefined;
    let initialConnections = 0;
    const failures = new Map<string, (error: Error) => void>();
    const recoveryOrder: string[] = [];
    const factory = vi.fn<ConnectionFactory>(
      async (_api, entityId, _signal, onFailure) => {
        initialConnections += 1;
        if (initialConnections <= 2) {
          failures.set(entityId, onFailure);
          return { stream: createStream(), close: vi.fn() };
        }
        recoveryOrder.push(entityId);
        if (entityId === "camera.zero") {
          await new Promise<void>((resolve) => {
            firstRecoveryComplete = resolve;
          });
        }
        return { stream: createStream(), close: vi.fn() };
      },
    );
    const manager = new MediaSessionManager(factory);
    const lifecycle = createLifecycleApi();
    const zero = manager.acquireHomeAssistant(lifecycle.api, "camera.zero");
    const one = manager.acquireHomeAssistant(lifecycle.api, "camera.one");
    await vi.waitFor(() => expect(one.getSnapshot().state).toBe("live"));

    lifecycle.disconnect();
    failures.get("camera.zero")?.(new Error("media stopped during restart"));
    failures.get("camera.one")?.(new Error("media stopped during restart"));
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
    let failInitial: ((error: Error) => void) | undefined;
    const factory = vi
      .fn<ConnectionFactory>()
      .mockImplementationOnce(async (_api, _entity, _signal, onFailure) => {
        failInitial = onFailure;
        return { stream: createStream(), close: vi.fn() };
      })
      .mockRejectedValueOnce(new Error("CameraOptics backend is starting"))
      .mockResolvedValueOnce({ stream: createStream(), close: vi.fn() });
    const manager = new MediaSessionManager(factory);
    const lifecycle = createLifecycleApi();
    const lease = manager.acquireHomeAssistant(lifecycle.api, "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    lifecycle.disconnect();
    failInitial?.(new Error("media stopped during restart"));
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
    let failInitial: ((error: Error) => void) | undefined;
    const factory = vi
      .fn<ConnectionFactory>()
      .mockImplementationOnce(async (_api, _entity, _signal, onFailure) => {
        failInitial = onFailure;
        return { stream: createStream(), close: vi.fn() };
      })
      .mockRejectedValue(new Error("CameraOptics backend is unavailable"));
    const manager = new MediaSessionManager(factory);
    const lifecycle = createLifecycleApi();
    const lease = manager.acquireHomeAssistant(lifecycle.api, "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    lifecycle.disconnect();
    failInitial?.(new Error("media stopped during restart"));
    lifecycle.ready();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(factory).toHaveBeenCalledTimes(7);
    expect(lease.getSnapshot()).toMatchObject({
      state: "failed",
      error: "CameraOptics backend is unavailable",
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

  it("preserves a healthy parked session across a Home Assistant restart", async () => {
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
    expect(factory).toHaveBeenCalledOnce();
    returned.release();
    manager.closeAll();
  });

  it("preserves a failed retry cooldown when the document returns", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const failures: Array<(error: Error) => void> = [];
    const factory = vi.fn<ConnectionFactory>(
      async (_api, _entity, _signal, onFailure) => {
        failures.push(onFailure);
        return { stream: createStream(), close: vi.fn(), resume: vi.fn() };
      },
    );
    const manager = new MediaSessionManager(factory);
    const lease = manager.acquireHomeAssistant(createApi(), "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));

    failures[0](new Error("background transport stalled"));
    expect(lease.getSnapshot().state).toBe("failed");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(499);
    expect(factory).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    expect(lease.getSnapshot().state).toBe("live");

    lease.release();
    manager.closeAll();
  });

  it("restarts a background-stalled connection immediately in the foreground", async () => {
    vi.useFakeTimers();
    let resolveFirst:
      | ((connection: Awaited<ReturnType<ConnectionFactory>>) => void)
      | undefined;
    const factory = vi
      .fn<ConnectionFactory>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ stream: createStream(), close: vi.fn() });
    const manager = new MediaSessionManager(factory);
    const lease = manager.acquireHomeAssistant(createApi(), "camera.front");
    expect(lease.getSnapshot().state).toBe("connecting");

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    expect(lease.getSnapshot().state).toBe("live");

    resolveFirst?.({ stream: createStream(), close: vi.fn() });
    lease.release();
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

  it("preserves a WebRTC retry cooldown across camera release and reacquisition", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const factory = vi
      .fn<ConnectionFactory>()
      .mockRejectedValue(new Error("WebRTC signaling unavailable"));
    const manager = new MediaSessionManager(factory);
    const request = {
      api: createApi(),
      cameraKey: "camera.front",
      entityId: "camera.front",
      factory,
      key: "test:webrtc:camera.front",
      mediaReconnectPolicy: { baseDelayMs: 60_000, maxAttempts: 5 },
      retention: "preferred" as const,
      retryInitialFailure: true,
    };
    const initial = manager.acquire(request);
    await vi.waitFor(() => expect(initial.getSnapshot().state).toBe("failed"));
    expect(factory).toHaveBeenCalledOnce();
    initial.release();

    const returned = manager.acquire(request);
    expect(returned.getSnapshot().state).toBe("failed");
    expect(factory).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(59_000);
    expect(factory).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledTimes(2));

    returned.release();
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

  it("invalidates integration work while remaining reusable after recovery", async () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const factory = vi
      .fn<ConnectionFactory>()
      .mockResolvedValueOnce({ stream: createStream(), close: firstClose })
      .mockResolvedValueOnce({ stream: createStream(), close: secondClose });
    const manager = new MediaSessionManager(factory);
    const api = createApi();
    const first = manager.acquireHomeAssistant(api, "camera.front");
    await vi.waitFor(() => expect(first.getSnapshot().state).toBe("live"));

    manager.invalidateAll();

    expect(firstClose).toHaveBeenCalledOnce();
    expect(first.getSnapshot().state).toBe("closed");
    const recovered = manager.acquireHomeAssistant(api, "camera.front");
    await vi.waitFor(() => expect(recovered.getSnapshot().state).toBe("live"));
    expect(factory).toHaveBeenCalledTimes(2);

    recovered.release();
    manager.closeAll();
    expect(secondClose).toHaveBeenCalledOnce();
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

  it("rejects a new session when every capacity slot has an active lease", () => {
    const factory = vi.fn<ConnectionFactory>(async () => ({
      stream: createStream(),
      close: vi.fn(),
    }));
    const manager = new MediaSessionManager(factory);
    const api = createApi();

    for (let index = 0; index < MAX_RETAINED_CAMERA_SESSIONS; index += 1) {
      manager.acquireHomeAssistant(api, `camera.${index}`);
    }

    expect(() =>
      manager.acquireHomeAssistant(api, "camera.over-capacity"),
    ).toThrowError(
      expect.objectContaining({
        code: "capacity_exceeded",
        message: "Live-session capacity is in use",
      }),
    );
    expect(factory).toHaveBeenCalledTimes(MAX_RETAINED_CAMERA_SESSIONS);
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

  it("restarts a stalled provider attempt when availability returns", async () => {
    let attempts = 0;
    const factory = vi.fn<ConnectionFactory>(async (_api, _entity, signal) => {
      attempts += 1;
      if (attempts === 1) {
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("cancelled", "AbortError")),
            { once: true },
          );
        });
      }
      return { stream: createStream(), close: vi.fn() };
    });
    const manager = new MediaSessionManager(factory);
    const lease = manager.acquire({
      api: createApi(),
      cameraKey: "camera.front",
      entityId: "camera.front",
      factory,
      key: "frigate_go2rtc:camera.front:main:webrtc",
      retention: "preferred",
    });
    expect(lease.getSnapshot().state).toBe("connecting");

    manager.wake("frigate_go2rtc:");

    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
    expect(factory).toHaveBeenCalledTimes(2);
    lease.release();
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
