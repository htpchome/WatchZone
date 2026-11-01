import { afterEach, describe, expect, it } from "vitest";

import "../src/main";
import type { WatchZoneCard } from "../src/card/watchzone-card";

describe("watchzone-card", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders the WatchZone development surface", async () => {
    const element = document.createElement("watchzone-card") as WatchZoneCard;
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.textContent).toContain(
      "WatchZone frontend development environment is ready.",
    );
  });
});
