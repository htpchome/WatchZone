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

function webRtcFactory(
  source: FrigateGo2RtcLiveSourceDescriptor,
): ConnectionFactory {
  return async (...args) => {
    const { createFrigateWebRtcConnection } = await import("./webrtc");
    return createFrigateWebRtcConnection(...args, source);
  };
}

function mseFactory(
  source: FrigateGo2RtcLiveSourceDescriptor,
): ConnectionFactory {
  return async (...args) => {
    const { createFrigateMseConnection } = await import("./mse");
    return createFrigateMseConnection(...args, source);
  };
}

function hlsFactory(
  source: FrigateGo2RtcLiveSourceDescriptor,
): ConnectionFactory {
  return async (...args) => {
    const { createFrigateHlsConnection } = await import("./hls");
    return createFrigateHlsConnection(...args, source);
  };
}

/** Owns direct Frigate go2rtc source identity and transport adapters. */
export class FrigateLiveProvider {
  public acquireWebRtc(
    api: HomeAssistantApi,
    entityId: string,
    key: string,
    source: FrigateGo2RtcLiveSourceDescriptor,
  ): MediaSessionLease {
    return getMediaSessionManager().acquire({
      api,
      cameraKey: entityId,
      entityId,
      factory: webRtcFactory(source),
      key,
      mediaReconnectPolicy: WEBRTC_RECONNECT_POLICY,
      retryInitialFailure: true,
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
    source: FrigateGo2RtcLiveSourceDescriptor,
  ): MediaSessionLease {
    return getMediaSessionManager().acquire({
      api,
      cameraKey: entityId,
      entityId,
      factory: hlsFactory(source),
      key,
      options,
      retryInitialFailure: true,
      retention: "fallback",
    });
  }
}
