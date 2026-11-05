import { html, LitElement } from "lit";

import {
  SORTABLE_DRAG_EVENT,
  SORTABLE_KEYBOARD_MOVE_EVENT,
  SORTABLE_LIST_TAG,
  SORTABLE_REORDER_EVENT,
  SORTABLE_SETTLE_DURATION_MS,
  SORTABLE_TILE_TAG,
} from "../core/constants";
import { englishLocalize, type LocalizeFunction } from "../core/localization";
import { renderIcon } from "./icons";
import { sortableListStyles, sortableTileStyles } from "./sortable-list.styles";

type SortableDragPhase = "cancel" | "end" | "move" | "start";

interface SortableDragDetail {
  readonly clientY: number;
  readonly item: SortableTile;
  readonly phase: SortableDragPhase;
}

export interface SortableReorderDetail {
  readonly fromIndex: number;
  readonly itemKey: string;
  readonly toIndex: number;
}

export class SortableTile extends LitElement {
  public static properties = {
    dragging: { reflect: true, type: Boolean },
    settling: { reflect: true, type: Boolean },
    settleLifted: {
      attribute: "settle-lifted",
      reflect: true,
      type: Boolean,
    },
    dropTarget: {
      attribute: "drop-target",
      reflect: true,
      type: Boolean,
    },
    itemKey: { attribute: "item-key" },
    localize: { attribute: false },
  };

  public dragging = false;
  public settling = false;
  public settleLifted = false;
  public dropTarget = false;
  public itemKey = "";
  public localize: LocalizeFunction = englishLocalize;
  private _offset = 0;
  private _pointerId?: number;
  private _pointerStartY = 0;
  private _settleAnimation?: Animation;

  public connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("role", "listitem");
  }

  public resetDrag(): void {
    this._settleAnimation?.cancel();
    this._settleAnimation = undefined;
    this.dragging = false;
    this.settling = false;
    this.settleLifted = false;
    this._pointerId = undefined;
    this._pointerStartY = 0;
    this._offset = 0;
    this.requestUpdate();
  }

  public releasePointer(): void {
    this._pointerId = undefined;
    this._pointerStartY = 0;
  }

  public prepareSettle(lifted: boolean): void {
    this.releasePointer();
    this.dragging = false;
    this.settling = true;
    this.settleLifted = lifted;
    this._offset = 0;
    this.requestUpdate();
  }

  public async settleFrom(previousRect: DOMRect): Promise<void> {
    await this.updateComplete;
    const tile = this.renderRoot.querySelector<HTMLElement>(".tile");
    if (!tile) {
      this.settling = false;
      this.settleLifted = false;
      return;
    }
    const deltaY = previousRect.top - tile.getBoundingClientRect().top;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.settling = false;
      this.settleLifted = false;
      return;
    }
    const animation = tile.animate(
      [
        { transform: `translateY(${deltaY}px)` },
        { transform: "translateY(0)" },
      ],
      {
        duration: SORTABLE_SETTLE_DURATION_MS,
        easing: "ease-out",
      },
    );
    this._settleAnimation = animation;
    try {
      await animation.finished;
    } catch {
      // A new interaction legitimately supersedes an in-flight settle.
    }
    if (this._settleAnimation !== animation) return;
    this._settleAnimation = undefined;
    this.settling = false;
    this.settleLifted = false;
  }

  public setDisplacement(offset: number): void {
    if (this.dragging || this._offset === offset) return;
    this._offset = offset;
    this.requestUpdate();
  }

  protected render() {
    return html`<div
      class="tile"
      style=${`--wzc-sortable-drag-offset: ${this._offset}px`}
    >
      <button
        class="handle"
        type="button"
        aria-label=${this.localize("sortable.reorder")}
        aria-keyshortcuts="ArrowUp ArrowDown"
        aria-pressed=${this.dragging ? "true" : "false"}
        @pointerdown=${this._handlePointerDown}
        @pointermove=${this._handlePointerMove}
        @pointerup=${this._handlePointerUp}
        @pointercancel=${this._handlePointerCancel}
        @lostpointercapture=${this._handleLostPointerCapture}
        @keydown=${this._handleKeyDown}
      >
        ${renderIcon("dragHorizontal")}
      </button>
      <div class="content"><slot></slot></div>
      <div class="actions"><slot name="actions"></slot></div>
    </div>`;
  }

  private _dispatchDrag(phase: SortableDragPhase, clientY: number): void {
    this.dispatchEvent(
      new CustomEvent<SortableDragDetail>(SORTABLE_DRAG_EVENT, {
        bubbles: true,
        composed: true,
        detail: { clientY, item: this, phase },
      }),
    );
  }

  private readonly _handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this._pointerId !== undefined) return;
    event.preventDefault();
    event.stopPropagation();
    this._settleAnimation?.cancel();
    this._settleAnimation = undefined;
    this.settling = false;
    this.settleLifted = false;
    this._pointerId = event.pointerId;
    this._pointerStartY = event.clientY;
    this.dragging = true;
    this._offset = 0;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this._dispatchDrag("start", event.clientY);
  };

  private readonly _handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) return;
    event.preventDefault();
    this._offset = event.clientY - this._pointerStartY;
    this.requestUpdate();
    this._dispatchDrag("move", event.clientY);
  };

  private readonly _handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) return;
    event.preventDefault();
    this._dispatchDrag("end", event.clientY);
  };

  private readonly _handleLostPointerCapture = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) return;
    this._dispatchDrag("cancel", event.clientY);
    this.resetDrag();
  };

  private readonly _handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) return;
    this._dispatchDrag("cancel", event.clientY);
    this.resetDrag();
  };

  private readonly _handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    this.dispatchEvent(
      new CustomEvent<SortableReorderDetail>(SORTABLE_KEYBOARD_MOVE_EVENT, {
        bubbles: true,
        composed: true,
        detail: {
          fromIndex: -1,
          itemKey: this.itemKey,
          toIndex: event.key === "ArrowUp" ? -1 : 1,
        },
      }),
    );
  };

  static styles = sortableTileStyles;
}

