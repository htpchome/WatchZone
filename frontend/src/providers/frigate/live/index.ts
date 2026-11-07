import type { FrigateGo2RtcLiveSourceDescriptor } from "../../../api/live-source";
import type { HomeAssistantApi } from "../../../core/home-assistant";
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

const webRtcFactory: ConnectionFactory = async (...args) => {
  const { createFrigateWebRtcConnection } = await import("./webrtc");
  return createFrigateWebRtcConnection(...args);
};

function mseFactory(
  source: FrigateGo2RtcLiveSourceDescriptor,
): ConnectionFactory {
  return async (...args) => {
    const { createFrigateMseConnection } = await import("./mse");
    return createFrigateMseConnection(...args, source);
  };
}

const hlsFactory: ConnectionFactory = async (...args) => {
  const { createFrigateHlsConnection } = await import("./hls");
  return createFrigateHlsConnection(...args);
};

/** Owns direct Frigate go2rtc source identity and transport adapters. */
export class FrigateLiveProvider {
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
      mediaReconnectPolicy: WEBRTC_RECONNECT_POLICY,
      retention: "preferred",
    });
  }

  public acquireMse(
    api: HomeAssistantApi,
    entityId: string,
    key: string,
    options: MediaConnectionOptions,
    source: FrigateGo2RtcLiveSourceDescriptor,
  ): MediaSessionLease {
    return getMediaSessionManager().acquire({
      api,
      cameraKey: entityId,
      entityId,
      factory: mseFactory(source),
      key,
      options,
      retryInitialFailure: true,
      retention: "fallback",
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
      retryInitialFailure: true,
      retention: "fallback",
    });
  }
}
