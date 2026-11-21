import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { LiveStartupTiming } from "../src/core/live-startup-timing";
import type { MediaConnectionOptions } from "../src/core/media-session-manager";
import type { FrigateGo2RtcLiveSourceDescriptor } from "../src/api/live-source";

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
    const source: FrigateGo2RtcLiveSourceDescriptor = {
      frigate_instance_id: "frigate",
      id: "frigate_go2rtc:entry:front",
      stream_name: "front",
      type: "frigate_go2rtc",
    };

    await expect(
      createFrigateHlsConnection(
        api,
        "camera.front",
        signal,
        vi.fn(),
        timing,
        options,
        source,
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
      type: "camera_optics/live/frigate/hls",
      entity_id: "camera.front",
    });
  });

  it("signs the selected raw substream through the Frigate proxy", async () => {
    createHlsConnection.mockResolvedValue({ close: vi.fn() });
    const { createFrigateHlsConnection } =
      await import("../src/providers/frigate/live/hls");
    const callWS = vi.fn(async () => ({ path: "/signed/substream.m3u8" }));
    const api = {
      identity: {},
      callWS,
      resolveUrl: (path: string) => path,
      subscribeMessage: vi.fn(),
    } as unknown as HomeAssistantApi;

    await createFrigateHlsConnection(
      api,
      "camera.front",
      new AbortController().signal,
      vi.fn(),
      {} as LiveStartupTiming,
      { initialMuted: true },
      {
        frigate_instance_id: "frigate-main",
        id: "frigate_go2rtc:entry:front_sub",
        stream_name: "front_sub",
        substream: true,
        type: "frigate_go2rtc",
      },
    );

    const resolveStreamUrl = createHlsConnection.mock.calls[0]?.[6] as (
      client: HomeAssistantApi,
      entityId: string,
    ) => Promise<string>;
    await expect(resolveStreamUrl(api, "camera.front")).resolves.toBe(
      "/signed/substream.m3u8",
    );
    expect(callWS).toHaveBeenCalledWith({
      type: "auth/sign_path",
      path: "/api/frigate/frigate-main/go2rtc/api/stream.m3u8?src=front_sub&mp4",
      expires: 3600,
    });
  });
});
