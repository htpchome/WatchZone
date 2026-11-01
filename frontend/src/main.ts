import { APP_BUILD, APP_NAME, APP_VERSION } from "./core/constants";
import { getMediaSessionManager } from "./core/media-session-manager";

getMediaSessionManager();

console.info(
  `%c ${APP_NAME} %c v${APP_VERSION} (${APP_BUILD}) `,
  "background:#03a9f4;color:#fff;font-weight:700;border-radius:3px 0 0 3px",
  "background:#263238;color:#fff;font-weight:700;border-radius:0 3px 3px 0",
);

export { WatchZoneCard } from "./card/watchzone-card";
