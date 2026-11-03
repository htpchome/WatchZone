import { afterEach, describe, expect, it, vi } from "vitest";

import { SORTABLE_REORDER_EVENT } from "../src/core/constants";
import type {
  SortableList,
  SortableReorderDetail,
  SortableTile,
} from "../src/ui/sortable-list";
import "../src/ui/sortable-list";

afterEach(() => document.body.replaceChildren());

describe("sortable list", () => {
  it("translates keyboard movement into an absolute reorder intent", async () => {
    const list = document.createElement("wzc-sortable-list") as SortableList;
    const first = document.createElement("wzc-sortable-tile") as SortableTile;
    const second = document.createElement("wzc-sortable-tile") as SortableTile;
    first.itemKey = "first";
    second.itemKey = "second";
    list.append(first, second);
    document.body.append(list);
    await Promise.all([
      list.updateComplete,
      first.updateComplete,
      second.updateComplete,
    ]);
    const reordered = vi.fn<EventListener>();
    list.addEventListener(SORTABLE_REORDER_EVENT, reordered);

    second.shadowRoot
      ?.querySelector("button")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));

    expect(reordered).toHaveBeenCalledOnce();
    expect(
      (reordered.mock.calls[0][0] as CustomEvent<SortableReorderDetail>).detail,
    ).toEqual({
      fromIndex: 1,
      itemKey: "second",
      toIndex: 0,
    });
  });
});
