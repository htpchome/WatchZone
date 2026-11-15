import { isHomeAssistant, type HomeAssistant } from "../core/home-assistant";

const PICKER_ANCESTOR_TAGS = new Set([
  "HUI-CARD-PICKER",
  "HUI-DIALOG-CREATE-CARD",
  "HUI-CARD-OPTIONS",
]);

const CAMERA_CANDIDATES = [
  "doorbell",
  "door bell",
  "front door",
  "frontdoor",
  "front-door",
  "front_door",
  "driveway",
  "porch",
  "camera1",
] as const;

const LOCALIZED_CAMERA_CANDIDATES: Readonly<Record<string, readonly string[]>> =
  {
    ca: ["timbre", "porta principal", "entrada", "porxo", "càmera 1"],
    de: ["türklingel", "haustür", "einfahrt", "veranda", "kamera 1"],
    el: ["κουδούνι", "μπροστινή πόρτα", "είσοδος", "βεράντα", "κάμερα 1"],
    es: ["timbre", "puerta principal", "entrada", "porche", "cámara 1"],
    fr: ["sonnette", "porte d'entrée", "allée", "porche", "caméra 1"],
    it: ["campanello", "porta d'ingresso", "vialetto", "portico", "camera 1"],
    pl: ["dzwonek", "drzwi wejściowe", "podjazd", "ganek", "kamera 1"],
    pt: ["campainha", "porta da frente", "entrada", "varanda", "câmera 1"],
  };

export interface CardPickerStubConfig {
  readonly cameras?: readonly { readonly entity_id: string }[];
}

/** Home Assistant does not expose a formal picker-preview flag to custom cards. */
export function isHomeAssistantCardPickerPreview(host: HTMLElement): boolean {
  let node: Node | null = host;
  for (let depth = 0; node && depth < 16; depth += 1) {
    if (node instanceof HTMLElement && PICKER_ANCESTOR_TAGS.has(node.tagName)) {
      return true;
    }
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? root.host : node.parentNode;
  }
  return false;
}

export function createCardPickerStubConfig(
  value: unknown,
): CardPickerStubConfig {
  if (!isHomeAssistant(value)) return {};
  const entityId = preferredCameraEntityId(value);
  return entityId ? { cameras: [{ entity_id: entityId }] } : {};
}

export function preferredCameraEntityId(
  hass: HomeAssistant,
): string | undefined {
  const language = (hass.locale?.language ?? hass.language ?? "en")
    .replaceAll("_", "-")
    .split("-")[0]
    ?.toLowerCase();
  const localized = language
    ? (LOCALIZED_CAMERA_CANDIDATES[language] ?? [])
    : [];
  const cameras = Object.values(hass.states).filter(({ entity_id }) =>
    entity_id.startsWith("camera."),
  );

  for (const candidate of [...CAMERA_CANDIDATES, ...localized]) {
    const expected = comparableCameraName(candidate);
    const match = cameras.find((entity) => {
      const objectId = entity.entity_id.slice("camera.".length);
      return (
        comparableCameraName(objectId) === expected ||
        comparableCameraName(entity.attributes.friendly_name ?? "") === expected
      );
    });
    if (match) return match.entity_id;
  }
  return undefined;
}

function comparableCameraName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[’']/g, "")
    .trim()
    .replace(/\s+/g, " ");
}
