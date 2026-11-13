import { describe, expect, it, vi } from "vitest";

import type { FrigateGo2RtcLiveSourceDescriptor } from "../src/api/live-source";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import { LiveSourceResolver } from "../src/providers/live-source-resolver";

describe("live source identity", () => {
  it("keeps same-named streams on multiple Frigate instances independent", () => {
    const resolver = new LiveSourceResolver();
    const home: FrigateGo2RtcLiveSourceDescriptor = {
      id: "frigate_go2rtc:entry-home:front",
      type: "frigate_go2rtc",
      frigate_instance_id: "frigate",
      stream_name: "front",
    };
    const workshop: FrigateGo2RtcLiveSourceDescriptor = {
      id: "frigate_go2rtc:entry-workshop:front",
      type: "frigate_go2rtc",
      frigate_instance_id: "myWorkshop",
      stream_name: "front",
    };

    expect(resolver.frigateWebRtcKey(home)).not.toBe(
      resolver.frigateWebRtcKey(workshop),
    );
    expect(resolver.frigateMseKey(home)).not.toBe(
      resolver.frigateMseKey(workshop),
    );
    expect(resolver.frigateHlsKey(home)).not.toBe(
      resolver.frigateHlsKey(workshop),
    );
    expect(resolver.frigateHlsKey(home)).not.toBe(resolver.frigateMseKey(home));
    expect(resolver.frigateHlsKey(home, true)).not.toBe(
      resolver.frigateHlsKey(home, false),
    );
    expect(resolver.homeAssistantWebRtcKey("camera.front")).not.toBe(
      resolver.frigateWebRtcKey(home),
    );
  });

  it("reuses a resolved descriptor across card replacement in one HA document", async () => {
    const identity = {} as HomeAssistantApi["identity"];
    const callWS = vi.fn(async () => ({
      id: "frigate_go2rtc:entry-home:front",
      type: "frigate_go2rtc",
      frigate_instance_id: "frigate",
      stream_name: "front",
    }));
    const api: HomeAssistantApi = {
      identity,
      callWS: callWS as HomeAssistantApi["callWS"],
      resolveUrl: (path) => path,
      subscribeMessage: vi.fn(),
    };
    const first = new LiveSourceResolver();
    const source = await first.resolveFrigate(api, "camera.front");
    const replacement = new LiveSourceResolver();

    expect(replacement.cachedFrigate(api, "camera.front")).toBe(source);
    await expect(replacement.resolveFrigate(api, "camera.front")).resolves.toBe(
      source,
    );
    expect(callWS).toHaveBeenCalledOnce();
  });
});
