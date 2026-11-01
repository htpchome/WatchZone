import { afterEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import {
  type ConnectionFactory,
  MediaSessionManager,
} from "../src/core/media-session-manager";

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

  it("closes a parked connection after the bounded retention period", async () => {
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
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(close).toHaveBeenCalledOnce();

    const replacement = manager.acquireHomeAssistant(api, "camera.front");
    await vi.waitFor(() =>
      expect(replacement.getSnapshot().state).toBe("live"),
    );
    expect(factory).toHaveBeenCalledTimes(2);
    replacement.release();
    manager.closeAll();
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

  it("deduplicates and briefly retains Home Assistant HLS sessions", async () => {
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

    await vi.advanceTimersByTimeAsync(15_000);
    expect(close).toHaveBeenCalledOnce();
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
