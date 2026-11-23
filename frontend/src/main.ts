import {
  APP_BUILD,
  APP_NAME,
  APP_VERSION,
  CARD_TAG,
  RUNTIME_DIAGNOSTICS_KEY,
} from "./core/constants";
import { getLiveStartupTimings } from "./core/live-startup-timing";
import { getMediaSessionManager } from "./core/media-session-manager";

getMediaSessionManager();

const activeCard = customElements.get(CARD_TAG) as
  (CustomElementConstructor & { readonly appVersion?: string }) | undefined;
const activeCardVersion = activeCard?.appVersion ?? null;
const runtime = window as unknown as Record<string, unknown>;
runtime[RUNTIME_DIAGNOSTICS_KEY] = Object.freeze({
  activeCardVersion,
  build: APP_BUILD,
  getLiveStartupTimings,
  version: APP_VERSION,
});

console.info(`${APP_NAME} v${APP_VERSION}`);

export { DashboardCard } from "./card/camera-optics-card";
