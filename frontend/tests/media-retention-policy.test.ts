import { describe, expect, it, vi } from "vitest";

import {
  type MediaRetentionCamera,
  MediaRetentionPolicy,
} from "../src/core/media-retention-policy";
import type { ConnectionFactory } from "../src/core/media-session-manager";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import { TestMediaSessionManager } from "./test-media-session-manager";

function camera(
  key: string,
  options: Partial<MediaRetentionCamera> = {},
): MediaRetentionCamera {
  return {
    active: false,
    deviceClass: "phone",
    key,
    lastUsed: 0,
    preference: "automatic",
    ...options,
  };
}

function api(): HomeAssistantApi {
  return {
    identity: { connected: true, subscribeMessage: vi.fn() },
    callWS: vi.fn(),
    resolveUrl: (path) => path,
    subscribeMessage: vi.fn(),
  };
}

describe("MediaRetentionPolicy", () => {
  it("keeps desktop and tablet sessions outside the phone budget", () => {
    const policy = new MediaRetentionPolicy(vi.fn(), {
      network: { type: "cellular" },
    });

    expect(
      policy.evaluate([
        camera("desktop", { deviceClass: "desktop" }),
        camera("tablet", { deviceClass: "tablet" }),
      ]),
    ).toEqual(new Set());
    policy.dispose();
  });

  it("uses the standard profile for a phone on Wi-Fi", () => {
    const policy = new MediaRetentionPolicy(vi.fn(), {
      network: { type: "wifi" },
    });

    expect(
      policy.evaluate([
        camera("active", { active: true }),
        camera("one"),
        camera("two"),
        camera("three"),
      ]),
    ).toEqual(new Set());
    policy.dispose();
  });

  it("uses the standard profile when phone network information is unavailable", () => {
    const policy = new MediaRetentionPolicy(vi.fn());

    expect(
      policy.evaluate([
        camera("active", { active: true }),
        camera("one"),
        camera("two"),
        camera("three"),
      ]),
    ).toEqual(new Set());
    policy.dispose();
  });

  it("retains the two most recent inactive cameras beside one active cellular camera", () => {
    const policy = new MediaRetentionPolicy(vi.fn(), {
      network: { type: "cellular" },
      now: () => 100,
    });

    expect(
      policy.evaluate([
        camera("active", { active: true, lastUsed: 100 }),
        camera("newest", { lastUsed: 90 }),
        camera("middle", { lastUsed: 80 }),
        camera("oldest", { lastUsed: 70 }),
      ]),
    ).toEqual(new Set(["oldest"]));
    policy.dispose();
  });

  it("can force the reduced-bandwidth profile on a Wi-Fi phone", () => {
    const policy = new MediaRetentionPolicy(vi.fn(), {
      network: { type: "wifi" },
      now: () => 100,
    });

    expect(
      policy.evaluate([
        camera("active", {
          active: true,
          lastUsed: 100,
          preference: "reduced_bandwidth",
        }),
        camera("newest", {
          lastUsed: 90,
          preference: "reduced_bandwidth",
        }),
        camera("middle", {
          lastUsed: 80,
          preference: "reduced_bandwidth",
        }),
        camera("oldest", {
          lastUsed: 70,
          preference: "reduced_bandwidth",
        }),
      ]),
    ).toEqual(new Set(["oldest"]));
    policy.dispose();
  });

  it("expires an inactive reduced-bandwidth camera after the shared warm interval", () => {
    let now = 1_000;
    let expiry: (() => void) | undefined;
    const onPolicyChange = vi.fn();
    const policy = new MediaRetentionPolicy(onPolicyChange, {
      network: { type: "cellular" },
      now: () => now,
      setTimer: (callback) => {
        expiry = callback;
        return 1;
      },
      clearTimer: vi.fn(),
    });

    expect(policy.evaluate([camera("recent", { lastUsed: now })])).toEqual(
      new Set(),
    );
    now += 120_000;
    expiry?.();
    expect(onPolicyChange).toHaveBeenCalledOnce();
    expect(policy.evaluate([camera("recent", { lastUsed: 1_000 })])).toEqual(
      new Set(["recent"]),
    );
    policy.dispose();
  });
});

