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
}

export type LiveSourceDescriptor =
  HomeAssistantLiveSourceDescriptor | FrigateGo2RtcLiveSourceDescriptor;

export function resolveLiveSource(
  api: HomeAssistantApi,
  connection: LiveConnectionType,
  entityId: string,
): Promise<LiveSourceDescriptor> {
  return api.callWS({
    type: `${INTEGRATION_ID}/live/source`,
    connection,
    entity_id: entityId,
  });
}
