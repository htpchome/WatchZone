import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraSessionContext } from "../src/core/camera-session-context";
import type { HomeAssistantApi } from "../src/core/home-assistant";

const resolver = vi.hoisted(() => ({
  connect: vi.fn(),
  supports: vi.fn(),
}));

vi.mock("../src/providers/talk-source-resolver", () => ({
  TalkSourceResolver: class {
    public connect = resolver.connect;
    public supports = resolver.supports;
  },
}));

import { TalkSessionController } from "../src/modules/two-way-talk/session.controller";

describe("two-way-talk session lifecycle", () => {
  afterEach(() => vi.clearAllMocks());

  it("closes the microphone peer on camera change and keeps live state external", async () => {
    const close = vi.fn();
    const setMicrophoneMuted = vi.fn();
    resolver.supports.mockResolvedValue(true);
    resolver.connect.mockResolvedValue({
      close,
      localStream: {} as MediaStream,
      setMicrophoneMuted,
    });
    const host = new Host();
    const callbacks = {
      onConnected: vi.fn(),
      onFailed: vi.fn(),
      onStopped: vi.fn(),
    };
    const controller = new TalkSessionController(host, callbacks);
    const cameraContext = new CameraSessionContext();
    controller.configure(api(), cameraContext, ["camera.front"]);
    cameraContext.publish({}, camera("camera.front"));
    await vi.waitFor(() => expect(controller.supported).toBe(true));

    await controller.start();
    controller.toggleMicrophoneMute();
    cameraContext.publish({}, camera("camera.back"));

    expect(resolver.connect).toHaveBeenCalledOnce();
    expect(setMicrophoneMuted).toHaveBeenCalledWith(true);
    expect(close).toHaveBeenCalledOnce();
    expect(callbacks.onStopped).toHaveBeenCalledOnce();
    expect(controller.active).toBe(false);
  });

  it("closes an active talk peer when its camera is disabled", async () => {
    const close = vi.fn();
    resolver.supports.mockResolvedValue(true);
    resolver.connect.mockResolvedValue({
      close,
      localStream: {} as MediaStream,
      setMicrophoneMuted: vi.fn(),
    });
    const host = new Host();
    const controller = new TalkSessionController(host, {
      onConnected: vi.fn(),
      onFailed: vi.fn(),
      onStopped: vi.fn(),
    });
    const cameraContext = new CameraSessionContext();
    cameraContext.publish({}, camera("camera.front"));
    controller.configure(api(), cameraContext, ["camera.front"]);
    await vi.waitFor(() => expect(controller.supported).toBe(true));
    await controller.start();

    controller.configure(api(), cameraContext, []);

    expect(close).toHaveBeenCalledOnce();
    expect(controller.active).toBe(false);
  });
});

class Host {
  public readonly updateComplete = Promise.resolve(true);
  public addController = vi.fn();
  public removeController = vi.fn();
  public requestUpdate = vi.fn();
}

function camera(entityId: string) {
  return {
    available: true,
    entityId,
    muted: true,
    overlayVisible: true,
    setMuted: vi.fn(),
  };
}

function api(): HomeAssistantApi {
  return {
    identity: { subscribeMessage: vi.fn() },
    callWS: vi.fn(),
    resolveUrl: (path) => path,
    subscribeMessage: vi.fn(),
  };
}
