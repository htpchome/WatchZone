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

import { TalkSessionController } from "../src/components/two-way-talk/session.controller";

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
    controller.configure(api(), cameraContext, [source("camera.front")]);
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
    controller.configure(api(), cameraContext, [source("camera.front")]);
    await vi.waitFor(() => expect(controller.supported).toBe(true));
    await controller.start();

    controller.configure(api(), cameraContext, []);

    expect(close).toHaveBeenCalledOnce();
    expect(controller.active).toBe(false);
  });

  it("aborts startup without reporting a connection failure", async () => {
    let startupSignal: AbortSignal | undefined;
    resolver.supports.mockResolvedValue(true);
    resolver.connect.mockImplementation(
      (
        _api: HomeAssistantApi,
        _connection: string,
        _entityId: string,
        signal: AbortSignal,
      ) => {
        startupSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      },
    );
    const callbacks = {
      onConnected: vi.fn(),
      onFailed: vi.fn(),
      onStopped: vi.fn(),
    };
    const controller = new TalkSessionController(new Host(), callbacks);
    const cameraContext = new CameraSessionContext();
    controller.configure(api(), cameraContext, [source("camera.front")]);
    cameraContext.publish({}, camera("camera.front"));
    await vi.waitFor(() => expect(controller.supported).toBe(true));

    const startup = controller.start();
    await vi.waitFor(() => expect(controller.connecting).toBe(true));
    controller.stop();
    await startup;

    expect(startupSignal?.aborted).toBe(true);
    expect(controller.connecting).toBe(false);
    expect(callbacks.onConnected).not.toHaveBeenCalled();
    expect(callbacks.onFailed).not.toHaveBeenCalled();
    expect(callbacks.onStopped).toHaveBeenCalledOnce();
  });

  it("activates temporary camera audio only while talk is connected", async () => {
    resolver.supports.mockResolvedValue(true);
    resolver.connect.mockResolvedValue({
      close: vi.fn(),
      localStream: {} as MediaStream,
      setMicrophoneMuted: vi.fn(),
    });
    const activeCamera = camera("camera.front");
    const controller = new TalkSessionController(new Host(), {
      onConnected: vi.fn(),
      onFailed: vi.fn(),
      onStopped: vi.fn(),
    });
    const cameraContext = new CameraSessionContext();
    controller.configure(api(), cameraContext, [source("camera.front")]);
    cameraContext.publish({}, activeCamera);
    await vi.waitFor(() => expect(controller.supported).toBe(true));

    expect(activeCamera.setTalkAudioActive).not.toHaveBeenCalled();
    await controller.start();

    expect(activeCamera.setTalkAudioActive).toHaveBeenCalledWith(true);

    controller.stop();

    expect(activeCamera.setTalkAudioActive).toHaveBeenLastCalledWith(false);
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
    connection: "home_assistant" as const,
    entityId,
    muted: true,
    overlayVisible: true,
    holdOverlay: vi.fn(() => vi.fn()),
    revealOverlay: vi.fn(),
    setMuted: vi.fn(),
    setTalkAudioActive: vi.fn(),
  };
}

function source(entityId: string) {
  return { connection: "home_assistant" as const, entityId };
}

function api(): HomeAssistantApi {
  return {
    identity: { subscribeMessage: vi.fn() },
    callWS: vi.fn(),
    resolveUrl: (path) => path,
    subscribeMessage: vi.fn(),
  };
}
