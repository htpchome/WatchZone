import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/main";
import { DashboardCard } from "../src/card/watchzone-card";
import type {
  HomeAssistantConnectionEvent,
  HomeAssistantConnectionEventListener,
} from "../src/core/home-assistant";

describe("watchzone-card", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("keeps the stable Lovelace custom-element contract", () => {
    expect(customElements.get("watchzone-card")).toBe(DashboardCard);
    expect(customElements.get("wzc-card")).toBeUndefined();
  });

  it("defaults new section cards to full width and automatic height", () => {
    const element = document.createElement("watchzone-card") as DashboardCard;

    expect(element.getGridOptions()).toEqual({
      columns: "full",
      min_columns: 3,
      rows: "auto",
    });
  });

  it("uses the configured title as an accessible name without a visual heading", async () => {
    const element = document.createElement("watchzone-card") as DashboardCard;
    element.setConfig({ type: "custom:watchzone-card", title: "Front Door" });
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector("ha-card")).not.toBeNull();
    expect(element.shadowRoot?.querySelector(".title")).toBeNull();
    expect(element.shadowRoot?.querySelector(".shell")).toMatchObject({
      ariaLabel: "Front Door",
      role: "region",
    });
    expect(element.shadowRoot?.textContent).not.toContain("Front Door");
  });

  it("keeps camera code and presentation absent from an empty layout", async () => {
    const element = document.createElement("watchzone-card") as DashboardCard;
    element.setConfig({ type: "custom:watchzone-card", title: "Events" });
    document.body.append(element);
    await element.updateComplete;

    expect(customElements.get("wzc-camera")).toBeUndefined();
    expect(element.shadowRoot?.querySelector("wzc-camera")).toBeNull();
    expect(element.shadowRoot?.textContent).toContain(
      "No modules are configured.",
    );
  });

  it("preserves a configured camera module by its stable layout node ID", async () => {
    const element = document.createElement("watchzone-card") as DashboardCard;
    element.setConfig({
      type: "custom:watchzone-card",
      title: "Front",
      camera_entity: "camera.front",
    });
    document.body.append(element);
    const camera = await vi.waitFor(() => {
      const current = element.shadowRoot?.querySelector("wzc-camera");
      expect(current).not.toBeNull();
      return current;
    });

    element.setConfig({
      type: "custom:watchzone-card",
      title: "Updated",
      camera_entity: "camera.front",
      camera_shadows: false,
    });
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector("wzc-camera")).toBe(camera);
  });

  it("does not rerender for unrelated hass assignments", async () => {
    const element = document.createElement("watchzone-card") as DashboardCard;
    document.body.append(element);
    await element.updateComplete;
    const rendered = element.shadowRoot?.querySelector("ha-card");

    element.hass = { states: { "light.test": {} } };
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector("ha-card")).toBe(rendered);
  });

  it("removes stale camera proxy tokens across a Home Assistant restart", async () => {
    const listeners = new Map<
      HomeAssistantConnectionEvent,
      Set<HomeAssistantConnectionEventListener>
    >();
    const connection = {
      connected: true,
      addEventListener: (
        event: HomeAssistantConnectionEvent,
        listener: HomeAssistantConnectionEventListener,
      ) => {
        const current = listeners.get(event) ?? new Set();
        current.add(listener);
        listeners.set(event, current);
      },
      removeEventListener: (
        event: HomeAssistantConnectionEvent,
        listener: HomeAssistantConnectionEventListener,
      ) => listeners.get(event)?.delete(listener),
      subscribeMessage: vi.fn(async () => () => undefined),
    };
    const element = document.createElement("watchzone-card") as DashboardCard;
    element.setConfig({
      type: "custom:watchzone-card",
      camera_entity: "camera.front",
    });
    element.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "recording",
          attributes: {
            entity_picture: "/api/camera_proxy/camera.front?token=old",
          },
        },
      },
      connection,
      callWS: vi.fn(),
      hassUrl: (path: string) => path,
    };
    document.body.append(element);

    const camera = await vi.waitFor(() => {
      const current = element.shadowRoot?.querySelector<
        HTMLElement & { cameras: readonly { posterUrl?: string }[] }
      >("wzc-camera");
      expect(current?.cameras[0]?.posterUrl).toContain("token=old");
      return current;
    });
    Object.defineProperty(connection, "connected", { value: false });
    for (const listener of listeners.get("disconnected") ?? []) {
      listener(connection);
    }

    await vi.waitFor(() =>
      expect(camera?.cameras[0]?.posterUrl).toBeUndefined(),
    );
  });

  it("propagates outer appearance settings through the HA card boundary", async () => {
    const element = document.createElement("watchzone-card") as DashboardCard;
    element.setConfig({
      type: "custom:watchzone-card",
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
      type: "custom:watchzone-card",
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
