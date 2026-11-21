import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { FrigateGo2RtcLiveSourceDescriptor } from "../../../api/live-source";
import {
  getMediaSessionManager,
  type ConnectionFactory,
  type MediaConnectionOptions,
  type MediaReconnectPolicy,
  type MediaSessionLease,
} from "../../../core/media-session-manager";

const WEBRTC_RECONNECT_POLICY: MediaReconnectPolicy = {
  baseDelayMs: 1_000,
  maxAttempts: 5,
};

function webRtcFactory(sourceKey?: string): ConnectionFactory {
  return async (...args) => {
    const { createFrigateWebRtcConnection } = await import("./webrtc");
    return createFrigateWebRtcConnection(...args, sourceKey);
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

function hlsFactory(sourceKey?: string): ConnectionFactory {
  return async (...args) => {
    const { createFrigateHlsConnection } = await import("./hls");
    return createFrigateHlsConnection(...args, sourceKey);
  };
}

/** Owns direct Frigate go2rtc source identity and transport adapters. */
export class FrigateLiveProvider {
  public acquireWebRtc(
    api: HomeAssistantApi,
    entityId: string,
    key: string,
    sourceKey?: string,
  ): MediaSessionLease {
    return getMediaSessionManager().acquire({
      api,
      cameraKey: entityId,
      entityId,
      factory: webRtcFactory(sourceKey),
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
    sourceKey?: string,
  ): MediaSessionLease {
    return getMediaSessionManager().acquire({
      api,
      cameraKey: entityId,
      entityId,
      factory: hlsFactory(sourceKey),
      key,
      options,
      retryInitialFailure: true,
      retention: "fallback",
    });
  }
}
