import { EDITOR_DIRTY_STATE_KEY } from "../core/constants";

export interface DirtyStateContext<T> {
  setState(state: T, key: string): void;
}

interface ContextRequestEvent<T> extends Event {
  callback?: (
    context: DirtyStateContext<T> | undefined,
    unsubscribe?: () => void,
  ) => void;
  context?: string;
  subscribe?: boolean;
}

interface HomeAssistantEditCardDialog<T> extends HTMLElement {
  _cardConfig?: T;
  _updateDirtyState?(config: T): void;
}

export function requestDirtyStateContext<T>(
  host: HTMLElement,
  callback: (context: DirtyStateContext<T>, unsubscribe?: () => void) => void,
): void {
  const request = new Event("context-request", {
    bubbles: true,
    composed: true,
  }) as ContextRequestEvent<T>;
  request.context = "dirtyState";
  request.subscribe = true;
  request.callback = (context, unsubscribe) => {
    if (context) {
      callback(context, unsubscribe);
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

export function commitDraftForSave<T>(host: HTMLElement, draft: T): void {
  const dialog = findEditCardDialog<T>(host);
  if (!dialog) {
    return;
  }
  dialog._cardConfig = draft;
  dialog._updateDirtyState?.(draft);
}

export function isDialogSaveClick(host: HTMLElement, event: Event): boolean {
  const dialog = findEditCardDialog(host);
  const path = event.composedPath();
  return Boolean(
    dialog &&
    path.includes(dialog) &&
    path.some(
      (item) => item instanceof HTMLElement && item.slot === "primaryAction",
    ),
  );
}
