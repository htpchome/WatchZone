import type { HomeAssistantApi } from "../core/home-assistant";

const ACTIVITY_PAGE_SIZE = 500;

interface ActivityWindowItem {
  readonly id: string;
  readonly start_time: number;
}

interface ActivityWindowResponse<T extends ActivityWindowItem> {
  readonly items: readonly T[];
}

/** Retrieve the complete newest-first activity window through bounded pages. */
export async function listActivityWindow<T extends ActivityWindowItem>(
  api: HomeAssistantApi,
  entityId: string,
  type: "watchzone/events/list" | "watchzone/reviews/list",
  options: { readonly bypassCache?: boolean; readonly historyDays: number },
): Promise<readonly T[]> {
  const windowBefore = Date.now() / 1000;
  const windowAfter = windowBefore - options.historyDays * 24 * 60 * 60;
  const items = new Map<string, T>();
  let before = windowBefore;

  while (before > windowAfter) {
    const response = await api.callWS<ActivityWindowResponse<T>>({
      type,
      entity_id: entityId,
      after: windowAfter,
      before,
      limit: ACTIVITY_PAGE_SIZE,
      bypass_cache: options.bypassCache ?? false,
    });
    for (const item of response.items) items.set(item.id, item);
    if (response.items.length < ACTIVITY_PAGE_SIZE) break;

    const oldestStart = Math.min(
      ...response.items.map(({ start_time }) => start_time),
    );
    if (!Number.isFinite(oldestStart) || oldestStart >= before) break;
    before = oldestStart;
  }

  return [...items.values()].sort(
    (left, right) =>
      right.start_time - left.start_time || left.id.localeCompare(right.id),
  );
}
