const SECTIONS_VIEW_TAG = "HUI-SECTIONS-VIEW";
const EDGE_VALUE = "0px";

interface OwnedDeclaration {
  readonly name: "margin" | "padding";
  readonly priority: string;
  readonly value: string;
}

function composedParentElement(element: Element): Element | undefined {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : undefined;
}

function isInSectionsView(element: Element): boolean {
  let current: Element | undefined = element;
  for (let depth = 0; current && depth < 24; depth += 1) {
    if (current.tagName === SECTIONS_VIEW_TAG) return true;
    current = composedParentElement(current);
  }
  return false;
}

function inlineDeclaration(
  style: CSSStyleDeclaration,
  name: OwnedDeclaration["name"],
): OwnedDeclaration {
  return {
    name,
    priority: style.getPropertyPriority(name),
    value: style.getPropertyValue(name),
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
 * Owns the feature-detected mutation that removes HA's immediate Sections
 * card-wrapper spacing. It never changes the Sections view itself.
 */
export class HomeAssistantLayoutBridge {
  private _declarations?: readonly OwnedDeclaration[];
  private _wrapper?: HTMLElement;

  public constructor(private readonly _host: HTMLElement) {}

  public configure(edgeToEdge: boolean): void {
    const wrapper = edgeToEdge ? this._sectionsWrapper() : undefined;
    if (wrapper === this._wrapper) return;
    this.release();
    if (!wrapper) return;

    this._wrapper = wrapper;
    this._declarations = [
      inlineDeclaration(wrapper.style, "margin"),
      inlineDeclaration(wrapper.style, "padding"),
    ];
    wrapper.style.setProperty("margin", EDGE_VALUE);
    wrapper.style.setProperty("padding", EDGE_VALUE);
  }

  public release(): void {
    if (!this._wrapper || !this._declarations) return;
    const { style } = this._wrapper;
    for (const declaration of this._declarations) {
      if (
        style.getPropertyValue(declaration.name) !== EDGE_VALUE ||
        style.getPropertyPriority(declaration.name) !== ""
      ) {
        continue;
      }
      if (declaration.value) {
        style.setProperty(
          declaration.name,
          declaration.value,
          declaration.priority,
        );
      } else {
        style.removeProperty(declaration.name);
      }
    }
    this._wrapper = undefined;
    this._declarations = undefined;
  }

  private _sectionsWrapper(): HTMLElement | undefined {
    const wrapper = this._host.parentElement;
    if (
      !wrapper ||
      wrapper.tagName === SECTIONS_VIEW_TAG ||
      !isInSectionsView(wrapper)
    ) {
      return undefined;
    }
    return wrapper;
  }
}
