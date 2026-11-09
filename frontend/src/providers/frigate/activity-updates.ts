import type { FrigateActivityUpdateSource } from "../../api/activity-updates";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../../core/home-assistant";
import type { ActivityUpdateKind } from "../activity-update-resolver";

interface FrigateActivityPayload {
  readonly after?: {
    readonly camera?: string;
    readonly severity?: string;
  };
  readonly before?: {
    readonly camera?: string;
    readonly severity?: string;
  };
}

type FrigateActivityTopic = "events" | "reviews";

/** Subscribe through Frigate's official per-instance Home Assistant proxies. */
export async function subscribeFrigateActivityUpdates(
  api: HomeAssistantApi,
  source: FrigateActivityUpdateSource,
  kind: ActivityUpdateKind,
  callback: () => void,
): Promise<HomeAssistantUnsubscribe> {
  const topics: readonly FrigateActivityTopic[] =
    kind === "reviews" ? ["reviews", "events"] : ["events"];
  const unsubscribers: HomeAssistantUnsubscribe[] = [];
  try {
    for (const topic of topics) {
      const unsubscribe = await api.subscribeMessage<unknown>(
        (payload) => {
          if (payloadMatches(payload, source.camera_name, topic, kind)) {
            callback();
          }
        },
        {
          type: `frigate/${topic}/subscribe`,
          instance_id: source.instance_id,
        },
        { resubscribe: true },
      );
      if (typeof unsubscribe === "function") unsubscribers.push(unsubscribe);
    }
  } catch (error) {
    for (const unsubscribe of unsubscribers) unsubscribe();
    throw error;
  }
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

function payloadMatches(
  value: unknown,
  cameraName: string,
  topic: FrigateActivityTopic,
  kind: ActivityUpdateKind,
): boolean {
  const payload = parsePayload(value);
  if (!payload) return false;
  const activity = payload.after ?? payload.before;
  if (activity?.camera !== cameraName) return false;
  if (topic === "events" || kind === "events") return true;
  return activity.severity === "alert" || activity.severity === "detection";
}

function parsePayload(value: unknown): FrigateActivityPayload | undefined {
  if (typeof value === "object" && value !== null) {
    return value as FrigateActivityPayload;
  }
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as FrigateActivityPayload)
      : undefined;
  } catch {
    return undefined;
  }
}
