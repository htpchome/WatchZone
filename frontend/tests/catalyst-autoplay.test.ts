import { afterEach, describe, expect, it, vi } from "vitest";

import { recoverCatalystAudibleAutoplay } from "../src/platform/catalyst/autoplay";

describe("Catalyst audible autoplay recovery", () => {
  afterEach(() => vi.restoreAllMocks());

  it("starts the retained element muted before retrying audible playback", async () => {
    const states: boolean[] = [];
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      states.push(this.muted);
      return Promise.resolve();
    });
    const video = document.createElement("video");

    await expect(recoverCatalystAudibleAutoplay(video)).resolves.toBe(true);
    expect(states).toEqual([true, false]);
    expect(video.muted).toBe(false);
  });

  it("returns to playing muted when Catalyst rejects the audible retry", async () => {
    const states: boolean[] = [];
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      states.push(this.muted);
      return states.length === 2
        ? Promise.reject(new DOMException("Blocked", "NotAllowedError"))
        : Promise.resolve();
    });
    const video = document.createElement("video");

    await expect(recoverCatalystAudibleAutoplay(video)).resolves.toBe(false);
    expect(states).toEqual([true, false, true]);
    expect(video.muted).toBe(true);
  });
});
