import { afterEach, describe, expect, it } from "vitest";

import { HomeAssistantLayoutBridge } from "../src/card/home-assistant-layout-bridge";

function sectionsHost(): {
  readonly bridge: HomeAssistantLayoutBridge;
  readonly container: HTMLElement;
  readonly host: HTMLElement;
  readonly sections: HTMLElement;
  readonly wrapper: HTMLElement;
} {
  const sections = document.createElement("hui-sections-view");
  const wrapper = document.createElement("div");
  const container = document.createElement("div");
  const host = document.createElement("watchzone-card");
  container.className = "container";
  wrapper.className = "wrapper";
  container.append(host);
  wrapper.append(container);
  sections.attachShadow({ mode: "open" }).append(wrapper);
  document.body.append(sections);
  return {
    bridge: new HomeAssistantLayoutBridge(host),
    container,
    host,
    sections,
    wrapper,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("Home Assistant layout bridge", () => {
  it("removes and restores the Sections outer padding without changing gaps", () => {
    const { bridge, container, sections, wrapper } = sectionsHost();
    wrapper.style.padding = "0px 32px";
    container.style.padding = "24px 0px";
    container.style.gap = "24px 8px";
    sections.style.setProperty("--ha-view-sections-row-gap", "24px");

    bridge.configure(true);

    expect(wrapper.style.padding).toBe("0px");
    expect(container.style.padding).toBe("0px");
    expect(container.style.gap).toBe("24px 8px");
    expect(sections.style.getPropertyValue("--ha-view-sections-row-gap")).toBe(
      "24px",
    );

    bridge.configure(false);
    expect(wrapper.style.padding).toBe("0px 32px");
    expect(container.style.padding).toBe("24px 0px");
  });

  it("keeps shared padding until the last card releases ownership", () => {
    const first = sectionsHost();
    const secondHost = document.createElement("watchzone-card");
    first.container.append(secondHost);
    const second = new HomeAssistantLayoutBridge(secondHost);
    first.wrapper.style.padding = "0px 32px";
    first.container.style.padding = "20px 0px";

    first.bridge.configure(true);
    second.configure(true);
    first.bridge.release();
    expect(first.wrapper.style.padding).toBe("0px");
    expect(first.container.style.padding).toBe("0px");

    second.release();
    expect(first.wrapper.style.padding).toBe("0px 32px");
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
