import {
  formatHomeAssistantEventDate,
  formatHomeAssistantTime,
} from "./date-time";
import type { HomeAssistantApi } from "./home-assistant";
import type {
  RecordedMediaRequest,
  RecordedMediaSource,
  RecordedMediaTransport,
} from "./recorded-media";

export interface ActivityMediaItem {
  readonly cameraLabel: string;
  readonly id: string;
  readonly playbackSources: readonly RecordedMediaSource[];
  readonly preferredTransport: RecordedMediaTransport;
  readonly snapshotUrl: string | null;
  readonly startTime: number;
  readonly thumbnailUrl: string | null;
}

export function activityMediaTitle(
  item: ActivityMediaItem,
  api?: HomeAssistantApi,
): string {
  const start = new Date(item.startTime * 1000);
  return `${capitalize(
    item.cameraLabel.replaceAll("_", " "),
    api?.locale?.language,
  )} - ${formatHomeAssistantTime(start, api?.locale)} - ${formatHomeAssistantEventDate(
    start,
    api?.locale,
  )}`;
}

export function activityRecordedMediaRequest(
  item: ActivityMediaItem,
  kind: "snapshot" | "video",
  presentation: "event" | "review",
  api?: HomeAssistantApi,
): RecordedMediaRequest | undefined {
  const previewUrl = item.thumbnailUrl ?? item.snapshotUrl ?? undefined;
  const posterUrl = previewUrl
    ? (api?.resolveUrl(previewUrl) ?? previewUrl)
    : undefined;
  const title = activityMediaTitle(item, api);
  if (kind === "snapshot") {
    if (!item.snapshotUrl) return undefined;
    return {
      id: `${item.id}:snapshot`,
      kind,
      presentation,
      posterUrl,
      preferredTransport: "file",
      sources: [
        {
          content_type: "image/jpeg",
          transport: "file",
          url: item.snapshotUrl,
        },
      ],
      title,
    };
  }
  if (item.playbackSources.length === 0) return undefined;
  return {
    id: item.id,
    kind,
    presentation,
    posterUrl,
    preferredTransport: item.preferredTransport,
    sources: item.playbackSources,
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
    title: activityMediaTitle(item, api),
  };
}

function capitalize(value: string, locale?: string): string {
  const characters = Array.from(value.trim());
  const first = characters.shift();
  return first
    ? `${first.toLocaleUpperCase(locale)}${characters.join("")}`
    : "";
}
