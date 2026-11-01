import { describe, expect, it } from "vitest";

import { HomeAssistantClientRuntime } from "../src/core/client-runtime";

describe("HomeAssistantClientRuntime", () => {
  it("identifies the Home Assistant macOS Catalyst host", () => {
    expect(
      new HomeAssistantClientRuntime({
        platform: "MacIntel",
        userAgent:
          "Mozilla/5.0 (Macintosh) Mobile/15E148 Home Assistant/2026.11",
      }).catalyst,
    ).toBe(true);
    expect(
      new HomeAssistantClientRuntime({
        platform: "macOS",
        userAgent: "Mobile/HomeAssistant",
      }).catalyst,
    ).toBe(true);
  });

  it("does not confuse ordinary Safari with the Catalyst host", () => {
    expect(
      new HomeAssistantClientRuntime({
        platform: "MacIntel",
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18 Safari/605.1.15",
      }).catalyst,
    ).toBe(false);
  });
});
