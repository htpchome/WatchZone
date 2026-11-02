import { afterEach, describe, expect, it } from "vitest";

import "../src/main";
import type { DashboardCard } from "../src/card/card";
import { CARD_TAG, CARD_TYPE } from "../src/core/constants";

describe(CARD_TAG, () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("renders the configured title in a Home Assistant card", async () => {
    const element = document.createElement(CARD_TAG) as DashboardCard;
    element.setConfig({ type: CARD_TYPE, title: "Front Door" });
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector("ha-card")).not.toBeNull();
    expect(element.shadowRoot?.textContent).toContain("Front Door");
  });

  it("does not rerender for unrelated hass assignments", async () => {
    const element = document.createElement(CARD_TAG) as DashboardCard;
    document.body.append(element);
    await element.updateComplete;
    const rendered = element.shadowRoot?.querySelector("ha-card");

    element.hass = { states: { "light.test": {} } };
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector("ha-card")).toBe(rendered);
  });

  it("propagates outer appearance settings through the HA card boundary", async () => {
    const element = document.createElement(CARD_TAG) as DashboardCard;
    element.setConfig({
      type: CARD_TYPE,
      title: "Front Door",
      rounded_outer_corners: false,
      outer_shadows: false,
      outer_padding: false,
    });
    document.body.append(element);
    await element.updateComplete;

    const card = element.shadowRoot?.querySelector("ha-card");
    expect(card?.classList.contains("square-outer-corners")).toBe(true);
    expect(card?.classList.contains("no-outer-shadow")).toBe(true);
    expect(card?.classList.contains("no-outer-padding")).toBe(true);
    expect(element.hasAttribute("data-wzc-square-outer-corners")).toBe(true);
    expect(element.hasAttribute("data-wzc-no-outer-shadow")).toBe(true);
    expect(element.style.getPropertyValue("--ha-card-border-radius")).toBe(
      "0px",
    );
    expect(element.style.getPropertyValue("--wzc-live-radius")).toBe("");
    expect(element.style.getPropertyValue("--ha-card-box-shadow")).toBe("none");
    expect(element.style.getPropertyPriority("box-shadow")).toBe("important");

    element.setConfig({
      type: CARD_TYPE,
      title: "Front Door",
    });
    await element.updateComplete;
    expect(card?.className).toBe("");
    expect(element.hasAttribute("data-wzc-square-outer-corners")).toBe(false);
    expect(element.hasAttribute("data-wzc-no-outer-shadow")).toBe(false);
    expect(element.style.getPropertyValue("--wzc-live-radius")).toBe("");
    expect(element.style.getPropertyValue("--ha-card-box-shadow")).toBe(
      "var(--wzc-shadow-medium)",
    );
    expect(element.style.getPropertyValue("box-shadow")).toBe(
      "var(--wzc-shadow-medium)",
    );
  });
});
