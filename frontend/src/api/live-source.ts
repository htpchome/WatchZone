import { INTEGRATION_ID } from "../core/constants";
import type { LiveConnectionType } from "../core/config";
import type { HomeAssistantApi } from "../core/home-assistant";

export interface HomeAssistantLiveSourceDescriptor {
  readonly id: string;
  readonly type: "home_assistant";
}

export interface FrigateGo2RtcLiveSourceDescriptor {
  readonly id: string;
  readonly type: "frigate_go2rtc";
  readonly frigate_instance_id: string;
  readonly stream_name: string;
  readonly substream?: boolean;
}

export type LiveSourceDescriptor =
  HomeAssistantLiveSourceDescriptor | FrigateGo2RtcLiveSourceDescriptor;

export function resolveLiveSource(
  api: HomeAssistantApi,
  connection: LiveConnectionType,
  entityId: string,
  substream?: string,
): Promise<LiveSourceDescriptor> {
  return api.callWS({
    type: `${INTEGRATION_ID}/live/source`,
    connection,
    entity_id: entityId,
    ...(substream ? { substream } : {}),
  });
}

export async function listFrigateSubstreams(
  api: HomeAssistantApi,
  entityId: string,
): Promise<readonly string[]> {
  const response = await api.callWS<{ readonly streams?: unknown }>({
    type: `${INTEGRATION_ID}/live/frigate/substreams`,
    entity_id: entityId,
  });
  if (
    !Array.isArray(response.streams) ||
    !response.streams.every(
      (stream): stream is string => typeof stream === "string",
    )
  ) {
    throw new Error("Frigate substream discovery returned an invalid response");
  }
  return response.streams;
}
