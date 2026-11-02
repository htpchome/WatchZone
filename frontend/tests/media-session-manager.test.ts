import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MEDIA_SESSION_RUNTIME_KEY,
  MEDIA_SESSION_TEARDOWN_RUNTIME_KEY,
} from "../src/core/constants";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import {
  type ConnectionFactory,
  getMediaSessionManager,
} from "../src/core/media-session-manager";
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

describe("MediaSessionManager", () => {
  afterEach(() => {
    vi.useRealTimers();
    const runtime = window as unknown as Record<string, unknown>;
    delete runtime[MEDIA_SESSION_RUNTIME_KEY];
    delete runtime[MEDIA_SESSION_TEARDOWN_RUNTIME_KEY];
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

  it("retains bfcache navigation and closes on final document exit", async () => {
    const close = vi.fn();
    const factory = vi.fn<ConnectionFactory>(async () => ({
      stream: createStream(),
      close,
    }));
    const manager = new MediaSessionManager(factory);
    const runtime = window as unknown as Record<string, unknown>;
    runtime[MEDIA_SESSION_RUNTIME_KEY] = manager;
    expect(getMediaSessionManager()).toBe(manager);
    const lease = manager.acquireHomeAssistant(createApi(), "camera.front");
    await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
    lease.release();

    const cachedPageHide = new Event("pagehide");
    Object.defineProperty(cachedPageHide, "persisted", { value: true });
    window.dispatchEvent(cachedPageHide);
    expect(close).not.toHaveBeenCalled();

    const finalPageHide = new Event("pagehide");
    Object.defineProperty(finalPageHide, "persisted", { value: false });
    window.dispatchEvent(finalPageHide);
    expect(close).toHaveBeenCalledOnce();
    expect(lease.getSnapshot().state).toBe("closed");
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
    const preferredCloses = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
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

    for (const entity of ["camera.one", "camera.two", "camera.three"]) {
      const lease = manager.acquireHomeAssistant(api, entity);
      await vi.waitFor(() => expect(lease.getSnapshot().state).toBe("live"));
      lease.release();
    }

    const fifth = manager.acquireHomeAssistant(api, "camera.four");
    await vi.waitFor(() => expect(fifth.getSnapshot().state).toBe("live"));
    expect(fallbackClose).toHaveBeenCalledOnce();
    for (const close of preferredCloses.slice(0, 3)) {
      expect(close).not.toHaveBeenCalled();
    }
    fifth.release();
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
