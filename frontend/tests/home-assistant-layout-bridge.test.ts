import { afterEach, describe, expect, it } from "vitest";

import {
  edgeToEdgeEnabled,
  HomeAssistantLayoutBridge,
} from "../src/card/home-assistant-layout-bridge";

function sectionsHost(): {
  readonly bridge: HomeAssistantLayoutBridge;
  readonly container: HTMLElement;
  readonly host: HTMLElement;
  readonly sections: HTMLElement;
} {
  const sections = document.createElement("hui-sections-view");
  const wrapper = document.createElement("div");
  const container = document.createElement("div");
  const host = document.createElement("watchzone-card");
  container.className = "container";
  container.append(host);
  wrapper.append(container);
  sections.attachShadow({ mode: "open" }).append(wrapper);
  document.body.append(sections);
  return {
    bridge: new HomeAssistantLayoutBridge(host),
    container,
    host,
    sections,
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

  it("removes and restores only the Sections container outer padding", () => {
    const { bridge, container, sections } = sectionsHost();
    container.style.padding = "24px 0px";
    container.style.gap = "24px 8px";
    sections.style.setProperty("--ha-view-sections-row-gap", "24px");

    bridge.configure(true);

    expect(container.style.padding).toBe("0px");
    expect(container.style.gap).toBe("24px 8px");
    expect(sections.style.getPropertyValue("--ha-view-sections-row-gap")).toBe(
      "24px",
    );

    bridge.configure(false);
    expect(container.style.padding).toBe("24px 0px");
  });

  it("keeps shared padding until the last card releases ownership", () => {
    const first = sectionsHost();
    const secondHost = document.createElement("watchzone-card");
    first.container.append(secondHost);
    const second = new HomeAssistantLayoutBridge(secondHost);
    first.container.style.padding = "20px 0px";

    first.bridge.configure(true);
    second.configure(true);
    first.bridge.release();
    expect(first.container.style.padding).toBe("0px");

    second.release();
    expect(first.container.style.padding).toBe("20px 0px");
  });

  it("does nothing outside Sections and preserves later external changes", () => {
    const container = document.createElement("div");
    const host = document.createElement("watchzone-card");
    container.style.padding = "10px";
    container.append(host);
    document.body.append(container);
    const bridge = new HomeAssistantLayoutBridge(host);

    bridge.configure(true);
    expect(container.style.padding).toBe("10px");

    const sectionsContext = sectionsHost();
    sectionsContext.container.style.padding = "6px";
    sectionsContext.bridge.configure(true);
    sectionsContext.container.style.padding = "4px";
    sectionsContext.bridge.release();
    expect(sectionsContext.container.style.padding).toBe("4px");
  });

  it("does nothing when the Sections implementation has no open container", () => {
    const sections = document.createElement("hui-sections-view");
    const host = document.createElement("watchzone-card");
    sections.append(host);
    document.body.append(sections);

    new HomeAssistantLayoutBridge(host).configure(true);

    expect(sections.style.padding).toBe("");
  });
});
