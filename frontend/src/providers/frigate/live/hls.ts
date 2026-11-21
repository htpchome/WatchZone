import { INTEGRATION_ID } from "../../../core/constants";
import type { FrigateGo2RtcLiveSourceDescriptor } from "../../../api/live-source";
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
  source: FrigateGo2RtcLiveSourceDescriptor,
): Promise<MediaConnection> {
  return createHlsConnection(
    api,
    entityId,
    signal,
    onFailure,
    timing,
    options,
    async (client, cameraEntityId) => {
      if (source.substream) {
        const path = `/api/frigate/${encodeURIComponent(
          source.frigate_instance_id,
        )}/go2rtc/api/stream.m3u8?src=${encodeURIComponent(
          source.stream_name,
        )}&mp4`;
        const signed = await client.callWS<{ readonly path: string }>({
          type: "auth/sign_path",
          path,
          expires: 3600,
        });
        return signed.path;
      }
      const stream = await client.callWS<StreamResponse>({
        type: `${INTEGRATION_ID}/live/frigate/hls`,
        entity_id: cameraEntityId,
      });
      return stream.url;
    },
  );
}
