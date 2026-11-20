import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraSessionContext } from "../src/stage/camera-session-context";
import type { HomeAssistantApi } from "../src/core/home-assistant";

const resolver = vi.hoisted(() => ({
  capability: vi.fn(),
  recallPreset: vi.fn(),
  start: vi.fn(),
}));

vi.mock("../src/providers/ptz-source-resolver", () => ({
  PtzSourceResolver: class {
    public capability = resolver.capability;
    public recallPreset = resolver.recallPreset;
    public start = resolver.start;
  },
}));

import { PtzSessionController } from "../src/stage/components/ptz/session.controller";

describe("PTZ session lifecycle", () => {
  afterEach(() => vi.clearAllMocks());

  it("holds the shared overlay and stops motion on release", async () => {
    const stopMotion = vi.fn();
    const releaseOverlay = vi.fn();
    resolver.capability.mockResolvedValue(capability());
    resolver.start.mockResolvedValue(stopMotion);
    const callbacks = { onFailure: vi.fn(), onStopped: vi.fn() };
    const controller = new PtzSessionController(new Host(), callbacks);
    const context = new CameraSessionContext();
    controller.configure(api(), context, [source("camera.front")]);
    context.publish({}, camera("camera.front", releaseOverlay));
    await vi.waitFor(() => expect(controller.capability?.supported).toBe(true));

    await controller.start("left");
    controller.stop();

    expect(stopMotion).toHaveBeenCalledOnce();
    expect(releaseOverlay).toHaveBeenCalledOnce();
    expect(callbacks.onStopped).toHaveBeenCalledOnce();
  });

  it("stops the old camera before resolving capability for a new camera", async () => {
    const stopMotion = vi.fn();
    resolver.capability.mockResolvedValue(capability());
    resolver.start.mockResolvedValue(stopMotion);
    const controller = new PtzSessionController(new Host(), {
      onFailure: vi.fn(),
      onStopped: vi.fn(),
    });
    const context = new CameraSessionContext();
    controller.configure(api(), context, [
      source("camera.front"),
      source("camera.back"),
    ]);
    context.publish({}, camera("camera.front"));
    await vi.waitFor(() => expect(controller.capability?.supported).toBe(true));
    await controller.start("up");

    context.publish({}, camera("camera.back"));

    expect(stopMotion).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(resolver.capability).toHaveBeenLastCalledWith(
        expect.anything(),
        "home_assistant",
        "camera.back",
      ),
    );
  });

  it("cancels a late movement subscription without leaving motion active", async () => {
    let resolveStart: ((stop: () => void) => void) | undefined;
    const stopMotion = vi.fn();
    resolver.capability.mockResolvedValue(capability());
    resolver.start.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveStart = resolve;
      }),
    );
    const controller = new PtzSessionController(new Host(), {
      onFailure: vi.fn(),
      onStopped: vi.fn(),
    });
    const context = new CameraSessionContext();
    controller.configure(api(), context, [source("camera.front")]);
    context.publish({}, camera("camera.front"));
    await vi.waitFor(() => expect(controller.capability?.supported).toBe(true));

    const starting = controller.start("right");
    controller.stop();
    resolveStart?.(stopMotion);
    await starting;

    expect(stopMotion).toHaveBeenCalledOnce();
  });

  it("resolves capability when Home Assistant arrives after the camera", async () => {
    resolver.capability.mockResolvedValue(capability());
    const controller = new PtzSessionController(new Host(), {
      onFailure: vi.fn(),
      onStopped: vi.fn(),
    });
    const context = new CameraSessionContext();
    controller.configure(undefined, context, [source("camera.front")]);
    context.publish({}, camera("camera.front"));

    expect(resolver.capability).not.toHaveBeenCalled();
    controller.configure(api(), context, [source("camera.front")]);

    await vi.waitFor(() => expect(controller.capability?.supported).toBe(true));
    expect(resolver.capability).toHaveBeenCalledOnce();
  });

  it("recalls a preset as a finite command without a stop subscription", async () => {
    resolver.capability.mockResolvedValue({
      ...capability(),
      presets: ["Driveway"],
    });
    resolver.recallPreset.mockResolvedValue(undefined);
    const releaseOverlay = vi.fn();
    const callbacks = { onFailure: vi.fn(), onStopped: vi.fn() };
    const controller = new PtzSessionController(new Host(), callbacks);
    const context = new CameraSessionContext();
    controller.configure(api(), context, [source("camera.front")]);
    context.publish({}, camera("camera.front", releaseOverlay));
    await vi.waitFor(() =>
      expect(controller.capability?.presets).toEqual(["Driveway"]),
    );

    await controller.recallPreset("Driveway");

    expect(resolver.recallPreset).toHaveBeenCalledWith(
      expect.anything(),
      "home_assistant",
      "camera.front",
      "Driveway",
    );
    expect(resolver.start).not.toHaveBeenCalled();
    expect(releaseOverlay).not.toHaveBeenCalled();
    expect(callbacks.onStopped).not.toHaveBeenCalled();
  });

  it("uses optical zoom when the provider reports it", async () => {
    const stopMotion = vi.fn();
    resolver.capability.mockResolvedValue({ ...capability(), zoom: true });
    resolver.start.mockResolvedValue(stopMotion);
    const controller = new PtzSessionController(new Host(), {
      onFailure: vi.fn(),
      onStopped: vi.fn(),
    });
    const context = new CameraSessionContext();
    const session = camera("camera.front");
    controller.configure(api(), context, [source("camera.front")]);
    context.publish({}, session);
    await vi.waitFor(() => expect(controller.capability?.zoom).toBe(true));

    await controller.start("zoom_in", false);
    controller.stop();

    expect(resolver.start).toHaveBeenCalledWith(
      expect.anything(),
      "home_assistant",
      "camera.front",
      "zoom_in",
    );
    expect(stopMotion).toHaveBeenCalledOnce();
    expect(session.zoomDisplay).not.toHaveBeenCalled();
  });

  it("falls back to display zoom when optical zoom is unavailable", async () => {
    resolver.capability.mockResolvedValue(capability());
    const controller = new PtzSessionController(new Host(), {
      onFailure: vi.fn(),
      onStopped: vi.fn(),
    });
    const context = new CameraSessionContext();
    const session = camera("camera.front");
    controller.configure(api(), context, [source("camera.front")]);
    context.publish({}, session);
    await vi.waitFor(() => expect(controller.capability?.supported).toBe(true));

    await controller.start("zoom_out", false);

    expect(session.zoomDisplay).toHaveBeenCalledWith("out");
    expect(resolver.start).not.toHaveBeenCalled();
  });

  it("falls back to display zoom when advertised optical zoom is rejected", async () => {
    resolver.capability.mockResolvedValue({ ...capability(), zoom: true });
    resolver.start.mockRejectedValue(new Error("Optical zoom unavailable"));
    const callbacks = { onFailure: vi.fn(), onStopped: vi.fn() };
    const controller = new PtzSessionController(new Host(), callbacks);
    const context = new CameraSessionContext();
    const session = camera("camera.front");
    controller.configure(api(), context, [source("camera.front")]);
    context.publish({}, session);
    await vi.waitFor(() => expect(controller.capability?.zoom).toBe(true));

    await controller.start("zoom_in", false);

    expect(session.zoomDisplay).toHaveBeenCalledWith("in");
    expect(callbacks.onFailure).not.toHaveBeenCalled();
  });
});

class Host {
  public readonly updateComplete = Promise.resolve(true);
  public addController = vi.fn();
  public removeController = vi.fn();
  public requestUpdate = vi.fn();
}

function capability() {
  return {
    focus: false,
    pan: true,
    presets: [],
    supported: true,
    tilt: true,
    zoom: false,
  };
}

function source(entityId: string) {
  return { entityId, provider: "home_assistant" as const };
}

function camera(entityId: string, releaseOverlay = vi.fn()) {
  return {
    available: true,
    connection: "home_assistant" as const,
    entityId,
    holdOverlay: vi.fn(() => releaseOverlay),
    muted: true,
    overlayVisible: true,
    revealOverlay: vi.fn(),
    setMuted: vi.fn(),
    setTalkAudioActive: vi.fn(),
    zoomDisplay: vi.fn(),
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
