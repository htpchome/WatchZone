import { APP_NAME, APP_VERSION } from "./core/constants";
import { getLiveStartupTimings } from "./core/live-startup-timing";
import { getMediaSessionManager } from "./core/media-session-manager";

getMediaSessionManager();

window.wzc = { getLiveStartupTimings };

console.info(`${APP_NAME} v${APP_VERSION}`);

export { DashboardCard } from "./card/camera-optics-card";
