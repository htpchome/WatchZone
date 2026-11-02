import { EDITOR_DIRTY_STATE_KEY } from "../core/constants";

export interface DirtyStateContext<T> {
  setState(state: T, key: string): void;
}

interface ContextRequestEvent<T> extends Event {
  callback?: (context: DirtyStateContext<T> | undefined) => void;
  context?: string;
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
