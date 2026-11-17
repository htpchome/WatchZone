const SECTIONS_VIEW_TAG = "HUI-SECTIONS-VIEW";
const EDGE_VALUE = "0px";

interface OwnedDeclaration {
  readonly priority: string;
  readonly value: string;
}

interface SectionsContainerState {
  readonly declaration: OwnedDeclaration;
  readonly owners: Set<HomeAssistantLayoutBridge>;
}

const sectionsContainerStates = new WeakMap<
  HTMLElement,
  SectionsContainerState
>();

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

function inlinePadding(style: CSSStyleDeclaration): OwnedDeclaration {
  return {
    priority: style.getPropertyPriority("padding"),
    value: style.getPropertyValue("padding"),
  };
}

export function edgeToEdgeEnabled(
  phoneEnabled: boolean,
  nonPhoneEnabled: boolean,
  isPhone: boolean,
): boolean {
  return isPhone ? phoneEnabled : nonPhoneEnabled;
}

/**
 * Owns the feature-detected mutation that removes HA's outer Sections row
 * padding. Multiple cards in one view share the mutation until the last owner
 * releases it.
 */
export class HomeAssistantLayoutBridge {
  private _container?: HTMLElement;

  public constructor(private readonly _host: HTMLElement) {}

  public configure(edgeToEdge: boolean): void {
    const container = edgeToEdge ? this._sectionsContainer() : undefined;
    if (container === this._container) return;
    this.release();
    if (!container) return;

    let state = sectionsContainerStates.get(container);
    if (!state) {
      state = {
        declaration: inlinePadding(container.style),
        owners: new Set(),
      };
      sectionsContainerStates.set(container, state);
    }
    state.owners.add(this);
    this._container = container;
    container.style.setProperty("padding", EDGE_VALUE);
  }

  public release(): void {
    const container = this._container;
    if (!container) return;
    this._container = undefined;

    const state = sectionsContainerStates.get(container);
    if (!state) return;
    state.owners.delete(this);
    if (state.owners.size > 0) return;

    const { style } = container;
    if (
      style.getPropertyValue("padding") === EDGE_VALUE &&
      style.getPropertyPriority("padding") === ""
    ) {
      if (state.declaration.value) {
        style.setProperty(
          "padding",
          state.declaration.value,
          state.declaration.priority,
        );
      } else {
        style.removeProperty("padding");
      }
    }
    sectionsContainerStates.delete(container);
  }

  private _sectionsContainer(): HTMLElement | undefined {
    return (
      findSectionsView(this._host)?.shadowRoot?.querySelector<HTMLElement>(
        ".container",
      ) ?? undefined
    );
  }
}
