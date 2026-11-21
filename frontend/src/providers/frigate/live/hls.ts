import { INTEGRATION_ID } from "../../../core/constants";
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

/** Frigate-validated source acquisition with shared native/HLS.js playback. */
export function createFrigateHlsConnection(
  api: HomeAssistantApi,
  entityId: string,
  signal: AbortSignal,
  onFailure: (error: Error) => void,
  timing: LiveStartupTiming,
  options: MediaConnectionOptions,
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
        type: `${INTEGRATION_ID}/live/frigate/hls`,
        entity_id: cameraEntityId,
      });
      return stream.url;
    },
  );
}
