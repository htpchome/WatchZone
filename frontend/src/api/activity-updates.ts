import type { ReviewItem } from "./reviews";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../core/home-assistant";

export type ActivityUpdateKind = "events" | "reviews";

export interface ActivityUpdateNotification {
  readonly cameraName: string;
  readonly classification?: "alert" | "detection";
  readonly id?: string;
  readonly phase?: "end" | "new" | "update";
  readonly review?: ReviewItem;
  readonly topic: ActivityUpdateKind;
}

/** Subscribe to provider-normalized real-time camera activity. */
export async function subscribeActivityUpdates(
  api: HomeAssistantApi,
  entityId: string,
  kind: ActivityUpdateKind,
  callback: (notification: ActivityUpdateNotification) => void,
): Promise<HomeAssistantUnsubscribe> {
  const unsubscribe = await api.subscribeMessage(
    callback,
    {
      type: "watchzone/activity/subscribe",
      entity_id: entityId,
      kind,
    },
    { resubscribe: true },
  );
  return typeof unsubscribe === "function" ? unsubscribe : () => undefined;
}
