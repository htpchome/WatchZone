import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FrigateGo2RtcLiveSourceDescriptor } from "../src/api/live-source";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import { LiveStartupTiming } from "../src/core/live-startup-timing";
import { createFrigateMseConnection } from "../src/providers/frigate/live/mse";

class FakeSourceBuffer extends EventTarget {
  public readonly appendBuffer = vi.fn<(chunk: ArrayBuffer) => void>();
  public readonly remove = vi.fn<(start: number, end: number) => void>();
  public updating = false;
}

class FakeMediaSource extends EventTarget {
  public static instances: FakeMediaSource[] = [];
  public readonly buffer = new FakeSourceBuffer();
  public readonly addSourceBuffer = vi.fn((mimeType: string) => {
    void mimeType;
    return this.buffer;
  });

  public constructor() {
    super();
    FakeMediaSource.instances.push(this);
  }
}

class FakeWebSocket extends EventTarget {
  public static instances: FakeWebSocket[] = [];
  public binaryType: BinaryType = "blob";
  public readonly close = vi.fn(() => undefined);
  public readonly send = vi.fn<(data: string) => void>();

  public constructor(public readonly url: string) {
    super();
    FakeWebSocket.instances.push(this);
  }

  public message(data: string | ArrayBuffer): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

const source: FrigateGo2RtcLiveSourceDescriptor = {
  id: "frigate_go2rtc:entry-workshop:front",
  type: "frigate_go2rtc",
  frigate_instance_id: "myWorkshop",
  stream_name: "front door",
};

function api(): HomeAssistantApi {
  return {
    identity: {} as HomeAssistantApi["identity"],
    callWS: vi.fn(async () => ({
      path: "/auth/signed-path",
    })) as HomeAssistantApi["callWS"],
    resolveUrl: (path) => `https://home.example${path}`,
    subscribeMessage: vi.fn() as HomeAssistantApi["subscribeMessage"],
  };
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("Frigate MSE connection", () => {
  beforeEach(() => {
    FakeMediaSource.instances = [];
    FakeWebSocket.instances = [];
    vi.stubGlobal("MediaSource", FakeMediaSource);
    vi.stubGlobal("WebSocket", FakeWebSocket);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:frigate-mse");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
      () => undefined,
    );
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(
      () => undefined,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the instance-qualified signed proxy, corrects drift, and cleans up", async () => {
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(
      controller.signal,
      "removeEventListener",
    );
    let video: HTMLVideoElement | undefined;
    const connectionPromise = createFrigateMseConnection(
      api(),
      "camera.front",
      controller.signal,
      vi.fn(),
      new LiveStartupTiming("frigate-mse"),
      {
        initialMuted: true,
        onVideo: (element) => {
          video = element;
        },
      },
      source,
    );
    await nextMicrotask();

    const mediaSource = FakeMediaSource.instances[0];
    const socket = FakeWebSocket.instances[0];
    expect(mediaSource).toBeDefined();
    expect(socket?.url).toBe("wss://home.example/auth/signed-path");
    mediaSource.dispatchEvent(new Event("sourceopen"));
    socket.dispatchEvent(new Event("open"));
    expect(socket.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"mse"'),
    );

    socket.message('{"type":"mse","value":"video/mp4"}');
    const chunk = new ArrayBuffer(8);
    socket.message(chunk);
    expect(mediaSource.buffer.appendBuffer).toHaveBeenCalledWith(chunk);

    expect(video).toBeDefined();
    Object.defineProperty(video!, "buffered", {
      configurable: true,
      value: {
        length: 1,
        start: () => 0,
        end: () => 20,
      },
    });
    video!.currentTime = 10;
    mediaSource.buffer.dispatchEvent(new Event("updateend"));
    expect(video!.currentTime).toBe(19.75);
    expect(video!.playbackRate).toBe(1);
    expect(mediaSource.buffer.remove).toHaveBeenCalledWith(0, 9.75);

    video!.dispatchEvent(new Event("loadeddata"));
    const connection = await connectionPromise;
    expect(connection.transport).toBe("mse");
    expect(removeAbortListener).toHaveBeenCalledWith(
      "abort",
      expect.any(Function),
    );

    connection.close();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:frigate-mse");
    expect(video!.hasAttribute("src")).toBe(false);
    expect(video!.isConnected).toBe(false);
  });

  it("fails a stalled decoder before queued media can grow without bound", async () => {
    const onFailure = vi.fn();
    let video: HTMLVideoElement | undefined;
    const connectionPromise = createFrigateMseConnection(
      api(),
      "camera.front",
      new AbortController().signal,
      onFailure,
      new LiveStartupTiming("frigate-mse-backpressure"),
      {
        initialMuted: true,
        onVideo: (element) => {
          video = element;
        },
      },
      source,
    );
    await nextMicrotask();

    const mediaSource = FakeMediaSource.instances[0]!;
    const socket = FakeWebSocket.instances[0]!;
    mediaSource.dispatchEvent(new Event("sourceopen"));
    socket.dispatchEvent(new Event("open"));
    socket.message('{"type":"mse","value":"video/mp4"}');
    video!.dispatchEvent(new Event("loadeddata"));
    const connection = await connectionPromise;

    mediaSource.buffer.updating = true;
    const oneMegabyte = new ArrayBuffer(1024 * 1024);
    for (let index = 0; index < 17; index += 1) {
      socket.message(oneMegabyte);
    }

    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure.mock.calls[0]?.[0]).toMatchObject({
      message: "Frigate MSE decoder fell behind the live stream",
    });
    connection.close();
    expect(socket.close).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:frigate-mse");
  });

  it("cleans up a timed-out startup and removes its abort listener", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(
      controller.signal,
      "removeEventListener",
    );
    const connectionPromise = createFrigateMseConnection(
      api(),
      "camera.front",
      controller.signal,
      vi.fn(),
      new LiveStartupTiming("frigate-mse-timeout"),
      { initialMuted: true },
      source,
    );
    await nextMicrotask();
    const rejected = expect(connectionPromise).rejects.toThrow(
      "Timed out connecting to Frigate MSE",
    );
    await vi.advanceTimersByTimeAsync(15_000);

    await rejected;
    expect(removeAbortListener).toHaveBeenCalledWith(
      "abort",
      expect.any(Function),
    );
    expect(FakeWebSocket.instances[0]?.close).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:frigate-mse");
    vi.useRealTimers();
  });

  it("fully cleans up when connection is cancelled before first media", async () => {
    const controller = new AbortController();
    const connectionPromise = createFrigateMseConnection(
      api(),
      "camera.front",
      controller.signal,
      vi.fn(),
      new LiveStartupTiming("frigate-mse-abort"),
      { initialMuted: true },
      source,
    );
    await nextMicrotask();
    controller.abort();

    await expect(connectionPromise).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(FakeWebSocket.instances[0]?.close).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:frigate-mse");
  });
});
