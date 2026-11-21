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
  readonly source_key?: string;
}

export type LiveSourceDescriptor =
  HomeAssistantLiveSourceDescriptor | FrigateGo2RtcLiveSourceDescriptor;

export interface LiveSourceOption {
  readonly key: string;
  readonly label: string;
}

export function resolveLiveSource(
  api: HomeAssistantApi,
  connection: LiveConnectionType,
  entityId: string,
  sourceKey?: string,
): Promise<LiveSourceDescriptor> {
  return api.callWS({
    type: `${INTEGRATION_ID}/live/source`,
    connection,
    entity_id: entityId,
    ...(sourceKey ? { source_key: sourceKey } : {}),
  });
}

export function listLiveSources(
  api: HomeAssistantApi,
  connection: LiveConnectionType,
  entityId: string,
): Promise<readonly LiveSourceOption[]> {
  return api.callWS({
    type: `${INTEGRATION_ID}/live/sources`,
    connection,
    entity_id: entityId,
  });
}
