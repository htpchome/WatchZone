import { afterEach, describe, expect, it } from "vitest";

import "../src/main";
import type { WatchZoneCard } from "../src/card/watchzone-card";

describe("watchzone-card", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders the configured title in a Home Assistant card", async () => {
    const element = document.createElement("watchzone-card") as WatchZoneCard;
    element.setConfig({ type: "custom:watchzone-card", title: "Front Door" });
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector("ha-card")).not.toBeNull();
    expect(element.shadowRoot?.textContent).toContain("Front Door");
  });

  it("does not rerender for unrelated hass assignments", async () => {
    const element = document.createElement("watchzone-card") as WatchZoneCard;
    document.body.append(element);
    await element.updateComplete;
    const rendered = element.shadowRoot?.querySelector("ha-card");

    element.hass = { states: { "light.test": {} } };
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector("ha-card")).toBe(rendered);
  });

  it("limits outer appearance removals to the Home Assistant card shell", async () => {
    const element = document.createElement("watchzone-card") as WatchZoneCard;
    element.setConfig({
      type: "custom:watchzone-card",
      title: "Front Door",
      remove_outer_rounded_edges: true,
      remove_outer_shadow: true,
    });
    document.body.append(element);
    await element.updateComplete;

    const card = element.shadowRoot?.querySelector("ha-card");
    expect(card?.classList.contains("remove-outer-rounded-edges")).toBe(true);
    expect(card?.classList.contains("remove-outer-shadow")).toBe(true);

    element.setConfig({
      type: "custom:watchzone-card",
      title: "Front Door",
    });
    await element.updateComplete;
    expect(card?.className).toBe("");
  });
});
