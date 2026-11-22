import type { HomeAssistantApi } from "../core/home-assistant";

export const ACTIVITY_INITIAL_PAGE_SIZE = 10;
export const ACTIVITY_OLDER_PAGE_SIZE = 50;

interface ActivityWindowItem {
  readonly id: string;
  readonly start_time: number;
}

interface ActivityWindowResponse<T extends ActivityWindowItem> {
  readonly items: readonly T[];
}

export interface ActivityWindowPage<T extends ActivityWindowItem> {
  readonly hasMore: boolean;
  readonly items: readonly T[];
  readonly nextBefore?: number;
}

export interface ActivityWindowOptions {
  readonly before?: number;
  readonly bypassCache?: boolean;
  readonly historyDays: number;
  readonly limit?: number;
}

/** Retrieve one newest-first activity page within the configured history. */
export async function listActivityWindow<T extends ActivityWindowItem>(
  api: HomeAssistantApi,
  entityId: string,
  type: "camera_optics/events/list" | "camera_optics/reviews/list",
  options: ActivityWindowOptions,
): Promise<ActivityWindowPage<T>> {
  const windowBefore = Date.now() / 1000;
  const windowAfter = windowBefore - options.historyDays * 24 * 60 * 60;
  const before = Math.min(options.before ?? windowBefore, windowBefore);
  const limit = options.limit ?? ACTIVITY_INITIAL_PAGE_SIZE;
  if (before <= windowAfter) return { hasMore: false, items: [] };

  const response = await api.callWS<ActivityWindowResponse<T>>({
    type,
    entity_id: entityId,
    after: windowAfter,
    before,
    limit,
    bypass_cache: options.bypassCache ?? false,
    ...(type === "camera_optics/reviews/list" ? { summary_only: false } : {}),
  });
  const items = sortedItems(response.items);
  const oldestStart = items[items.length - 1]?.start_time;
  const hasMore =
    items.length === limit &&
    oldestStart !== undefined &&
    Number.isFinite(oldestStart) &&
    oldestStart < before &&
    oldestStart > windowAfter;
  return {
    hasMore,
    items,
    ...(hasMore ? { nextBefore: oldestStart } : {}),
  };
}

function sortedItems<T extends ActivityWindowItem>(
  items: readonly T[],
): readonly T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()].sort(
    (left, right) =>
      right.start_time - left.start_time || left.id.localeCompare(right.id),
  );
}
