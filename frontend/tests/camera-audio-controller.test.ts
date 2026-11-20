import { afterEach, describe, expect, it, vi } from "vitest";

import { getMediaSessionManager } from "../src/core/media-session-manager";
import { CameraAudioController } from "../src/stage/camera-presentation/live/audio.controller";

describe("camera audio controller talk policy", () => {
  let controller: CameraAudioController | undefined;

  afterEach(() => {
    controller?.hostDisconnected();
    controller = undefined;
    vi.restoreAllMocks();
  });

  it("unmutes an explicitly muted camera while talk is active", () => {
    const entityId = "camera.explicitly-muted-talk-test";
    getMediaSessionManager().setCameraMuted(entityId, true);
    controller = createController();
    controller.hostConnected();
    controller.configure(entityId, false, false, true);

    controller.setTalkAudioActive(true);

    expect(controller.muted).toBe(false);
  });

  it("temporarily unmutes talk when no explicit camera preference exists", () => {
    controller = createController();
    controller.hostConnected();
    controller.configure("camera.default-talk-test", false, false, true);

    controller.setTalkAudioActive(true);

    expect(controller.muted).toBe(false);
  });

  it("refreshes the stored mute preference when a camera becomes active again", () => {
    const entityId = "camera.reactivated-muted-test";
    getMediaSessionManager().setCameraMuted(entityId, false);
    controller = createController();
    controller.hostConnected();
    controller.configure(entityId, false, false, true, true);
    controller.configure(entityId, false, false, false, false);
    getMediaSessionManager().setCameraMuted(entityId, true);

    controller.configure(entityId, false, false, false, true);

    expect(controller.muted).toBe(true);
  });
});

function createController(): CameraAudioController {
  const host = document.createElement("div") as unknown as HTMLElement & {
    addController(controller: unknown): void;
    removeController(controller: unknown): void;
    requestUpdate(): void;
    readonly updateComplete: Promise<boolean>;
  };
  host.addController = vi.fn();
  host.removeController = vi.fn();
  host.requestUpdate = vi.fn();
  Object.defineProperty(host, "updateComplete", {
    value: Promise.resolve(true),
  });
  return new CameraAudioController(host, {
    dismissToast: vi.fn(),
    getAutoplayWarning: () => "Audio blocked",
    getMediaState: () => ({}),
    showWarning: vi.fn(),
  });
}
