import type { HomeAssistantApi } from "../core/home-assistant";
import type { LiveConnectionType } from "../core/config";
import {
  resolveLiveSource,
  type FrigateGo2RtcLiveSourceDescriptor,
} from "../api/live-source";
import {
  getMediaSessionManager,
  type MediaConnectionOptions,
  type MediaSessionLease,
} from "../core/media-session-manager";

type HomeAssistantProvider =
  typeof import("./home-assistant/live").HomeAssistantLiveProvider;

let providerPromise: Promise<InstanceType<HomeAssistantProvider>> | undefined;
type FrigateProvider = typeof import("./frigate/live").FrigateLiveProvider;
let frigateProviderPromise: Promise<InstanceType<FrigateProvider>> | undefined;

async function getHomeAssistantProvider(): Promise<
  InstanceType<HomeAssistantProvider>
> {
  return (providerPromise ??= import("./home-assistant/live").then(
    ({ HomeAssistantLiveProvider }) => new HomeAssistantLiveProvider(),
  ));
}

async function getFrigateProvider(): Promise<InstanceType<FrigateProvider>> {
  return (frigateProviderPromise ??= import("./frigate/live").then(
    ({ FrigateLiveProvider }) => new FrigateLiveProvider(),
  ));
}

/** Public provider boundary used by camera orchestration and eager prewarm. */
export class LiveSourceResolver {
  public async resolveFrigate(
    api: HomeAssistantApi,
    entityId: string,
  ): Promise<FrigateGo2RtcLiveSourceDescriptor> {
    const descriptor = await resolveLiveSource(api, "frigate_go2rtc", entityId);
    if (descriptor.type !== "frigate_go2rtc")
      throw new Error("Frigate go2rtc source is unavailable");
    return descriptor;
  }

  public connectionKey(
    connection: LiveConnectionType,
    entityId: string,
    descriptor?: FrigateGo2RtcLiveSourceDescriptor,
  ): string {
    return connection === "frigate_go2rtc"
      ? (descriptor?.id ?? `frigate_go2rtc:pending:${entityId}`)
      : `home_assistant:${entityId}`;
  }

  public acquireUsableHomeAssistantWebRtc(
    api: HomeAssistantApi,
    entityId: string,
  ): MediaSessionLease | undefined {
    return getMediaSessionManager().acquireUsable(
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

  public frigateWebRtcKey(source: FrigateGo2RtcLiveSourceDescriptor): string {
    return `${source.id}:webrtc`;
  }

  public frigateMseKey(source: FrigateGo2RtcLiveSourceDescriptor): string {
    return `${source.id}:mse`;
  }

  public acquireUsableFrigateWebRtc(
    api: HomeAssistantApi,
    source: FrigateGo2RtcLiveSourceDescriptor,
  ): MediaSessionLease | undefined {
    return getMediaSessionManager().acquireUsable(
      this.frigateWebRtcKey(source),
      api,
    );
  }

  public async acquireFrigateWebRtc(
    api: HomeAssistantApi,
    entityId: string,
    source: FrigateGo2RtcLiveSourceDescriptor,
  ): Promise<MediaSessionLease> {
    return (await getFrigateProvider()).acquireWebRtc(
      api,
      entityId,
      this.frigateWebRtcKey(source),
    );
  }

  public async acquireFrigateMse(
    api: HomeAssistantApi,
    entityId: string,
    source: FrigateGo2RtcLiveSourceDescriptor,
    options: MediaConnectionOptions,
  ): Promise<MediaSessionLease> {
    return (await getFrigateProvider()).acquireMse(
      api,
      entityId,
      this.frigateMseKey(source),
      options,
      source,
    );
  }
}
