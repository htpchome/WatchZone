import { INTEGRATION_ID } from "../core/constants";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../core/home-assistant";

export type ActivityUpdateKind = "events" | "reviews";

export interface ActivityUpdate {
  readonly entity_id: string;
  readonly kind: ActivityUpdateKind;
}

/** Subscribe through WatchZone's provider-neutral backend activity boundary. */
export function subscribeActivityUpdates(
  api: HomeAssistantApi,
  entityId: string,
  kind: ActivityUpdateKind,
  callback: (update: ActivityUpdate) => void,
): Promise<HomeAssistantUnsubscribe> {
  return api.subscribeMessage(
    callback,
    {
      type: `${INTEGRATION_ID}/activity/subscribe`,
      entity_id: entityId,
      kind,
    },
    { resubscribe: true },
  );
}
