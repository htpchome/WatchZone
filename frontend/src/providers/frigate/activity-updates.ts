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
    readonly data?: FrigateReviewData;
    readonly end_time?: number | null;
    readonly id?: string;
    readonly severity?: string;
    readonly start_time?: number;
  };
  readonly before?: {
    readonly camera?: string;
    readonly data?: FrigateReviewData;
    readonly end_time?: number | null;
    readonly id?: string;
    readonly severity?: string;
    readonly start_time?: number;
  };
}

interface FrigateReviewData {
  readonly audio?: readonly unknown[];
  readonly detections?: readonly unknown[];
  readonly objects?: readonly unknown[];
  readonly sub_labels?: readonly unknown[];
  readonly zones?: readonly unknown[];
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
          const notification = normalizePayload(payload, source, topic, kind);
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
  source: FrigateActivityUpdateSource,
  topic: FrigateActivityTopic,
  kind: ActivityUpdateKind,
): ActivityUpdateNotification | undefined {
  const payload = parsePayload(value);
  if (!payload) return undefined;
  const activity = payload.after ?? payload.before;
  if (activity?.camera !== source.camera_name) return undefined;
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
  const review =
    topic === "reviews" && kind === "reviews"
      ? normalizeReview(payload, source, classification, phase)
      : undefined;
  return {
    cameraName: source.camera_name,
    classification,
    id: activity.id,
    phase,
    ...(review ? { review } : {}),
    topic,
  };
}

function normalizeReview(
  payload: FrigateActivityPayload,
  source: FrigateActivityUpdateSource,
  classification: "alert" | "detection" | undefined,
  phase: "end" | "new" | "update" | undefined,
) {
  const activity = payload.after ?? payload.before;
  if (
    !activity?.id ||
    !activity.camera ||
    !classification ||
    typeof activity.start_time !== "number"
  ) {
    return undefined;
  }
  const labels = strings([
    ...(activity.data?.objects ?? []),
    ...(activity.data?.audio ?? []),
  ]);
  const subLabels = strings(activity.data?.sub_labels ?? []);
  const zones = strings(activity.data?.zones ?? []);
  const eventIds = strings(activity.data?.detections ?? []);
  const endTime =
    typeof activity.end_time === "number" ? activity.end_time : null;
  const mediaEndTime = endTime ?? Date.now() / 1000;
  const revision = [
    "push",
    phase ?? "change",
    classification,
    endTime ?? "draft",
    labels.join(","),
    subLabels.join(","),
    zones.join(","),
    eventIds.join(","),
  ].join(":");
  const instance = encodeURIComponent(source.instance_id);
  const reviewId = encodeURIComponent(activity.id);
  const camera = encodeURIComponent(activity.camera);
  return {
    camera: activity.camera,
    classification,
    clip_url: null,
    end_time: endTime,
    id: `${source.instance_id}:${activity.id}`,
    labels,
    media_end_time: mediaEndTime,
    media_start_time: activity.start_time,
    playback_sources: [],
    preferred_transport: "file" as const,
    related_event_ids: eventIds.map((id) => `${source.instance_id}:${id}`),
    revision,
    snapshot_url: null,
    start_time: activity.start_time,
    sub_labels: subLabels,
    thumbnail_url:
      `/api/frigate/${instance}/notifications/${reviewId}/${camera}/` +
      `review_thumbnail.webp?v=${encodeURIComponent(revision)}`,
    zones,
  };
}

function strings(values: readonly unknown[]): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      ),
    ),
  ];
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
