import type { HomeAssistant } from "./home-assistant";
import type { HomeAssistantActionConfig } from "./config";

export async function performHomeAssistantAction(
  host: HTMLElement,
  hass: HomeAssistant | undefined,
  config: HomeAssistantActionConfig,
  entityId: string,
): Promise<void> {
  switch (config.action) {
    case "none":
      return;
    case "more-info":
      host.dispatchEvent(
        new CustomEvent("hass-more-info", {
          bubbles: true,
          composed: true,
          detail: { entityId },
        }),
      );
      return;
    case "toggle":
      await hass?.callService("homeassistant", "toggle", undefined, {
        entity_id: entityId,
      });
      return;
    case "navigate": {
      const path = textValue(config.navigation_path);
      if (!path) return;
      history.pushState(null, "", path);
      window.dispatchEvent(new Event("location-changed"));
      return;
    }
    case "url": {
      const url = textValue(config.url_path);
      if (url) window.open(url, textValue(config.target) ?? "_blank");
      return;
    }
    case "perform-action": {
      const service =
        textValue(config.perform_action) ?? textValue(config.service);
      if (!hass || !service) return;
      const separator = service.indexOf(".");
      if (separator < 1) return;
      await hass.callService(
        service.slice(0, separator),
        service.slice(separator + 1),
        objectValue(config.data),
        objectValue(config.target),
      );
      return;
    }
    case "assist":
      host.dispatchEvent(
        new CustomEvent("hass-start-voice-assistant", {
          bubbles: true,
          composed: true,
          detail: { pipeline_id: config.pipeline_id, start_listening: true },
        }),
      );
  }
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
