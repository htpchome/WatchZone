import { describe, expect, it, vi } from "vitest";

import { BackendAvailabilityManager } from "../src/card/backend-availability";
import type {
  HomeAssistantApi,
  HomeAssistantMessage,
} from "../src/core/home-assistant";

function createApi(callWS: HomeAssistantApi["callWS"]): HomeAssistantApi {
  return {
    identity: { subscribeMessage: vi.fn(async () => () => undefined) },
    callWS,
    resolveUrl: (path) => path,
    subscribeMessage: vi.fn(async () => () => undefined),
  };
}

describe("backend availability", () => {
  it("adds no bootstrap request to the healthy path", async () => {
    const callWS = vi.fn(async (message: HomeAssistantMessage) => {
      void message;
      return { items: [] };
    });
    const api = createApi(
      <T>(message: HomeAssistantMessage) => callWS(message) as Promise<T>,
    );
    const manager = new BackendAvailabilityManager();

    await manager.guard(api).callWS({ type: "camera_optics/reviews/list" });

    expect(callWS).toHaveBeenCalledOnce();
    expect(callWS).toHaveBeenCalledWith({
      type: "camera_optics/reviews/list",
    });
    expect(manager.snapshot(api)).toBeUndefined();
  });

  it("opens once, diagnoses once, blocks more traffic, and explicitly recovers", async () => {
    let ready = false;
    const callWS = vi.fn(
      async <T>(message: HomeAssistantMessage): Promise<T> => {
        if (message.type === "camera_optics/bootstrap/status") {
          return {
            backend_version: "0.0.5-dev.4",
            saved_settings_version: ready ? 2 : null,
            state: ready ? "ready" : "not_configured",
            supported_settings_version: 2,
          } as T;
        }
        throw { code: "unknown_command", message: "Unknown command" };
      },
    );
    const api = createApi(
      <T>(message: HomeAssistantMessage) => callWS(message) as Promise<T>,
    );
    const manager = new BackendAvailabilityManager();
    const guarded = manager.guard(api);

    await expect(
      guarded.callWS({ type: "camera_optics/reviews/list" }),
    ).rejects.toMatchObject({ code: "unknown_command" });
    await vi.waitFor(() =>
      expect(manager.snapshot(api)).toMatchObject({
        checking: false,
        kind: "setup_required",
      }),
    );
    expect(
      callWS.mock.calls.filter(
        ([message]) => message.type === "camera_optics/bootstrap/status",
      ),
    ).toHaveLength(1);

    await expect(
      guarded.callWS({ type: "camera_optics/events/list" }),
    ).rejects.toThrow("waiting for setup or recovery");
    expect(callWS).toHaveBeenCalledTimes(2);

    ready = true;
    await manager.retry(api);

    expect(manager.snapshot(api)).toBeUndefined();
  });

  it("does not turn an ordinary feature failure into an application failure", async () => {
    const failure = {
      code: "reviews_list_failed",
      message: "Provider offline",
    };
    const api = createApi(() => Promise.reject(failure));
    const manager = new BackendAvailabilityManager();

    await expect(
      manager.guard(api).callWS({ type: "camera_optics/reviews/list" }),
    ).rejects.toBe(failure);

    expect(manager.snapshot(api)).toBeUndefined();
  });
});
