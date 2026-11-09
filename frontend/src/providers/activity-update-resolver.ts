import { resolveActivityUpdateSource } from "../api/activity-updates";
import type { ReviewItem } from "../api/reviews";
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

/** Subscribe through the camera provider's native Home Assistant transport. */
export async function subscribeActivityUpdates(
  api: HomeAssistantApi,
  entityId: string,
  kind: ActivityUpdateKind,
  callback: (notification: ActivityUpdateNotification) => void,
): Promise<HomeAssistantUnsubscribe> {
  const source = await resolveActivityUpdateSource(api, entityId);
  switch (source.type) {
    case "frigate": {
      const { subscribeFrigateActivityUpdates } =
        await import("./frigate/activity-updates");
      return subscribeFrigateActivityUpdates(api, source, kind, callback);
    }
  }
}
