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
    key: string,
  ): MediaSessionLease {
    return getMediaSessionManager().acquire({
      api,
      cameraKey: entityId,
      entityId,
      factory: webRtcFactory,
      key,
      retention: "preferred",
    });
  }

  public acquireHls(
    api: HomeAssistantApi,
    entityId: string,
    key: string,
    options: MediaConnectionOptions,
  ): MediaSessionLease {
    return getMediaSessionManager().acquire({
      api,
      cameraKey: entityId,
      entityId,
      factory: hlsFactory,
      key,
      options,
      retention: "fallback",
    });
  }
}
