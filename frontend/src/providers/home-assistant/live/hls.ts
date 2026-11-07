import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { LiveStartupTiming } from "../../../core/live-startup-timing";
import type {
  MediaConnection,
  MediaConnectionOptions,
} from "../../../core/media-session-manager";
import { createHlsConnection } from "../../live/hls";

interface StreamResponse {
  readonly url: string;
}

/** Home Assistant Direct source acquisition with shared HLS playback. */
export function createHomeAssistantHlsConnection(
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
  options: MediaConnectionOptions = { initialMuted: true },
): Promise<MediaConnection> {
  return createHlsConnection(
    api,
    entityId,
    signal,
    onFailure,
    timing,
    options,
    async (client, cameraEntityId) => {
      const stream = await client.callWS<StreamResponse>({
        type: "camera/stream",
        entity_id: cameraEntityId,
        format: "hls",
      });
      return stream.url;
    },
  );
}