export class SortableList extends LitElement {
  private _dragged?: SortableTile;
  private _fromIndex = -1;
  private _toIndex = -1;
  private _itemRects: DOMRect[] = [];
  private _displacement = 0;
  private _settleFrame?: number;

  public connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("role", "list");
    this.addEventListener(
      SORTABLE_DRAG_EVENT,
      this._handleDrag as EventListener,
    );
    this.addEventListener(
      SORTABLE_KEYBOARD_MOVE_EVENT,
      this._handleKeyboardReorder as EventListener,
    );
  }

  public disconnectedCallback(): void {
    this.removeEventListener(
      SORTABLE_DRAG_EVENT,
      this._handleDrag as EventListener,
    );
    this.removeEventListener(
      SORTABLE_KEYBOARD_MOVE_EVENT,
      this._handleKeyboardReorder as EventListener,
    );
    this._cancelSettleFrame();
    this._resetDrag();
    super.disconnectedCallback();
  }

  protected render() {
    return html`<slot></slot>`;
  }

  private get _items(): SortableTile[] {
    const slot = this.renderRoot.querySelector("slot");
    return (slot?.assignedElements({ flatten: true }) ?? []).filter(
      (element): element is SortableTile => element instanceof SortableTile,
    );
  }

  private readonly _handleDrag = (
    event: CustomEvent<SortableDragDetail>,
  ): void => {
    event.stopPropagation();
    if (event.detail.phase === "start") {
      this._cancelSettleFrame();
      this._dragged = event.detail.item;
      const items = this._items;
      this._fromIndex = items.indexOf(event.detail.item);
      this._itemRects = items.map((item) => item.getBoundingClientRect());
      const draggedRect = this._itemRects[this._fromIndex];
      const nextRect = this._itemRects[this._fromIndex + 1];
      this._displacement = draggedRect
        ? draggedRect.height +
          Math.max(
            0,
            (nextRect?.top ?? draggedRect.bottom) - draggedRect.bottom,
          )
        : 0;
      this._setTarget(this._fromIndex);
      return;
    }
    if (event.detail.item !== this._dragged) return;
    if (event.detail.phase === "cancel") {
      this._resetDrag();
      return;
    }
    if (event.detail.phase === "move") {
      const items = this._items;
      let target = items.length - 1;
      for (let index = 0; index < items.length; index += 1) {
        const rect = this._itemRects[index];
        if (!rect) continue;
        if (event.detail.clientY < rect.top + rect.height / 2) {
          target = index;
          break;
        }
      }
      this._setTarget(target);
      return;
    }
    const detail = this._reorderDetail(this._fromIndex, this._toIndex);
    if (!detail || detail.fromIndex === detail.toIndex) {
      this._resetDrag();
      return;
    }
    const draggedKey = detail.itemKey;
    const previousRects = new Map(
      this._items.map((item) => [item.itemKey, item.getBoundingClientRect()]),
    );
    this._dragged?.releasePointer();
    this.dispatchEvent(
      new CustomEvent<SortableReorderDetail>(SORTABLE_REORDER_EVENT, {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
    this._settleFrame = requestAnimationFrame(() => {
      this._settleFrame = undefined;
      void this._settleReorder(previousRects, draggedKey);
    });
  };

  private readonly _handleKeyboardReorder = (
    event: CustomEvent<SortableReorderDetail>,
  ): void => {
    if (event.target === this) return;
    event.stopPropagation();
    const items = this._items;
    const fromIndex = items.findIndex(
      (item) => item.itemKey === event.detail.itemKey,
    );
    const toIndex = Math.max(
      0,
      Math.min(items.length - 1, fromIndex + event.detail.toIndex),
    );
    const detail = this._reorderDetail(fromIndex, toIndex);
    if (!detail || detail.fromIndex === detail.toIndex) return;
    this.dispatchEvent(
      new CustomEvent<SortableReorderDetail>(SORTABLE_REORDER_EVENT, {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  };

  private _reorderDetail(
    fromIndex: number,
    toIndex: number,
  ): SortableReorderDetail | undefined {
    const item = this._items[fromIndex];
    if (!item || toIndex < 0) return undefined;
    return { fromIndex, itemKey: item.itemKey, toIndex };
  }

  private _setTarget(index: number): void {
    this._toIndex = index;
    for (const [itemIndex, item] of this._items.entries()) {
      item.dropTarget = itemIndex === index && item !== this._dragged;
      const displaced =
        this._fromIndex < index &&
        itemIndex > this._fromIndex &&
        itemIndex <= index
          ? -this._displacement
          : this._fromIndex > index &&
              itemIndex >= index &&
              itemIndex < this._fromIndex
            ? this._displacement
            : 0;
      item.setDisplacement(displaced);
    }
  }

  private _resetDrag(): void {
    this._dragged?.resetDrag();
    for (const item of this._items) {
      item.dropTarget = false;
      item.setDisplacement(0);
    }
    this._dragged = undefined;
    this._fromIndex = -1;
    this._toIndex = -1;
    this._itemRects = [];
    this._displacement = 0;
  }

  private async _settleReorder(
    previousRects: ReadonlyMap<string, DOMRect>,
    draggedKey: string,
  ): Promise<void> {
    const items = this._items;
    for (const item of items) {
      item.dropTarget = false;
      item.prepareSettle(item.itemKey === draggedKey);
    }
    await Promise.all(items.map((item) => item.updateComplete));
    this._clearDragGeometry();
    await Promise.all(
      items.map(async (item) => {
        const previousRect = previousRects.get(item.itemKey);
        if (!previousRect) return;
        await item.settleFrom(previousRect);
      }),
    );
  }

  private _cancelSettleFrame(): void {
    if (this._settleFrame === undefined) return;
    cancelAnimationFrame(this._settleFrame);
    this._settleFrame = undefined;
  }

  private _clearDragGeometry(): void {
    this._dragged = undefined;
    this._fromIndex = -1;
    this._toIndex = -1;
    this._itemRects = [];
    this._displacement = 0;
  }

  static styles = sortableListStyles;
}

if (!customElements.get(SORTABLE_TILE_TAG)) {
  customElements.define(SORTABLE_TILE_TAG, SortableTile);
}
if (!customElements.get(SORTABLE_LIST_TAG)) {
  customElements.define(SORTABLE_LIST_TAG, SortableList);
}

declare global {
  interface HTMLElementTagNameMap {
    [SORTABLE_LIST_TAG]: SortableList;
    [SORTABLE_TILE_TAG]: SortableTile;
  }
}
