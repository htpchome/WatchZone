const SECTIONS_VIEW_TAG = "HUI-SECTIONS-VIEW";
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
  readonly owners: Set<HomeAssistantLayoutBridge>;
}

const sectionsLayoutStates = new WeakMap<HTMLElement, SectionsLayoutState>();

function composedParentElement(element: Element): Element | undefined {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : undefined;
}

function findSectionsView(element: Element): HTMLElement | undefined {
  let current: Element | undefined = element;
  for (let depth = 0; current && depth < 24; depth += 1) {
    if (current.tagName === SECTIONS_VIEW_TAG) return current as HTMLElement;
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

  public configure(edgeToEdge: boolean): void {
    const layout = edgeToEdge ? this._sectionsLayout() : undefined;
    if (layout?.view === this._view) return;
    this.release();
    if (!layout) return;

    let state = sectionsLayoutStates.get(layout.view);
    if (!state) {
      state = {
        declarations: [
          ownedPadding(layout.wrapper),
          ownedPadding(layout.container),
        ],
        owners: new Set(),
      };
      sectionsLayoutStates.set(layout.view, state);
    }
    state.owners.add(this);
    this._view = layout.view;
    for (const { element } of state.declarations) {
      element.style.setProperty("padding", EDGE_VALUE);
    }
  }

  public release(): void {
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
    const view = findSectionsView(this._host);
    const root = view?.shadowRoot;
    const wrapper = root?.querySelector<HTMLElement>(".wrapper");
    const container = root?.querySelector<HTMLElement>(".container");
    return view && wrapper && container
      ? { container, view, wrapper }
      : undefined;
  }
}
