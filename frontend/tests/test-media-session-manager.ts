import type { HomeAssistantApi } from "../src/core/home-assistant";
import {
  type ConnectionFactory,
  type MediaConnectionOptions,
  type MediaSessionLease,
  type MediaSessionRequest,
  MediaSessionManager,
} from "../src/core/media-session-manager";

const missingFactory: ConnectionFactory = async () => {
  throw new Error("Test connection factory was not configured");
};

/** Test-only provider facade; production uses the Home Assistant resolver. */
export class TestMediaSessionManager extends MediaSessionManager {
  public constructor(
    private readonly _webRtcFactory: ConnectionFactory = missingFactory,
    private readonly _hlsFactory: ConnectionFactory = missingFactory,
  ) {
    super();
  }

  public override acquire(request: MediaSessionRequest): MediaSessionLease {
    return super.acquire({
      ...request,
      factory: request.key.startsWith("ha_direct:hls:")
        ? this._hlsFactory
        : this._webRtcFactory,
    });
  }

  public acquireHomeAssistant(
    api: HomeAssistantApi,
    entityId: string,
  ): MediaSessionLease {
    return this.acquire({
      api,
      entityId,
      factory: this._webRtcFactory,
      key: `ha_direct:webrtc:${entityId}`,
      retention: "preferred",
    });
  }

  public acquireHomeAssistantHls(
    api: HomeAssistantApi,
    entityId: string,
    options?: MediaConnectionOptions,
  ): MediaSessionLease {
    return this.acquire({
      api,
      entityId,
      factory: this._hlsFactory,
      key: `ha_direct:hls:${entityId}`,
      options,
      retention: "fallback",
    });
  }
}
