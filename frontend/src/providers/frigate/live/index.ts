import type { HomeAssistantApi } from "../../../core/home-assistant";
import { getBrowserLiveSource } from "../../../api/live-signaling";
import {
  getMediaSessionManager,
  type ConnectionFactory,
  type MediaConnectionOptions,
  type MediaReconnectPolicy,
  type MediaSessionLease,
} from "../../../core/media-session-manager";

const WEBRTC_RECONNECT_POLICY: MediaReconnectPolicy = {
  baseDelayMs: 60_000,
  maxAttempts: 5,
};

const mseFactory: ConnectionFactory = async (...args) => {
  args[4].mark("adapter_import_started");
  const { createFrigateMseConnection } = await import("./mse");
  args[4].mark("adapter_imported");
  return createFrigateMseConnection(...args);
};

const webRtcFactory: ConnectionFactory = async (...args) => {
  args[4].mark("adapter_import_started");
  const { createFrigateWebRtcConnection } = await import("./webrtc");
  args[4].mark("adapter_imported");
  return createFrigateWebRtcConnection(
    args[0],
    args[1],
    args[2],
    args[3],
    args[4],
  );
};

/** Owns only Frigate go2rtc transport identity and adapter selection. */
export class FrigateLiveProvider {
  public acquireMse(
    api: HomeAssistantApi,
    entityId: string,
    options: MediaConnectionOptions,
  ): Promise<MediaSessionLease> {
    return this._acquireMse(api, entityId, options);
  }

  private async _acquireMse(
    api: HomeAssistantApi,
    entityId: string,
    options: MediaConnectionOptions,
  ): Promise<MediaSessionLease> {
    const source = await getBrowserLiveSource(api, "frigate", entityId);
    return getMediaSessionManager().acquire({
      api,
      cameraKey: `frigate_go2rtc:${entityId}`,
      entityId,
      factory: mseFactory,
      key: `frigate:${source.provider_instance_id}:${source.stream_id}:mse`,
      options,
      retryInitialFailure: true,
      retention: "fallback",
    });
  }

  public acquireWebRtc(
    api: HomeAssistantApi,
    entityId: string,
  ): Promise<MediaSessionLease> {
    return this._acquireWebRtc(api, entityId);
  }

  private async _acquireWebRtc(
    api: HomeAssistantApi,
    entityId: string,
  ): Promise<MediaSessionLease> {
    const source = await getBrowserLiveSource(api, "frigate", entityId);
    return getMediaSessionManager().acquire({
      api,
      cameraKey: `frigate_go2rtc:${entityId}`,
      entityId,
      factory: webRtcFactory,
      key: `frigate:${source.provider_instance_id}:${source.stream_id}:webrtc`,
      mediaReconnectPolicy: WEBRTC_RECONNECT_POLICY,
      retention: "preferred",
    });
  }
}
