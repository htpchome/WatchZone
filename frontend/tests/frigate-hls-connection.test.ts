import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { LiveStartupTiming } from "../src/core/live-startup-timing";
import type { MediaConnectionOptions } from "../src/core/media-session-manager";

const createHlsConnection = vi.fn();

vi.mock("../src/providers/live/hls", () => ({ createHlsConnection }));

describe("Frigate HLS source acquisition", () => {
  beforeEach(() => createHlsConnection.mockReset());

  it("requests only the backend-validated Frigate HLS endpoint", async () => {
    const connection = { close: vi.fn() };
    createHlsConnection.mockResolvedValue(connection);
    const { createFrigateHlsConnection } =
      await import("../src/providers/frigate/live/hls");
    const callWS = vi.fn(async () => ({ url: "/api/hls/token/master.m3u8" }));
    const api = {
      identity: {},
      callWS,
      resolveUrl: (path: string) => path,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;
    const signal = new AbortController().signal;
    const timing = {} as LiveStartupTiming;
    const options: MediaConnectionOptions = { initialMuted: true };

    await expect(
      createFrigateHlsConnection(
        api,
        "camera.front",
        signal,
        vi.fn(),
        timing,
        options,
      ),
    ).resolves.toBe(connection);

    const resolveStreamUrl = createHlsConnection.mock.calls[0]?.[6] as (
      client: HomeAssistantApi,
      entityId: string,
    ) => Promise<string>;
    await expect(resolveStreamUrl(api, "camera.front")).resolves.toBe(
      "/api/hls/token/master.m3u8",
    );
    expect(callWS).toHaveBeenCalledWith({
      type: "watchzone/live/frigate/hls",
      entity_id: "camera.front",
    });
  });
});
