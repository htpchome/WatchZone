import type { FrigateActivityUpdateSource } from "../../api/activity-updates";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../../core/home-assistant";
import type { ActivityUpdateKind } from "../activity-update-resolver";
import type { ActivityUpdateNotification } from "../activity-update-resolver";

interface FrigateActivityPayload {
  readonly type?: string;
  readonly after?: {
    readonly camera?: string;
    readonly id?: string;
    readonly severity?: string;
  };
  readonly before?: {
    readonly camera?: string;
    readonly id?: string;
    readonly severity?: string;
  };
}

type FrigateActivityTopic = "events" | "reviews";

/** Subscribe through Frigate's official per-instance Home Assistant proxies. */
export async function subscribeFrigateActivityUpdates(
  api: HomeAssistantApi,
  source: FrigateActivityUpdateSource,
  kind: ActivityUpdateKind,
  callback: (notification: ActivityUpdateNotification) => void,
): Promise<HomeAssistantUnsubscribe> {
  const topics: readonly FrigateActivityTopic[] =
    kind === "reviews" ? ["reviews"] : ["events"];
  const unsubscribers: HomeAssistantUnsubscribe[] = [];
  try {
    for (const topic of topics) {
      const unsubscribe = await api.subscribeMessage<unknown>(
        (payload) => {
          const notification = normalizePayload(
            payload,
            source.camera_name,
            topic,
            kind,
          );
          if (notification) callback(notification);
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

function normalizePayload(
  value: unknown,
  cameraName: string,
  topic: FrigateActivityTopic,
  kind: ActivityUpdateKind,
): ActivityUpdateNotification | undefined {
  const payload = parsePayload(value);
  if (!payload) return undefined;
  const activity = payload.after ?? payload.before;
  if (activity?.camera !== cameraName) return undefined;
  const classification =
    activity.severity === "alert" || activity.severity === "detection"
      ? activity.severity
      : undefined;
  if (topic === "reviews" && kind === "reviews" && !classification) {
    return undefined;
  }
  const phase =
    payload.type === "new" ||
    payload.type === "update" ||
    payload.type === "end"
      ? payload.type
      : undefined;
  return {
    cameraName,
    classification,
    id: activity.id,
    phase,
    topic,
  };
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
