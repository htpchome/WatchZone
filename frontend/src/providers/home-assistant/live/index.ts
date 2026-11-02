import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  getMediaSessionManager,
  type ConnectionFactory,
  type MediaConnectionOptions,
  type MediaSessionLease,
} from "../../../core/media-session-manager";

const webRtcFactory: ConnectionFactory = async (...args) => {
  const timing = args[4];
  timing.mark("adapter_import_started");
  const { createHomeAssistantWebRtcConnection } = await import("./webrtc");
  timing.mark("adapter_imported");
  return createHomeAssistantWebRtcConnection(...args);
};

const hlsFactory: ConnectionFactory = async (...args) => {
  const timing = args[4];
  timing.mark("adapter_import_started");
  const { createHomeAssistantHlsConnection } = await import("./hls");
  timing.mark("adapter_imported");
  return createHomeAssistantHlsConnection(...args);
};

/** Owns Home Assistant live-source identity and lazy adapter selection. */
export class HomeAssistantLiveProvider {
  public acquireWebRtc(
    api: HomeAssistantApi,
    entityId: string,
  ): MediaSessionLease {
    return getMediaSessionManager().acquire({
      api,
      entityId,
      factory: webRtcFactory,
      key: `home_assistant:webrtc:${entityId}`,
      retention: "preferred",
    });
  }

  public acquireHls(
    api: HomeAssistantApi,
    entityId: string,
    options: MediaConnectionOptions,
  ): MediaSessionLease {
    return getMediaSessionManager().acquire({
      api,
      entityId,
      factory: hlsFactory,
      key: this.hlsKey(entityId),
      options,
      retention: "fallback",
    });
  }

  public hlsKey(entityId: string): string {
    return `home_assistant:hls:${entityId}`;
  }

  public webRtcKey(entityId: string): string {
    return `home_assistant:webrtc:${entityId}`;
  }
}
