const SECTIONS_VIEW_TAG = "HUI-SECTIONS-VIEW";
const PANEL_VIEW_TAG = "HUI-PANEL-VIEW";
const VIEW_CONTAINER_TAG = "HUI-VIEW-CONTAINER";
const PANEL_NATURAL_HEIGHT_CLASS = "panel-view-natural-height";
const EDGE_VALUE = "0px";
const DYNAMIC_VIEWPORT_MIN_HEIGHT = "100dvh";

interface OwnedDeclaration {
  readonly element: HTMLElement;
  readonly ownedValue: string;
  readonly priority: string;
  readonly property: string;
  readonly value: string;
}

interface SectionsLayout {
  readonly container: HTMLElement;
  readonly view: HTMLElement;
  readonly wrapper: HTMLElement;
}

interface SharedLayoutState {
  readonly declarations: readonly OwnedDeclaration[];
  readonly owners: Set<HomeAssistantLayoutBridge>;
}

type SharedLayoutStates = WeakMap<HTMLElement, SharedLayoutState>;

const sectionsLayoutStates: SharedLayoutStates = new WeakMap();
const viewportLayoutStates: SharedLayoutStates = new WeakMap();

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

function ownedDeclaration(
  element: HTMLElement,
  property: string,
  ownedValue: string,
): OwnedDeclaration {
  return {
    element,
    ownedValue,
    priority: element.style.getPropertyPriority(property),
    property,
    value: element.style.getPropertyValue(property),
  };
}

function applyDeclaration(declaration: OwnedDeclaration): void {
  declaration.element.style.setProperty(
    declaration.property,
    declaration.ownedValue,
  );
}

function restoreDeclaration(declaration: OwnedDeclaration): void {
  const { element, property } = declaration;
  if (
    element.style.getPropertyValue(property) !== declaration.ownedValue ||
    element.style.getPropertyPriority(property) !== ""
  ) {
    return;
  }
  if (declaration.value) {
    element.style.setProperty(
      property,
      declaration.value,
      declaration.priority,
    );
  } else {
    element.style.removeProperty(property);
  }
}

function acquireLayout(
  states: SharedLayoutStates,
  key: HTMLElement,
  declarations: readonly OwnedDeclaration[],
  owner: HomeAssistantLayoutBridge,
): void {
  let state = states.get(key);
  if (!state) {
    state = { declarations, owners: new Set() };
    states.set(key, state);
  }
  state.owners.add(owner);
  for (const declaration of state.declarations) applyDeclaration(declaration);
}

function releaseLayout(
  states: SharedLayoutStates,
  key: HTMLElement,
  owner: HomeAssistantLayoutBridge,
): void {
  const state = states.get(key);
  if (!state) return;
  state.owners.delete(owner);
  if (state.owners.size > 0) return;
  for (const declaration of state.declarations) restoreDeclaration(declaration);
  states.delete(key);
}

/**
 * Owns the feature-detected mutation that removes HA's outer Sections padding.
 * Multiple cards in one view share the mutation until the last owner releases
 * it. Internal row and column gaps remain under Home Assistant ownership.
 */
export class HomeAssistantLayoutBridge {
  private _view?: HTMLElement;
  private _viewportContainer?: HTMLElement;

  public constructor(private readonly _host: HTMLElement) {}

  public configure(
    edgeToEdge: boolean,
    constrainToDynamicViewport = false,
  ): void {
    this._host.classList.toggle(
      PANEL_NATURAL_HEIGHT_CLASS,
      Boolean(findAncestor(this._host, PANEL_VIEW_TAG)),
    );
    const layout = edgeToEdge ? this._sectionsLayout() : undefined;
    this._configureSections(layout);
    this._configureViewport(
      constrainToDynamicViewport
        ? findAncestor(this._host, VIEW_CONTAINER_TAG)
        : undefined,
    );
  }

  public release(): void {
    this._host.classList.remove(PANEL_NATURAL_HEIGHT_CLASS);
    this._configureSections(undefined);
    this._configureViewport(undefined);
  }

  private _configureSections(layout?: SectionsLayout): void {
    if (layout?.view === this._view) return;
    const previousView = this._view;
    this._view = undefined;
    if (previousView) releaseLayout(sectionsLayoutStates, previousView, this);
    if (!layout) return;

    acquireLayout(
      sectionsLayoutStates,
      layout.view,
      [
        ownedDeclaration(layout.wrapper, "padding", EDGE_VALUE),
        ownedDeclaration(layout.container, "padding", EDGE_VALUE),
      ],
      this,
    );
    this._view = layout.view;
  }

  private _configureViewport(container?: HTMLElement): void {
    if (container === this._viewportContainer) return;
    const previousContainer = this._viewportContainer;
    this._viewportContainer = undefined;
    if (previousContainer) {
      releaseLayout(viewportLayoutStates, previousContainer, this);
    }
    if (!container) return;

    acquireLayout(
      viewportLayoutStates,
      container,
      [ownedDeclaration(container, "min-height", DYNAMIC_VIEWPORT_MIN_HEIGHT)],
      this,
    );
    this._viewportContainer = container;
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
