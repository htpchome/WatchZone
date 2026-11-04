import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraSessionContext } from "../src/core/camera-session-context";
import type { HomeAssistantApi } from "../src/core/home-assistant";

const resolver = vi.hoisted(() => ({
  capability: vi.fn(),
  start: vi.fn(),
}));

vi.mock("../src/providers/ptz-source-resolver", () => ({
  PtzSourceResolver: class {
    public capability = resolver.capability;
    public start = resolver.start;
  },
}));

import { PtzSessionController } from "../src/modules/ptz/session.controller";

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
    entityId,
    holdOverlay: vi.fn(() => releaseOverlay),
    muted: true,
    overlayVisible: true,
    revealOverlay: vi.fn(),
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
