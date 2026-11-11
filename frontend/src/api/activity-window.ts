import type { HomeAssistantApi } from "../core/home-assistant";

const ACTIVITY_INITIAL_PAGE_SIZE = 10;
const ACTIVITY_BACKGROUND_PAGE_SIZE = 500;

interface ActivityWindowItem {
  readonly id: string;
  readonly start_time: number;
}

interface ActivityWindowResponse<T extends ActivityWindowItem> {
  readonly items: readonly T[];
}

export interface ActivityWindowOptions<T extends ActivityWindowItem> {
  readonly bypassCache?: boolean;
  readonly historyDays: number;
  readonly loadFullHistory?: boolean;
  readonly onProgress?: (items: readonly T[]) => void;
}

/** Retrieve the complete newest-first activity window through bounded pages. */
export async function listActivityWindow<T extends ActivityWindowItem>(
  api: HomeAssistantApi,
  entityId: string,
  type: "watchzone/events/list" | "watchzone/reviews/list",
  options: ActivityWindowOptions<T>,
): Promise<readonly T[]> {
  const windowBefore = Date.now() / 1000;
  const windowAfter = windowBefore - options.historyDays * 24 * 60 * 60;
  const items = new Map<string, T>();
  let before = windowBefore;
  let pageSize = ACTIVITY_INITIAL_PAGE_SIZE;
  let firstPage = true;

  while (before > windowAfter) {
    const response = await api.callWS<ActivityWindowResponse<T>>({
      type,
      entity_id: entityId,
      after: windowAfter,
      before,
      limit: pageSize,
      bypass_cache: options.bypassCache ?? false,
      ...(type === "watchzone/reviews/list"
        ? {
            summary_only: false,
          }
        : {}),
    });
    for (const item of response.items) items.set(item.id, item);
    const snapshot = sortedItems(items);
    options.onProgress?.(snapshot);
    if (options.loadFullHistory === false || response.items.length < pageSize)
      return snapshot;

    if (firstPage) await allowFirstPagePaint();

    const oldestStart = Math.min(
      ...response.items.map(({ start_time }) => start_time),
    );
    if (!Number.isFinite(oldestStart) || oldestStart >= before) break;
    before = oldestStart;
    pageSize = ACTIVITY_BACKGROUND_PAGE_SIZE;
    firstPage = false;
  }

  return sortedItems(items);
}

function allowFirstPagePaint(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function sortedItems<T extends ActivityWindowItem>(
  items: ReadonlyMap<string, T>,
): readonly T[] {
  return [...items.values()].sort(
    (left, right) =>
      right.start_time - left.start_time || left.id.localeCompare(right.id),
  );
}
