import { describe, expect, it } from "vitest";

import type { FrigateGo2RtcLiveSourceDescriptor } from "../src/api/live-source";
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
    expect(resolver.homeAssistantWebRtcKey("camera.front")).not.toBe(
      resolver.frigateWebRtcKey(home),
    );
  });
});
