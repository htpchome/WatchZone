import { MEDIA_SESSION_RUNTIME_KEY } from "../src/core/constants";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import {
  type ConnectionFactory,
  type MediaConnectionOptions,
  MediaSessionManager,
  type MediaSessionRequest,
} from "../src/core/media-session-manager";
import type { MediaRetentionEnvironment } from "../src/core/media-retention-policy";

const missingFactory: ConnectionFactory = async () => {
  throw new Error("No test connection factory was configured");
};

/** Test-only adapter; production core remains provider-neutral. */
export class TestMediaSessionManager extends MediaSessionManager {
  public constructor(
    private readonly _webRtcFactory: ConnectionFactory = missingFactory,
    private readonly _hlsFactory: ConnectionFactory = missingFactory,
    retentionEnvironment: MediaRetentionEnvironment = {},
  ) {
    super(retentionEnvironment);
  }

  public override acquire(request: MediaSessionRequest) {
    return super.acquire({
      ...request,
      factory:
        request.retention === "preferred"
          ? this._webRtcFactory
          : this._hlsFactory,
    });
  }

  public acquireHomeAssistant(api: HomeAssistantApi, entityId: string) {
    return this.acquire({
      api,
      cameraKey: entityId,
      entityId,
      factory: this._webRtcFactory,
      key: `home_assistant:webrtc:${entityId}`,
      retention: "preferred",
    });
  }

  public acquireHomeAssistantHls(
    api: HomeAssistantApi,
    entityId: string,
    options: MediaConnectionOptions = { initialMuted: true },
  ) {
    return this.acquire({
      api,
      cameraKey: entityId,
      entityId,
      factory: this._hlsFactory,
      key: `home_assistant:hls:${entityId}`,
      options,
      retention: "fallback",
    });
  }
}

export function installTestMediaSessionManager(
  manager: MediaSessionManager,
): void {
  (window as unknown as Record<string, unknown>)[MEDIA_SESSION_RUNTIME_KEY] =
    manager;
}

export function removeTestMediaSessionManager(): void {
  const runtime = window as unknown as Record<string, unknown>;
  const manager = runtime[MEDIA_SESSION_RUNTIME_KEY] as
    MediaSessionManager | undefined;
  manager?.closeAll();
  delete runtime[MEDIA_SESSION_RUNTIME_KEY];
}
