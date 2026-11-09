import { INTEGRATION_ID } from "../core/constants";
import type { HomeAssistantApi } from "../core/home-assistant";

export interface FrigateActivityUpdateSource {
  readonly type: "frigate";
  readonly instance_id: string;
  readonly camera_name: string;
}

export type ActivityUpdateSource = FrigateActivityUpdateSource;

/** Resolve a camera to the provider-owned real-time activity transport. */
export function resolveActivityUpdateSource(
  api: HomeAssistantApi,
  entityId: string,
): Promise<ActivityUpdateSource> {
  return api.callWS<ActivityUpdateSource>({
    type: `${INTEGRATION_ID}/activity/source`,
    entity_id: entityId,
  });
}
