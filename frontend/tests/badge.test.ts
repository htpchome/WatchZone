import { afterEach, describe, expect, it } from "vitest";

import { BADGE_TAG } from "../src/core/constants";
import {
  badgeColorForLabel,
  normalizeBadgeLabel,
  OBJECT_BADGE_COLORS,
} from "../src/ui/badge-colors";
import type { Badge } from "../src/ui/badge";
import "../src/ui/badge";

describe("badge system", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders a configurable pill badge through the centralized tag", async () => {
    const badge = document.createElement(BADGE_TAG) as Badge;
    badge.shape = "pill";
    badge.size = "medium";
    badge.variant = "warning";
    badge.textContent = "Person";
    document.body.append(badge);
    await badge.updateComplete;

    expect(badge.tagName.toLowerCase()).toBe(BADGE_TAG);
    expect(badge.getAttribute("shape")).toBe("pill");
    expect(badge.getAttribute("size")).toBe("medium");
    expect(badge.getAttribute("variant")).toBe("warning");
    expect(badge.shadowRoot?.querySelector(".badge slot")).not.toBeNull();
    expect(badge.textContent).toBe("Person");
  });

  it("keeps known and unknown object colors deterministic", () => {
    expect(OBJECT_BADGE_COLORS.person).toBe("blue");
    expect(badgeColorForLabel("Person-Verified")).toBe("indigo");
    expect(badgeColorForLabel("CAT")).toBe("pink");
    expect(normalizeBadgeLabel(" Front Door ")).toBe("front_door");
    expect(badgeColorForLabel("front door")).toBe(
      badgeColorForLabel("Front-Door"),
    );
  });
});
