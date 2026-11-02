import {
  getClientEnvironment,
  type ClientEnvironment,
} from "../core/client-environment";
import type { HomeAssistantApi } from "../core/home-assistant";
import {
  getMediaSessionManager,
  type ConnectionFactory,
  type MediaConnectionOptions,
  type MediaSessionLease,
  type MediaSessionManager,
} from "../core/media-session-manager";

const webRtcFactory: ConnectionFactory = async (...args) => {
  const timing = args[4];
  timing.mark("adapter_import_started");
  const { createHaDirectWebRtcConnection } =
    await import("./home-assistant/live/webrtc");
  timing.mark("adapter_imported");
  return createHaDirectWebRtcConnection(...args);
};

const hlsFactory: ConnectionFactory = async (...args) => {
  const timing = args[4];
  timing.mark("adapter_import_started");
  const { createHaDirectHlsConnection } =
    await import("./home-assistant/live/hls");
  timing.mark("adapter_imported");
  return createHaDirectHlsConnection(...args);
};

/** Resolves live-source candidates to provider-owned session factories. */
export class LiveSourceResolver {
  public constructor(
    private readonly _environment: ClientEnvironment = getClientEnvironment(),
    private readonly _sessions: MediaSessionManager = getMediaSessionManager(),
  ) {}

  public get webRtcEligible(): boolean {
    return this._environment.webRtcSupported;
  }

  public hlsSessionKey(entityId: string): string {
    return `ha_direct:hls:${entityId}`;
  }

  public acquireWebRtc(
    api: HomeAssistantApi,
    entityId: string,
  ): MediaSessionLease {
    return this._sessions.acquire({
      api,
      entityId,
      factory: webRtcFactory,
      key: `ha_direct:webrtc:${entityId}`,
      retention: "preferred",
    });
  }

  public acquireHls(
    api: HomeAssistantApi,
    entityId: string,
    options: MediaConnectionOptions,
  ): MediaSessionLease {
    return this._sessions.acquire({
      api,
      entityId,
      factory: hlsFactory,
      key: this.hlsSessionKey(entityId),
      options,
      retention: "fallback",
    });
  }
}
