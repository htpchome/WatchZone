import { describe, expect, it } from "vitest";

import {
  beginLiveStartupTiming,
  getLiveStartupTimings,
} from "../src/core/live-startup-timing";

describe("live startup diagnostics", () => {
  it("records typed failures and bounded reconnect metadata", () => {
    const timing = beginLiveStartupTiming("diagnostic-camera");
    timing.setFailure("track_ended");
    timing.setReconnect(2, 60_250);

    expect(timing.snapshot()).toMatchObject({
      failureCode: "track_ended",
      reconnectAttempt: 2,
      reconnectDelayMs: 60_250,
    });
  });

  it("bounds retained timing records while keeping the newest startups", () => {
    for (let index = 0; index < 25; index += 1) {
      beginLiveStartupTiming(`bounded-camera-${index}`);
    }

    const snapshots = getLiveStartupTimings();
    expect(snapshots).toHaveLength(20);
    expect(snapshots.some(({ key }) => key === "bounded-camera-0")).toBe(false);
    expect(snapshots.at(-1)?.key).toBe("bounded-camera-24");
  });

  it("keeps repeated attempts for one transport key", () => {
    const key = "repeated-camera";
    const failed = beginLiveStartupTiming(key);
    failed.setFailure("connection_timeout");
    const replacement = beginLiveStartupTiming(key);
    replacement.mark("adapter_import_started");

    const attempts = getLiveStartupTimings().filter(
      (snapshot) => snapshot.key === key,
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[0].failureCode).toBe("connection_timeout");
    expect(attempts[1].phases.adapter_import_started).toEqual(
      expect.any(Number),
    );
  });
});
