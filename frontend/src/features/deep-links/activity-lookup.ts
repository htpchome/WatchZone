import { getEvent, type EventItem } from "../../api/events";
import { getReview, type ReviewItem } from "../../api/reviews";
import type { HomeAssistantApi } from "../../core/home-assistant";

const INITIAL_PAGE_SIZE = 10;
const BACKGROUND_PAGE_SIZE = 500;

interface ActivityItem {
  readonly id: string;
  readonly start_time: number;
}

interface ActivityResponse<T extends ActivityItem> {
  readonly items: readonly T[];
}

export function findEvent(
  api: HomeAssistantApi,
  entityId: string,
  eventId: string,
  historyDays: number,
): Promise<EventItem | undefined> {
  return findDirectOrPaged(
    () => getEvent(api, entityId, eventId),
    () =>
      findActivity(
        api,
        entityId,
        "watchzone/events/list",
        eventId,
        historyDays,
      ),
    (item) => isEligibleDirectItem(item, eventId, historyDays),
  );
}

export function findReview(
  api: HomeAssistantApi,
  entityId: string,
  reviewId: string,
  historyDays: number,
): Promise<ReviewItem | undefined> {
  return findDirectOrPaged(
    () => getReview(api, entityId, reviewId),
    () =>
      findActivity(
        api,
        entityId,
        "watchzone/reviews/list",
        reviewId,
        historyDays,
      ),
    (item) => isEligibleDirectItem(item, reviewId, historyDays),
  );
}

async function findDirectOrPaged<T extends ActivityItem>(
  direct: () => Promise<T | undefined>,
  paged: () => Promise<T | undefined>,
  eligible: (item: T) => boolean,
): Promise<T | undefined> {
  try {
    const item = await direct();
    if (item && eligible(item)) return item;
  } catch {
    // The bounded paged lookup remains available while direct lookup parity is
    // proven across supported provider and Home Assistant versions.
  }
  return paged();
}

function isEligibleDirectItem(
  item: ActivityItem,
  targetId: string,
  historyDays: number,
): boolean {
  const windowAfter = Date.now() / 1000 - historyDays * 24 * 60 * 60;
  return matchesId(item.id, targetId) && item.start_time >= windowAfter;
}

async function findActivity<T extends ActivityItem>(
  api: HomeAssistantApi,
  entityId: string,
  type: "watchzone/events/list" | "watchzone/reviews/list",
  targetId: string,
  historyDays: number,
): Promise<T | undefined> {
  const windowBefore = Date.now() / 1000;
  const windowAfter = windowBefore - historyDays * 24 * 60 * 60;
  let before = windowBefore;
  let limit = INITIAL_PAGE_SIZE;
  while (before > windowAfter) {
    const response = await api.callWS<ActivityResponse<T>>({
      type,
      entity_id: entityId,
      after: windowAfter,
      before,
      limit,
      bypass_cache: true,
      ...(type === "watchzone/reviews/list" ? { summary_only: false } : {}),
    });
    const match = response.items.find(({ id }) => matchesId(id, targetId));
    if (match) return match;
    if (response.items.length < limit) return undefined;
    const oldestStart = Math.min(
      ...response.items.map(({ start_time }) => start_time),
    );
    if (!Number.isFinite(oldestStart) || oldestStart >= before)
      return undefined;
    before = oldestStart;
    limit = BACKGROUND_PAGE_SIZE;
  }
  return undefined;
}

function matchesId(normalizedId: string, targetId: string): boolean {
  return normalizedId === targetId || normalizedId.endsWith(`:${targetId}`);
}
