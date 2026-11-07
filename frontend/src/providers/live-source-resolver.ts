import type { HomeAssistantApi } from "../core/home-assistant";
import {
  getMediaSessionManager,
  type MediaConnectionOptions,
  type MediaSessionLease,
} from "../core/media-session-manager";

type HomeAssistantProvider =
  typeof import("./home-assistant/live").HomeAssistantLiveProvider;

let providerPromise: Promise<InstanceType<HomeAssistantProvider>> | undefined;

async function getHomeAssistantProvider(): Promise<
  InstanceType<HomeAssistantProvider>
> {
  return (providerPromise ??= import("./home-assistant/live").then(
    ({ HomeAssistantLiveProvider }) => new HomeAssistantLiveProvider(),
  ));
}

/** Public provider boundary used by camera orchestration and eager prewarm. */
export class LiveSourceResolver {
  public acquireRetainedHomeAssistantWebRtc(
    api: HomeAssistantApi,
    entityId: string,
  ): MediaSessionLease | undefined {
    return getMediaSessionManager().acquireReusable(
      this.homeAssistantWebRtcKey(entityId),
      api,
    );
  }

  public async acquireHomeAssistantWebRtc(
    api: HomeAssistantApi,
    entityId: string,
  ): Promise<MediaSessionLease> {
    return (await getHomeAssistantProvider()).acquireWebRtc(
      api,
      entityId,
      this.homeAssistantWebRtcKey(entityId),
    );
  }

  public async acquireHomeAssistantHls(
    api: HomeAssistantApi,
    entityId: string,
    options: MediaConnectionOptions,
  ): Promise<MediaSessionLease> {
    return (await getHomeAssistantProvider()).acquireHls(
      api,
      entityId,
      this.homeAssistantHlsKey(entityId, options.lowLatencyHls !== false),
      options,
    );
  }

  public homeAssistantWebRtcKey(entityId: string): string {
    return `home_assistant:webrtc:${entityId}`;
  }

  public homeAssistantHlsKey(entityId: string, lowLatencyHls = true): string {
    return lowLatencyHls
      ? `home_assistant:hls:${entityId}`
      : `home_assistant:hls:standard:${entityId}`;
  }
}
