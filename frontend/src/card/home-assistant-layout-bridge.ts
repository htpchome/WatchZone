const SECTIONS_VIEW_TAG = "HUI-SECTIONS-VIEW";
const PANEL_VIEW_TAG = "HUI-PANEL-VIEW";
const PANEL_NATURAL_HEIGHT_CLASS = "panel-view-natural-height";
const EDGE_VALUE = "0px";

interface OwnedPadding {
  readonly element: HTMLElement;
  readonly priority: string;
  readonly value: string;
}

interface SectionsLayout {
  readonly container: HTMLElement;
  readonly view: HTMLElement;
  readonly wrapper: HTMLElement;
}

interface SectionsLayoutState {
  readonly declarations: readonly OwnedPadding[];
  readonly removedBlockSpacing: RemovedBlockSpacing;
  readonly owners: Set<HomeAssistantLayoutBridge>;
}

const sectionsLayoutStates = new WeakMap<HTMLElement, SectionsLayoutState>();

export interface RemovedBlockSpacing {
  readonly end: number;
  readonly start: number;
}

function composedParentElement(element: Element): Element | undefined {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : undefined;
}

function findAncestor(
  element: Element,
  tagName: string,
): HTMLElement | undefined {
  let current: Element | undefined = element;
  for (let depth = 0; current && depth < 24; depth += 1) {
    if (current.tagName === tagName) return current as HTMLElement;
    current = composedParentElement(current);
  }
  return undefined;
}

function ownedPadding(element: HTMLElement): OwnedPadding {
  return {
    element,
    priority: element.style.getPropertyPriority("padding"),
    value: element.style.getPropertyValue("padding"),
  };
}

function blockPadding(element: HTMLElement): RemovedBlockSpacing {
  const style = getComputedStyle(element);
  return {
    end: Number.parseFloat(style.paddingBottom) || 0,
    start: Number.parseFloat(style.paddingTop) || 0,
  };
}

function removedBlockSpacing(layout: SectionsLayout): RemovedBlockSpacing {
  const wrapper = blockPadding(layout.wrapper);
  const container = blockPadding(layout.container);
  return {
    end: wrapper.end + container.end,
    start: wrapper.start + container.start,
  };
}

function restorePadding(declaration: OwnedPadding): void {
  const { element } = declaration;
  if (
    element.style.getPropertyValue("padding") !== EDGE_VALUE ||
    element.style.getPropertyPriority("padding") !== ""
  ) {
    return;
  }
  if (declaration.value) {
    element.style.setProperty(
      "padding",
      declaration.value,
      declaration.priority,
    );
  } else {
    element.style.removeProperty("padding");
  }
}

/**
 * Owns the feature-detected mutation that removes HA's outer Sections padding.
 * Multiple cards in one view share the mutation until the last owner releases
 * it. Internal row and column gaps remain under Home Assistant ownership.
 */
export class HomeAssistantLayoutBridge {
  private _view?: HTMLElement;

  public constructor(private readonly _host: HTMLElement) {}

  public configure(edgeToEdge: boolean): RemovedBlockSpacing | undefined {
    this._host.classList.toggle(
      PANEL_NATURAL_HEIGHT_CLASS,
      Boolean(findAncestor(this._host, PANEL_VIEW_TAG)),
    );
    const layout = edgeToEdge ? this._sectionsLayout() : undefined;
    if (layout?.view === this._view) {
      return layout
        ? sectionsLayoutStates.get(layout.view)?.removedBlockSpacing
        : undefined;
    }
    this.release();
    if (!layout) return undefined;

    let state = sectionsLayoutStates.get(layout.view);
    if (!state) {
      state = {
        declarations: [
          ownedPadding(layout.wrapper),
          ownedPadding(layout.container),
        ],
        removedBlockSpacing: removedBlockSpacing(layout),
        owners: new Set(),
      };
      sectionsLayoutStates.set(layout.view, state);
    }
    state.owners.add(this);
    this._view = layout.view;
    for (const { element } of state.declarations) {
      element.style.setProperty("padding", EDGE_VALUE);
    }
    return state.removedBlockSpacing;
  }

  public release(): void {
    this._host.classList.remove(PANEL_NATURAL_HEIGHT_CLASS);
    const view = this._view;
    if (!view) return;
    this._view = undefined;

    const state = sectionsLayoutStates.get(view);
    if (!state) return;
    state.owners.delete(this);
    if (state.owners.size > 0) return;

    for (const declaration of state.declarations) {
      restorePadding(declaration);
    }
    sectionsLayoutStates.delete(view);
  }

  private _sectionsLayout(): SectionsLayout | undefined {
    const view = findAncestor(this._host, SECTIONS_VIEW_TAG);
    const root = view?.shadowRoot;
    const wrapper = root?.querySelector<HTMLElement>(".wrapper");
    const container = root?.querySelector<HTMLElement>(".container");
    return view && wrapper && container
      ? { container, view, wrapper }
      : undefined;
  }
}
