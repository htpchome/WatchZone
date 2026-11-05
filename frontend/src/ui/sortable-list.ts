import { html, LitElement } from "lit";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";

import {
  SORTABLE_DRAG_EVENT,
  SORTABLE_KEYBOARD_MOVE_EVENT,
  SORTABLE_LIST_TAG,
  SORTABLE_REORDER_EVENT,
  SORTABLE_TILE_TAG,
} from "../core/constants";
import { englishLocalize, type LocalizeFunction } from "../core/localization";
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
    localize: { attribute: false },
  };

  public dragging = false;
  public dropTarget = false;
  public itemKey = "";
  public localize: LocalizeFunction = englishLocalize;
  private _offset = 0;
  private _disposeDrag?: () => void;

  public connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("role", "listitem");
  }

  public disconnectedCallback(): void {
    this._disposeDrag?.();
    this._disposeDrag = undefined;
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    const tile = this.renderRoot.querySelector<HTMLElement>(".tile");
    const handle = this.renderRoot.querySelector<HTMLElement>(".handle");
    if (!tile || !handle) return;
    this._disposeDrag = draggable({
      element: tile,
      dragHandle: handle,
      getInitialData: () => ({ itemKey: this.itemKey }),
      onDragStart: ({ location }) => {
        this.dragging = true;
        this._offset = 0;
        this._dispatchDrag("start", location.initial.input.clientY);
      },
      onDrag: ({ location }) => {
        this._dispatchDrag("move", location.current.input.clientY);
      },
      onDrop: ({ location }) => {
        this._dispatchDrag("end", location.current.input.clientY);
        this.resetDrag();
      },
    });
  }

  public resetDrag(): void {
    this.dragging = false;
    this._offset = 0;
    this.requestUpdate();
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
