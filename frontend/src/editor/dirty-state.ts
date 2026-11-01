import { EDITOR_DIRTY_STATE_KEY } from "../core/constants";

export interface DirtyStateContext<T> {
  setState(state: T, key: string): void;
}

interface ContextRequestEvent<T> extends Event {
  callback?: (context: DirtyStateContext<T> | undefined) => void;
  context?: string;
}

interface HomeAssistantEditCardDialog<T> extends HTMLElement {
  _cardConfig?: T;
  _updateDirtyState?(config: T): void;
}

export function requestDirtyStateContext<T>(
  host: HTMLElement,
  callback: (context: DirtyStateContext<T>) => void,
): void {
  const request = new Event("context-request", {
    bubbles: true,
    composed: true,
  }) as ContextRequestEvent<T>;
  request.context = "dirtyState";
  request.callback = (context) => {
    if (context) {
      callback(context);
    }
  };
  host.dispatchEvent(request);
}

export function seedDirtyState<T>(
  context: DirtyStateContext<T>,
  baseline: T,
): void {
  context.setState(baseline, EDITOR_DIRTY_STATE_KEY);
}

export function updateDirtyState<T>(
  context: DirtyStateContext<T>,
  draft: T,
): void {
  context.setState(draft, EDITOR_DIRTY_STATE_KEY);
}

function findEditCardDialog<T>(
  host: HTMLElement,
): HomeAssistantEditCardDialog<T> | undefined {
  let node: Node | null = host;
  for (let depth = 0; node && depth < 16; depth += 1) {
    if (
      node instanceof HTMLElement &&
      node.tagName === "HUI-DIALOG-EDIT-CARD"
    ) {
      return node as HomeAssistantEditCardDialog<T>;
    }
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? root.host : node.parentNode;
  }
  return undefined;
}

export function commitDraftForSave<T>(host: HTMLElement, draft: T): boolean {
  const dialog = findEditCardDialog<T>(host);
  if (!dialog || !("_cardConfig" in dialog)) {
    return false;
  }
  dialog._cardConfig = draft;
  dialog._updateDirtyState?.(draft);
  return true;
}

export function isDialogSaveClick(host: HTMLElement, event: Event): boolean {
  const dialog = findEditCardDialog(host);
  if (!dialog) {
    return false;
  }
  const path = event.composedPath();
  return (
    path.includes(dialog) &&
    path.some(
      (item) => item instanceof HTMLElement && item.slot === "primaryAction",
    )
  );
}
