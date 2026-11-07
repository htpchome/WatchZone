import { describe, expect, it } from "vitest";

import { resolveFrigateLiveTransportPolicy } from "../src/providers/frigate/live/policy";

describe("Frigate live transport policy", () => {
  it("forces Catalyst onto the HLS-only path", () => {
    expect(
      resolveFrigateLiveTransportPolicy("mse", { isCatalyst: true }),
    ).toEqual({ fallback: "hls", hlsOnly: true });
  });

  it("preserves the configured fallback for other clients", () => {
    expect(
      resolveFrigateLiveTransportPolicy("mse", { isCatalyst: false }),
    ).toEqual({ fallback: "mse", hlsOnly: false });
    expect(
      resolveFrigateLiveTransportPolicy("hls", { isCatalyst: false }),
    ).toEqual({ fallback: "hls", hlsOnly: false });
  });
});
