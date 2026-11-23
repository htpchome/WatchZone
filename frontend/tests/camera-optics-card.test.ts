import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/main";
import { DashboardCard } from "../src/card/camera-optics-card";
import type {
  HomeAssistant,
  HomeAssistantConnectionEvent,
  HomeAssistantConnectionEventListener,
  HomeAssistantMessage,
} from "../src/core/home-assistant";
import {
  createCardPickerStubConfig,
  preferredCameraEntityId,
} from "../src/features/card-picker-preview";

function createHass(
  cameras: Readonly<Record<string, string>>,
  language = "en",
): HomeAssistant {
  const connection = {
    subscribeMessage: vi.fn(async () => () => undefined),
  };
  return {
    states: Object.fromEntries(
      Object.entries(cameras).map(([entityId, friendlyName]) => [
        entityId,
        {
          entity_id: entityId,
          state: "idle",
          attributes: { friendly_name: friendlyName },
        },
      ]),
    ),
    connection,
    locale: { language },
    callService: vi.fn(),
    callWS: vi.fn(),
    hassUrl: (path: string) => path,
  };
}

describe("camera-optics-card", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("keeps the stable Lovelace custom-element contract", () => {
    expect(customElements.get("camera-optics-card")).toBe(DashboardCard);
    expect(customElements.get("wzc-card")).toBeUndefined();
  });

  it("defaults new section cards to full width and automatic height", () => {
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;

    expect(element.getGridOptions()).toEqual({
      columns: "full",
      min_columns: 3,
      rows: "auto",
    });
  });

  it("selects a preferred camera for minimal card-picker configuration", () => {
    const hass = createHass({
      "camera.door_bell": "Side Entry",
      "camera.porch": "Porch",
      "camera.entry": "Front Door",
      "camera.doorbell": "Doorbell",
    });

    expect(preferredCameraEntityId(hass)).toBe("camera.doorbell");
    expect(createCardPickerStubConfig(hass)).toEqual({
      cameras: [{ entity_id: "camera.doorbell" }],
    });
    expect(DashboardCard.getStubConfig(hass)).toEqual({
      cameras: [{ entity_id: "camera.doorbell" }],
    });
  });

  it("matches a mild localized camera name and otherwise keeps the stub empty", () => {
    expect(
      preferredCameraEntityId(
        createHass({ "camera.entree": "Porte d’entrée" }, "fr-FR"),
      ),
    ).toBe("camera.entree");
    expect(
      createCardPickerStubConfig(createHass({ "camera.garden": "Garden" })),
    ).toEqual({});
  });

  it("renders a fixed static picker preview without constructing the Stage", async () => {
    const picker = document.createElement("hui-card-picker");
    const root = picker.attachShadow({ mode: "open" });
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    element.setConfig({ type: "custom:camera-optics-card" });
    root.append(element);
    document.body.append(picker);

    await vi.waitFor(() => {
      expect(
        element.shadowRoot?.querySelector("wzc-card-picker-preview"),
      ).not.toBeNull();
    });
    expect(element.shadowRoot?.querySelector(".shell")).toBeNull();
    expect(element.shadowRoot?.textContent).not.toContain(
      "No modules are configured.",
    );
    expect(element.getCardSize()).toBe(7);
  });

  it("observes the reusable Stage content boundary and disconnects cleanly", async () => {
    const observed: Element[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        public constructor() {}

        public disconnect = disconnect;

        public observe(target: Element): void {
          observed.push(target);
        }
      },
    );
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    document.body.append(element);
    await element.updateComplete;

    const shell = element.shadowRoot?.querySelector(".shell");
    expect(shell).not.toBeNull();
    expect(observed).toContain(shell);
    expect(observed).not.toContain(element);

    element.remove();
    expect(disconnect).toHaveBeenCalled();
  });

  it("uses the configured title as an accessible name without a visual heading", async () => {
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    element.setConfig({
      type: "custom:camera-optics-card",
      title: "Front Door",
    });
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector("ha-card")).not.toBeNull();
    expect(
      element.shadowRoot?.querySelector("wzc-toast-region.card-toast"),
    ).not.toBeNull();
    expect(element.shadowRoot?.querySelector(".title")).toBeNull();
    expect(element.shadowRoot?.querySelector(".shell")).toMatchObject({
      ariaLabel: "Front Door",
      role: "region",
    });
    expect(element.shadowRoot?.textContent).not.toContain("Front Door");
  });

  it("shows a success toast when Frigate returns online", async () => {
    let availability:
      ((message: { readonly online: boolean }) => void) | undefined;
    const hass = createHass({ "camera.front": "Front Door" });
    vi.mocked(hass.connection.subscribeMessage).mockImplementation(
      async (callback, message) => {
        if (message.type === "camera_optics/live/availability/subscribe") {
          availability = callback as typeof availability;
        }
        return () => undefined;
      },
    );
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    element.setConfig({
      type: "custom:camera-optics-card",
      cameras: [{ entity_id: "camera.front", connection: "frigate_go2rtc" }],
    });
    element.hass = hass;
    document.body.append(element);
    await vi.waitFor(() => expect(availability).toBeTypeOf("function"));
    const region = element.shadowRoot?.querySelector<
      HTMLElement & {
        notices: readonly { message: string; severity: string }[];
      }
    >("wzc-toast-region.card-toast");
    availability?.({ online: true });
    expect(region?.notices).toEqual([]);

    availability?.({ online: false });
    availability?.({ online: true });

    await vi.waitFor(() =>
      expect(region?.notices).toContainEqual(
        expect.objectContaining({
          message: "Frigate is online.",
          severity: "success",
        }),
      ),
    );
  });

  it("keeps camera code and presentation absent from an empty layout", async () => {
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    element.setConfig({ type: "custom:camera-optics-card", title: "Events" });
    document.body.append(element);
    await element.updateComplete;

    expect(customElements.get("wzc-camera")).toBeUndefined();
    expect(element.shadowRoot?.querySelector("wzc-camera")).toBeNull();
    expect(element.shadowRoot?.textContent).toContain(
      "No modules are configured.",
    );
  });

  it("adds no backend status request to a healthy empty card", async () => {
    const hass: HomeAssistant = {
      ...createHass({}),
      config: { components: ["camera_optics"] },
    };
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    element.setConfig({
      stage_type: "camera_only",
      type: "custom:camera-optics-card",
    });
    element.hass = hass;
    document.body.append(element);
    await element.updateComplete;

    expect(hass.callWS).not.toHaveBeenCalled();
  });

  it("does not infer missing setup from a transient components list", async () => {
    const hass: HomeAssistant = {
      ...createHass({ "camera.front": "Front Door" }),
      config: { components: ["frontend", "lovelace"] },
    };
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    element.setConfig({
      camera_entity: "camera.front",
      stage_type: "camera_only",
      type: "custom:camera-optics-card",
    });
    element.hass = hass;
    document.body.append(element);

    await vi.waitFor(
      () =>
        expect(element.shadowRoot?.querySelector("wzc-camera")).not.toBeNull(),
      { timeout: 5_000 },
    );
    expect(element.shadowRoot?.querySelector(".backend-recovery")).toBeNull();
    expect(
      element.shadowRoot?.querySelector("wzc-toast-region.card-toast"),
    ).not.toBeNull();
  });

  it("keeps the Stage active with recovery guidance after a backend failure", async () => {
    const base = createHass({ "camera.front": "Front Door" });
    const callWS = vi.fn(
      async (message: { readonly type: string }): Promise<unknown> => {
        if (message.type === "camera_optics/bootstrap/status") {
          return {
            backend_version: "0.0.5-dev.16",
            saved_settings_version: 4,
            state: "incompatible_settings",
            supported_settings_version: 2,
          };
        }
        throw { code: "unknown_command", message: "Unknown command" };
      },
    );
    const hass: HomeAssistant = {
      ...base,
      config: { components: ["camera_optics"] },
      callWS: <T>(message: HomeAssistantMessage) =>
        callWS(message) as Promise<T>,
    };
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    element.setConfig({
      camera_entity: "camera.front",
      type: "custom:camera-optics-card",
    });
    element.hass = hass;
    document.body.append(element);

    await vi.waitFor(
      () => {
        expect(element.shadowRoot?.textContent).toContain(
          "The installed version of CameraOptics cannot read settings saved by a different version.",
        );
      },
      { timeout: 10_000 },
    );
    const primaryText =
      element.shadowRoot?.querySelector(".backend-recovery-content")
        ?.textContent ?? "";
    expect(primaryText.toLocaleLowerCase()).not.toContain("schema");
    expect(primaryText).toContain("update or redownload CameraOptics in HACS");
    expect(primaryText).toContain("Do not remove CameraOptics");
    expect(element.shadowRoot?.querySelector("wzc-camera")).not.toBeNull();
    expect(
      callWS.mock.calls.filter(
        ([message]) => message.type === "camera_optics/bootstrap/status",
      ),
    ).toHaveLength(1);
  }, 15_000);

  it("preserves a configured camera module by its stable layout node ID", async () => {
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    element.setConfig({
      type: "custom:camera-optics-card",
      title: "Front",
      camera_entity: "camera.front",
    });
    document.body.append(element);
    const camera = await vi.waitFor(
      () => {
        const current = element.shadowRoot?.querySelector("wzc-camera");
        expect(current).not.toBeNull();
        return current;
      },
      { timeout: 10_000 },
    );

    element.setConfig({
      type: "custom:camera-optics-card",
      title: "Updated",
      camera_entity: "camera.front",
      camera_shadows: false,
    });
    await element.updateComplete;

    expect(element.shadowRoot?.querySelector("wzc-camera")).toBe(camera);
  }, 15_000);

  it("does not rerender for unrelated hass assignments", async () => {
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
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
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    element.setConfig({
      type: "custom:camera-optics-card",
      camera_entity: "camera.front",
    });
    element.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "recording",
          attributes: {
            entity_picture: "/api/camera_proxy/camera.front?token=old",
            friendly_name: "Front Door",
          },
        },
      },
      connection,
      callWS: vi.fn(),
      hassUrl: (path: string) => path,
    };
    document.body.append(element);

    const camera = await vi.waitFor(
      () => {
        const current = element.shadowRoot?.querySelector<
          HTMLElement & {
            api?: unknown;
            cameras: readonly { label: string; posterUrl?: string }[];
          }
        >("wzc-camera");
        expect(current?.cameras[0]?.posterUrl).toContain("token=old");
        return current;
      },
      { timeout: 10_000 },
    );
    if (!camera) throw new Error("Camera module did not render");
    const initialApi = camera.api;
    expect(initialApi).toBeDefined();
    Object.defineProperty(connection, "connected", { value: false });
    for (const listener of listeners.get("disconnected") ?? []) {
      listener(connection);
    }

    await vi.waitFor(() =>
      expect(camera?.cameras[0]?.posterUrl).toBeUndefined(),
    );
    await vi.waitFor(() => expect(camera.api).toBeUndefined());
    expect(camera?.cameras[0]?.label).toBe("Front Door");

    Object.defineProperty(connection, "connected", { value: true });
    for (const listener of listeners.get("ready") ?? []) listener(connection);
    expect(camera.api).toBeUndefined();
    element.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "recording",
          attributes: {
            entity_picture: "/api/camera_proxy/camera.front?token=old",
            friendly_name: "Front Door",
          },
        },
      },
      connection,
      callWS: vi.fn(),
      hassUrl: (path: string) => path,
    };
    await vi.waitFor(() => expect(camera.api).toBeDefined());
    expect(camera.api).not.toBe(initialApi);
    await vi.waitFor(() =>
      expect(camera?.cameras[0]?.posterUrl).toBeUndefined(),
    );

    element.hass = {
      states: {
        "camera.front": {
          entity_id: "camera.front",
          state: "recording",
          attributes: {
            entity_picture: "/api/camera_proxy/camera.front?token=new",
            friendly_name: "Front Door",
          },
        },
      },
      connection,
      callWS: vi.fn(),
      hassUrl: (path: string) => path,
    };
    await vi.waitFor(() =>
      expect(camera?.cameras[0]?.posterUrl).toContain("token=new"),
    );
  }, 20_000);

  it("humanizes camera labels before Home Assistant entity state is available", async () => {
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    element.setConfig({
      type: "custom:camera-optics-card",
      cameras: [
        { entity_id: "camera.hall" },
        { entity_id: "camera.front_door" },
      ],
    });
    document.body.append(element);

    const camera = await vi.waitFor(
      () => {
        const current = element.shadowRoot?.querySelector<
          HTMLElement & { cameras: readonly { label: string }[] }
        >("wzc-camera");
        expect(current?.cameras).toHaveLength(2);
        return current;
      },
      { timeout: 10_000 },
    );

    expect(camera?.cameras.map(({ label }) => label)).toEqual([
      "Hall",
      "Front Door",
    ]);
  }, 15_000);

  it("propagates outer appearance settings through the HA card boundary", async () => {
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    element.setConfig({
      type: "custom:camera-optics-card",
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
      type: "custom:camera-optics-card",
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

    element.remove();
    expect(element.hasAttribute("data-wzc-square-outer-corners")).toBe(false);
    expect(element.hasAttribute("data-wzc-no-outer-shadow")).toBe(false);
    expect(element.style.getPropertyValue("--ha-card-border-radius")).toBe("");
    expect(element.style.getPropertyValue("--ha-card-box-shadow")).toBe("");
    expect(element.style.getPropertyValue("border-radius")).toBe("");
    expect(element.style.getPropertyValue("box-shadow")).toBe("");
  });

  it("applies the standard Full Stage height mode and leaves camera-only stages natural", async () => {
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    element.setConfig({
      card_height_mode: "fit_viewport",
      type: "custom:camera-optics-card",
    });
    document.body.append(element);
    await element.updateComplete;

    expect(element.classList.contains("height-mode-fit-viewport")).toBe(true);
    element.setConfig({
      card_height_mode: "fill_container",
      type: "custom:camera-optics-card",
    });
    await element.updateComplete;
    expect(element.classList.contains("height-mode-fill-container")).toBe(true);

    element.setConfig({
      card_height_mode: "fill_container",
      stage_type: "camera_only",
      type: "custom:camera-optics-card",
    });
    await element.updateComplete;
    expect(element.classList.contains("height-mode-auto")).toBe(true);
  });

  it("keeps Sections padding for non-phone clients", async () => {
    const sections = document.createElement("hui-sections-view");
    const wrapper = document.createElement("div");
    const container = document.createElement("div");
    container.className = "container";
    container.style.padding = "24px 0px";
    const element = document.createElement(
      "camera-optics-card",
    ) as DashboardCard;
    element.setConfig({
      edge_to_edge_phone: true,
      type: "custom:camera-optics-card",
    });
    container.append(element);
    wrapper.append(container);
    sections.attachShadow({ mode: "open" }).append(wrapper);
    document.body.append(sections);
    await element.updateComplete;

    expect(container.style.padding).toBe("24px 0px");

    element.setConfig({ type: "custom:camera-optics-card" });
    await element.updateComplete;

    expect(container.style.padding).toBe("24px 0px");
  });
});
