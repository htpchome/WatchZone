import { afterEach, describe, expect, it, vi } from "vitest";

import { englishLocalize } from "../src/core/localization";
import { PersistentTalkSession } from "../src/features/persistent-talk/session";
import type { ActiveCameraSession } from "../src/stage/camera-session-context";

const sessions: PersistentTalkSession[] = [];

describe("persistent two-way-talk session", () => {
  afterEach(() => {
    for (const session of sessions.splice(0)) session.dispose();
    history.replaceState(null, "", "/");
  });

  it("retains a connected peer after its camera surface leaves", async () => {
    const close = vi.fn();
    const connection = talkConnection(close);
    const resolver = { connect: vi.fn().mockResolvedValue(connection) };
    const session = createSession(resolver);
    const owner = {};
    const activeCamera = camera();
    session.updateSurface(owner, {
      ...target(),
      camera: activeCamera,
      host: document.createElement("div"),
    });

    await session.start(target());
    session.removeSurface(owner);

    expect(session.snapshot.status).toBe("connected");
    expect(session.snapshot.surfaceActive).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(activeCamera.setTalkAudioActive).toHaveBeenNthCalledWith(1, true);
    expect(activeCamera.setTalkAudioActive).toHaveBeenNthCalledWith(2, false);
  });

  it("ends the peer from the center control while retaining a restart target", async () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const resolver = {
      connect: vi
        .fn()
        .mockResolvedValueOnce(talkConnection(firstClose))
        .mockResolvedValueOnce(talkConnection(secondClose)),
    };
    const session = createSession(resolver);

    await session.start(target());
    session.stopAndRetain();

    expect(firstClose).toHaveBeenCalledOnce();
    expect(session.snapshot.status).toBe("ready");
    expect(session.snapshot.target?.entityId).toBe("camera.front");

    await session.start();

    expect(resolver.connect).toHaveBeenCalledTimes(2);
    expect(session.snapshot.status).toBe("connected");
    expect(secondClose).not.toHaveBeenCalled();
  });

  it("dismisses the restart target and closes its peer", async () => {
    const close = vi.fn();
    const session = createSession({
      connect: vi.fn().mockResolvedValue(talkConnection(close)),
    });
    await session.start(target());

    session.dismiss();

    expect(close).toHaveBeenCalledOnce();
    expect(session.snapshot.status).toBe("idle");
    expect(session.snapshot.target).toBeUndefined();
  });

  it("returns to the originating dashboard with the bound camera target", () => {
    const session = createSession({ connect: vi.fn() });
    const internal = session as unknown as {
      _target?: ReturnType<typeof target>;
    };
    internal._target = target("/lovelace/security?view=all#activity");
    const locationChanged = vi.fn();
    window.addEventListener("location-changed", locationChanged);

    session.returnToCamera();

    window.removeEventListener("location-changed", locationChanged);
    expect(window.location.pathname).toBe("/lovelace/security");
    expect(new URLSearchParams(window.location.search).get("camera")).toBe(
      "camera.front",
    );
    expect(window.location.hash).toBe("#activity");
    expect(locationChanged).toHaveBeenCalledOnce();
  });
});

function createSession(
  resolver: ConstructorParameters<typeof PersistentTalkSession>[0],
): PersistentTalkSession {
  const session = new PersistentTalkSession(resolver);
  sessions.push(session);
  return session;
}

function target(returnPath = "/lovelace/security") {
  return {
    api: {
      identity: { subscribeMessage: vi.fn() },
      callWS: vi.fn(),
      resolveUrl: (path: string) => path,
      subscribeMessage: vi.fn(),
    },
    connection: "home_assistant" as const,
    entityId: "camera.front",
    label: "Front Door",
    localize: englishLocalize,
    returnPath,
  };
}

function talkConnection(close: () => void) {
  return {
    close,
    localStream: {} as MediaStream,
    setMicrophoneMuted: vi.fn(),
  };
}

function camera(): ActiveCameraSession {
  return {
    available: true,
    connection: "home_assistant",
    entityId: "camera.front",
    muted: true,
    overlayVisible: true,
    holdOverlay: vi.fn(() => vi.fn()),
    revealOverlay: vi.fn(),
    setMuted: vi.fn(),
    setTalkAudioActive: vi.fn(),
  };
}
