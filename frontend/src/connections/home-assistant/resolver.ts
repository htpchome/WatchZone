import type { ClientEnvironment } from "../../core/client-environment";
import type { HomeAssistantApi } from "../../core/home-assistant";
import type {
  MediaConnectionOptions,
  MediaSessionLease,
  MediaSessionManager,
} from "../../core/media-session-manager";

/** Selects the host-specific Home Assistant live pipeline once per consumer. */
export class HomeAssistantLiveConnectionResolver {
  public constructor(
    private readonly _environment: ClientEnvironment,
    private readonly _sessions: MediaSessionManager,
  ) {}

  public get webRtcEligible(): boolean {
    return this._environment.webRtcSupported;
  }

  public hlsSessionKey(entityId: string): string {
    return `home_assistant${
      this._environment.host === "catalyst" ? "_catalyst" : ""
    }_hls:${entityId}`;
  }

  public acquireHls(
    api: HomeAssistantApi,
    entityId: string,
    options: MediaConnectionOptions,
  ): MediaSessionLease {
    return this._environment.host === "catalyst"
      ? this._sessions.acquireHomeAssistantCatalystHls(api, entityId, options)
      : this._sessions.acquireHomeAssistantHls(api, entityId, options);
  }
}
