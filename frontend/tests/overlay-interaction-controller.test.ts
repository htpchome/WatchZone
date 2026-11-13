import type { ReactiveControllerHost } from "lit";
import { describe, expect, it, vi } from "vitest";

import type { ActiveCameraSession } from "../src/stage/camera-session-context";
import { OverlayInteractionController } from "../src/stage/overlay-interaction.controller";

describe("overlay interaction controller", () => {
  it("transfers an active hold when overlay ownership changes", () => {
    const controller = new OverlayInteractionController(host());
    const first = session({});
    const second = session({});

    controller.configure(first);
    controller.handlePointerEnter({ pointerType: "mouse" } as PointerEvent);
    expect(first.holdOverlay).toHaveBeenCalledOnce();

    controller.configure(second);
    expect(first.release).toHaveBeenCalledOnce();
    expect(second.holdOverlay).toHaveBeenCalledOnce();
    expect(second.revealOverlay).toHaveBeenCalledOnce();

    controller.handlePointerLeave();
    expect(second.release).toHaveBeenCalledOnce();
  });

  it("keeps a hold when the same owner republishes its session", () => {
    const owner = {};
    const controller = new OverlayInteractionController(host());
    const first = session(owner);
    const update = session(owner);

    controller.configure(first);
    controller.handlePointerEnter({ pointerType: "mouse" } as PointerEvent);
    controller.configure(update);

    expect(first.release).not.toHaveBeenCalled();
    expect(update.holdOverlay).not.toHaveBeenCalled();
    controller.handlePointerLeave();
    expect(first.release).toHaveBeenCalledOnce();
  });
});

function host(): ReactiveControllerHost {
  return {
    addController: vi.fn(),
    removeController: vi.fn(),
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
}

function session(owner: object) {
  const release = vi.fn<() => void>();
  return {
    available: true,
    connection: "home_assistant",
    entityId: "camera.front",
    muted: true,
    overlayOwner: owner,
    overlayVisible: true,
    holdOverlay: vi.fn<() => () => void>(() => release),
    release,
    revealOverlay: vi.fn<() => void>(),
    setMuted: vi.fn<(muted: boolean) => void>(),
    setTalkAudioActive: vi.fn<(active: boolean) => void>(),
  } satisfies ActiveCameraSession & { readonly release: typeof release };
}
