import {
  formatHomeAssistantEventDate,
  formatHomeAssistantTime,
} from "./date-time";
import type { HomeAssistantApi, HomeAssistantLocale } from "./home-assistant";
import type {
  RecordedMediaRequest,
  RecordedMediaSource,
  RecordedMediaTransport,
} from "./recorded-media";

export interface ActivityMediaItem {
  readonly analysisScore?: number;
  readonly score?: number;
  readonly cameraLabel: string;
  readonly classification?: "alert" | "detection";
  readonly downloadFilename?: string;
  readonly downloadUrl?: string | null;
  readonly endTime?: number | null;
  readonly id: string;
  readonly mediaEndTime?: number;
  readonly mediaStartTime?: number;
  readonly objectLabels?: readonly string[];
  readonly playbackSources: readonly RecordedMediaSource[];
  readonly preferredTransport: RecordedMediaTransport;
  readonly snapshotUrl: string | null;
  readonly startTime: number;
  readonly thumbnailUrl: string | null;
  readonly zones?: readonly string[];
}

export interface ActivityMediaRequestOptions {
  readonly exportReview?: () => void;
  readonly viewReview?: () => void;
}

export function activityMediaTitle(
  item: ActivityMediaItem,
  locale?: HomeAssistantLocale,
): string {
  const start = new Date(item.startTime * 1000);
  return `${capitalize(
    item.cameraLabel.replaceAll("_", " "),
    locale?.language,
  )} - ${formatHomeAssistantTime(start, locale)} - ${formatHomeAssistantEventDate(
    start,
    locale,
  )}`;
}

export function activityRecordedMediaRequest(
  item: ActivityMediaItem,
  kind: "snapshot" | "video",
  presentation: "event" | "review",
  api?: HomeAssistantApi,
  options: ActivityMediaRequestOptions = {},
): RecordedMediaRequest | undefined {
  const previewUrl = item.snapshotUrl ?? item.thumbnailUrl ?? undefined;
  const posterUrl = previewUrl
    ? (api?.resolveUrl(previewUrl) ?? previewUrl)
    : undefined;
  const title = activityMediaTitle(item, api?.locale);
  const snapshotVariant = item.snapshotUrl
    ? {
        download: {
          filename: `${item.cameraLabel}-${Math.floor(item.startTime)}.jpg`,
          path: item.snapshotUrl,
        },
        id: `${item.id}:snapshot`,
        kind: "snapshot" as const,
        posterUrl,
        preferredTransport: "file" as const,
        sources: [
          {
            content_type: "image/jpeg",
            transport: "file" as const,
            url: item.snapshotUrl,
          },
        ],
      }
    : undefined;
  const videoVariant =
    item.playbackSources.length > 0
      ? {
          ...(item.downloadUrl
            ? {
                download: {
                  filename:
                    item.downloadFilename ??
                    `${item.cameraLabel}-${Math.floor(item.startTime)}.mp4`,
                  path: item.downloadUrl,
                },
              }
            : {}),
          id: item.id,
          kind: "video" as const,
          posterUrl,
          preferredTransport: item.preferredTransport,
          sources: item.playbackSources,
        }
      : undefined;
  const actions = {
    ...(options.exportReview ? { exportReview: options.exportReview } : {}),
    ...(options.viewReview ? { viewReview: options.viewReview } : {}),
    variants: {
      ...(snapshotVariant ? { snapshot: snapshotVariant } : {}),
      ...(videoVariant ? { video: videoVariant } : {}),
    },
  };
  const metadata = {
    camera: item.cameraLabel,
    classification: item.classification,
    duration:
      item.mediaStartTime !== undefined && item.mediaEndTime !== undefined
        ? Math.max(0, item.mediaEndTime - item.mediaStartTime)
        : undefined,
    endTime: item.endTime,
    objects: item.objectLabels ?? [],
    score: item.score,
    startTime: item.startTime,
    zones: item.zones ?? [],
  };
  if (kind === "snapshot") {
    if (!snapshotVariant) return undefined;
    return {
      ...snapshotVariant,
      actions,
      metadata,
      presentation,
      title,
    };
  }
  if (!videoVariant) return undefined;
  return {
    ...videoVariant,
    actions,
    metadata,
    presentation,
    title,
  };
}

export function activityPreviewMediaRequest(
  item: ActivityMediaItem,
  presentation: "event" | "review",
  api?: HomeAssistantApi,
  previewUrl?: string | null,
): RecordedMediaRequest | undefined {
  const url = previewUrl ?? item.thumbnailUrl ?? item.snapshotUrl;
  if (!url) return undefined;
  return {
    id: `${item.id}:progress`,
    kind: "snapshot",
    metadata: {
      camera: item.cameraLabel,
      classification: item.classification,
      duration:
        item.mediaStartTime !== undefined && item.mediaEndTime !== undefined
          ? Math.max(0, item.mediaEndTime - item.mediaStartTime)
          : undefined,
      endTime: item.endTime,
      objects: item.objectLabels ?? [],
      score: item.score,
      startTime: item.startTime,
      zones: item.zones ?? [],
    },
    posterUrl: api?.resolveUrl(url) ?? url,
    preferredTransport: "file",
    presentation,
    sources: [
      {
        content_type: previewUrl ? "image/gif" : "image/jpeg",
        transport: "file",
        url,
      },
    ],
    title: activityMediaTitle(item, api?.locale),
  };
}

function capitalize(value: string, locale?: string): string {
  const characters = Array.from(value.trim());
  const first = characters.shift();
  return first
    ? `${first.toLocaleUpperCase(locale)}${characters.join("")}`
    : "";
}