describe("MediaSessionManager adaptive retention", () => {
  it("closes every retained transport for the least-recent cellular phone camera", async () => {
    const preferredClose = vi.fn();
    const fallbackClose = vi.fn();
    const preferredFactory = vi.fn<ConnectionFactory>(async () => ({
      close: preferredClose,
    }));
    const fallbackFactory = vi.fn<ConnectionFactory>(async () => ({
      close: fallbackClose,
    }));
    const manager = new TestMediaSessionManager(
      preferredFactory,
      fallbackFactory,
      { network: { type: "cellular" } },
    );
    const owner = {};
    manager.setCameraRetentionPreference(
      owner,
      ["camera.old", "camera.middle", "camera.recent", "camera.current"],
      "phone",
      "automatic",
    );
    manager.setCameraActivity(owner, "camera.old", "phone");
    const preferred = manager.acquireHomeAssistant(api(), "camera.old");
    const fallback = manager.acquireHomeAssistantHls(api(), "camera.old");
    await vi.waitFor(() => expect(preferred.getSnapshot().state).toBe("live"));
    await vi.waitFor(() => expect(fallback.getSnapshot().state).toBe("live"));

    preferred.release();
    fallback.release();
    for (const entityId of ["camera.middle", "camera.recent"]) {
      manager.setCameraActivity(owner, entityId, "phone");
      const nextPreferred = manager.acquireHomeAssistant(api(), entityId);
      const nextFallback = manager.acquireHomeAssistantHls(api(), entityId);
      await vi.waitFor(() =>
        expect(nextPreferred.getSnapshot().state).toBe("live"),
      );
      await vi.waitFor(() =>
        expect(nextFallback.getSnapshot().state).toBe("live"),
      );
      nextPreferred.release();
      nextFallback.release();
    }
    manager.setCameraActivity(owner, "camera.current", "phone");
    const currentPreferred = manager.acquireHomeAssistant(
      api(),
      "camera.current",
    );
    const currentFallback = manager.acquireHomeAssistantHls(
      api(),
      "camera.current",
    );
    await vi.waitFor(() =>
      expect(currentPreferred.getSnapshot().state).toBe("live"),
    );
    await vi.waitFor(() =>
      expect(currentFallback.getSnapshot().state).toBe("live"),
    );
    expect(preferredClose).toHaveBeenCalledOnce();
    expect(fallbackClose).toHaveBeenCalledOnce();
    currentPreferred.release();
    currentFallback.release();
    manager.closeAll();
  });

  it("reuses the last cellular phone camera after route disconnection", async () => {
    const close = vi.fn();
    const factory = vi.fn<ConnectionFactory>(async () => ({ close }));
    const manager = new TestMediaSessionManager(factory, vi.fn(), {
      network: { type: "cellular" },
    });
    const owner = {};
    const homeAssistant = api();
    manager.setCameraActivity(owner, "camera.current", "phone");
    const first = manager.acquireHomeAssistant(homeAssistant, "camera.current");
    await vi.waitFor(() => expect(first.getSnapshot().state).toBe("live"));

    manager.clearCameraActivity(owner);
    first.release();
    expect(close).not.toHaveBeenCalled();

    manager.setCameraActivity(owner, "camera.current", "phone");
    const returned = manager.acquireHomeAssistant(
      homeAssistant,
      "camera.current",
    );
    expect(returned.getSnapshot().state).toBe("live");
    expect(factory).toHaveBeenCalledOnce();
    returned.release();
    manager.closeAll();
  });

  it("reuses a recently retained phone connection on confirmed Wi-Fi", async () => {
    const close = vi.fn();
    const factory = vi.fn<ConnectionFactory>(async () => ({ close }));
    const manager = new TestMediaSessionManager(factory, vi.fn(), {
      network: { type: "wifi" },
    });
    const owner = {};
    const homeAssistant = api();
    manager.setCameraActivity(owner, "camera.old", "phone");
    const first = manager.acquireHomeAssistant(homeAssistant, "camera.old");
    await vi.waitFor(() => expect(first.getSnapshot().state).toBe("live"));

    manager.setCameraActivity(owner, "camera.current", "phone");
    first.release();
    expect(close).not.toHaveBeenCalled();

    manager.setCameraActivity(owner, "camera.old", "phone");
    const returned = manager.acquireHomeAssistant(homeAssistant, "camera.old");
    expect(returned.getSnapshot().state).toBe("live");
    expect(factory).toHaveBeenCalledOnce();
    returned.release();
    manager.closeAll();
  });
});
