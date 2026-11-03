import { html, LitElement } from "lit";

import {
  SORTABLE_DRAG_EVENT,
  SORTABLE_KEYBOARD_MOVE_EVENT,
  SORTABLE_LIST_TAG,
  SORTABLE_REORDER_EVENT,
  SORTABLE_TILE_TAG,
} from "../core/constants";
import { renderIcon } from "./icons";
import { sortableListStyles, sortableTileStyles } from "./sortable-list.styles";

type SortableDragPhase = "end" | "move" | "start";

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
    dropTarget: {
      attribute: "drop-target",
      reflect: true,
      type: Boolean,
    },
    itemKey: { attribute: "item-key" },
  };

  public dragging = false;
  public dropTarget = false;
  public itemKey = "";
  private _offset = 0;
  private _pointerId?: number;
  private _startY = 0;

  public connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("role", "listitem");
  }

  public resetDrag(): void {
    this.dragging = false;
    this._offset = 0;
    this._pointerId = undefined;
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
        aria-label="Reorder item"
        aria-keyshortcuts="ArrowUp ArrowDown"
        aria-pressed=${this.dragging ? "true" : "false"}
        @pointerdown=${this._handlePointerDown}
        @pointermove=${this._handlePointerMove}
        @pointerup=${this._handlePointerUp}
        @pointercancel=${this._handlePointerCancel}
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
    if (event.pointerType === "mouse" && event.button !== 0) return;
    this._pointerId = event.pointerId;
    this._startY = event.clientY;
    this._offset = 0;
    this.dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this._dispatchDrag("start", event.clientY);
    event.preventDefault();
  };

  private readonly _handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) return;
    this._offset = event.clientY - this._startY;
    this.requestUpdate();
    this._dispatchDrag("move", event.clientY);
    event.preventDefault();
  };

  private readonly _handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) return;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(
      event.pointerId,
    );
    this._dispatchDrag("end", event.clientY);
    this.resetDrag();
  };

  private readonly _handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) return;
    this._dispatchDrag("end", this._startY);
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
      this._dragged = event.detail.item;
      this._fromIndex = this._items.indexOf(event.detail.item);
      this._setTarget(this._fromIndex);
      return;
    }
    if (event.detail.item !== this._dragged) return;
    if (event.detail.phase === "move") {
      const items = this._items;
      let target = items.length - 1;
      for (let index = 0; index < items.length; index += 1) {
        const rect = items[index].getBoundingClientRect();
        if (event.detail.clientY < rect.top + rect.height / 2) {
          target = index;
          break;
        }
      }
      this._setTarget(target);
      return;
    }
    const detail = this._reorderDetail(this._fromIndex, this._toIndex);
    this._resetDrag();
    if (detail && detail.fromIndex !== detail.toIndex) {
      this.dispatchEvent(
        new CustomEvent<SortableReorderDetail>(SORTABLE_REORDER_EVENT, {
          bubbles: true,
          composed: true,
          detail,
        }),
      );
    }
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
    }
  }

  private _resetDrag(): void {
    this._dragged?.resetDrag();
    for (const item of this._items) item.dropTarget = false;
    this._dragged = undefined;
    this._fromIndex = -1;
    this._toIndex = -1;
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
