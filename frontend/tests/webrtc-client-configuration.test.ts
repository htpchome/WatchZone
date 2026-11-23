import { describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import { requestWebRtcClientConfiguration } from "../src/providers/live/webrtc-client-configuration";

function pendingApi(): HomeAssistantApi {
  return {
    identity: {} as HomeAssistantApi["identity"],
    callWS: vi.fn(
      <T>() => new Promise<T>(() => undefined),
    ) as HomeAssistantApi["callWS"],
    resolveUrl: (path) => path,
    subscribeMessage: vi.fn(),
  };
}

describe("WebRTC client configuration", () => {
  it("cancels a pending configuration request with its session", async () => {
    const abort = new AbortController();
    const request = requestWebRtcClientConfiguration(
      pendingApi(),
      "camera.front",
      abort.signal,
      15_000,
    );

    abort.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("bounds a stalled configuration request", async () => {
    vi.useFakeTimers();
    const request = requestWebRtcClientConfiguration(
      pendingApi(),
      "camera.front",
      new AbortController().signal,
      15_000,
    );

    const rejection = expect(request).rejects.toMatchObject({
      code: "configuration_timeout",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    vi.useRealTimers();
  });
});
