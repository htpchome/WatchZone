import { APP_BUILD, APP_NAME, APP_VERSION, CARD_TAG } from "./core/constants";
import { getClientEnvironment } from "./core/client-environment";
import { getLiveStartupTimings } from "./core/live-startup-timing";
import { getMediaSessionManager } from "./core/media-session-manager";

getMediaSessionManager();

const activeCard = customElements.get(CARD_TAG) as
  | (CustomElementConstructor & { readonly watchZoneVersion?: string })
  | undefined;
const activeCardVersion = activeCard?.watchZoneVersion ?? null;
const clientEnvironment = getClientEnvironment();
window.watchZone = Object.freeze({
  activeCardVersion,
  build: APP_BUILD,
  clientEnvironment: Object.freeze({
    catalyst: clientEnvironment.catalyst,
    companion: clientEnvironment.companion,
    deviceClass: clientEnvironment.deviceClass,
    hasTouch: clientEnvironment.hasTouch,
    host: clientEnvironment.host,
    operatingSystem: clientEnvironment.operatingSystem,
    primaryTouch: clientEnvironment.primaryTouch,
    webRtcSupported: clientEnvironment.webRtcSupported,
  }),
  getLiveStartupTimings,
  loadedAt: new Date().toISOString(),
  version: APP_VERSION,
});

console.info(
  `%c ${APP_NAME} CURRENT %c v${APP_VERSION} (${APP_BUILD}) `,
  "background:#03a9f4;color:#fff;font-weight:700;border-radius:3px 0 0 3px",
  "background:#263238;color:#fff;font-weight:700;border-radius:0 3px 3px 0",
);
if (activeCardVersion !== APP_VERSION) {
  console.error(
    `${APP_NAME} loaded v${APP_VERSION}, but the active card is ${
      activeCardVersion ? `v${activeCardVersion}` : "an unversioned stale copy"
    }. Fully reload this Home Assistant client or clear its site cache.`,
  );
}

export { WatchZoneCard } from "./card/watchzone-card";
