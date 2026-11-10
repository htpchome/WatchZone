import { describe, expect, it, vi } from "vitest";

import {
  parseDeepLink,
  removeDeepLinkParameters,
  resolveDeepLinkCamera,
} from "../src/features/deep-links/controller";
import type { DeepLinkCamera } from "../src/features/deep-links/controller";

const camera = (entityId: string, title = ""): DeepLinkCamera => ({
  entityId,
  title,
});

describe("notification deep links", () => {
  it("parses clip, snapshot, and camera-only targets", () => {
    expect(
      parseDeepLink({
        hash: "",
        search: "?camera=bird_feeder&event=event-1&review=review-1",
      }),
    ).toEqual({
      camera: "bird_feeder",
      eventId: "event-1",
      media: "video",
      reviewId: "review-1",
    });
    expect(
      parseDeepLink({
        hash: "#/view?camera=front&review=review-2&media=snapshot",
        search: "",
      }),
    ).toEqual({
      camera: "front",
      eventId: undefined,
      media: "snapshot",
      reviewId: "review-2",
    });
    expect(parseDeepLink({ hash: "", search: "?camera=hall" })).toEqual({
      camera: "hall",
      eventId: undefined,
      media: "video",
      reviewId: undefined,
    });
  });

  it("matches notification camera names without guessing ambiguously", () => {
    const cameras = [
      camera("camera.birdfeeder"),
      camera("camera.front_door", "Porch"),
    ];
    expect(resolveDeepLinkCamera("bird_feeder", cameras)).toBe(
      "camera.birdfeeder",
    );
    expect(resolveDeepLinkCamera("camera.front_door", cameras)).toBe(
      "camera.front_door",
    );
    expect(resolveDeepLinkCamera("Porch", cameras)).toBe("camera.front_door");
    expect(
      resolveDeepLinkCamera("frontdoor", [
        camera("camera.front_door"),
        camera("camera.front-door"),
      ]),
    ).toBeUndefined();
  });

  it("removes only WatchZone parameters from normal and hash queries", () => {
    const replaceState = vi.fn();
    removeDeepLinkParameters(
      {
        hash: "#/view?review=review-1&panel=reviews",
        pathname: "/dashboard/security",
        search: "?camera=front&event=event-1&edit=1",
      },
      { replaceState, state: { navigation: true } },
    );
    expect(replaceState).toHaveBeenCalledWith(
      { navigation: true },
      "",
      "/dashboard/security?edit=1#/view?panel=reviews",
    );
  });
});
