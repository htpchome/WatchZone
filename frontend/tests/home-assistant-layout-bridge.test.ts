import { afterEach, describe, expect, it } from "vitest";

import {
  edgeToEdgeEnabled,
  HomeAssistantLayoutBridge,
} from "../src/card/home-assistant-layout-bridge";

function sectionsHost(): {
  readonly bridge: HomeAssistantLayoutBridge;
  readonly host: HTMLElement;
  readonly sections: HTMLElement;
  readonly wrapper: HTMLElement;
} {
  const sections = document.createElement("hui-sections-view");
  const wrapper = document.createElement("div");
  const host = document.createElement("watchzone-card");
  wrapper.append(host);
  sections.append(wrapper);
  document.body.append(sections);
  return {
    bridge: new HomeAssistantLayoutBridge(host),
    host,
    sections,
    wrapper,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("Home Assistant layout bridge", () => {
  it("selects the explicit phone or non-phone preference", () => {
    expect(edgeToEdgeEnabled(true, false, true)).toBe(true);
    expect(edgeToEdgeEnabled(true, false, false)).toBe(false);
    expect(edgeToEdgeEnabled(false, true, true)).toBe(false);
    expect(edgeToEdgeEnabled(false, true, false)).toBe(true);
  });

  it("removes and restores only the immediate Sections wrapper spacing", () => {
    const { bridge, sections, wrapper } = sectionsHost();
    wrapper.style.margin = "8px";
    wrapper.style.padding = "12px";
    sections.style.setProperty("--ha-view-sections-row-gap", "8px");

    bridge.configure(true);

    expect(wrapper.style.margin).toBe("0px");
    expect(wrapper.style.padding).toBe("0px");
    expect(sections.style.getPropertyValue("--ha-view-sections-row-gap")).toBe(
      "8px",
    );

    bridge.configure(false);
    expect(wrapper.style.margin).toBe("8px");
    expect(wrapper.style.padding).toBe("12px");
  });

  it("does nothing outside Sections and preserves later external changes", () => {
    const wrapper = document.createElement("div");
    const host = document.createElement("watchzone-card");
    wrapper.style.padding = "10px";
    wrapper.append(host);
    document.body.append(wrapper);
    const bridge = new HomeAssistantLayoutBridge(host);

    bridge.configure(true);
    expect(wrapper.style.padding).toBe("10px");

    const sectionsContext = sectionsHost();
    sectionsContext.wrapper.style.padding = "6px";
    sectionsContext.bridge.configure(true);
    sectionsContext.wrapper.style.padding = "4px";
    sectionsContext.bridge.release();
    expect(sectionsContext.wrapper.style.padding).toBe("4px");
  });

  it("does not mutate a Sections view used directly as the parent", () => {
    const sections = document.createElement("hui-sections-view");
    const host = document.createElement("watchzone-card");
    sections.style.padding = "16px";
    sections.append(host);
    document.body.append(sections);

    new HomeAssistantLayoutBridge(host).configure(true);

    expect(sections.style.padding).toBe("16px");
  });
});
