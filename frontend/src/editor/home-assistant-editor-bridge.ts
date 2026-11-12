import type { ReactiveController, ReactiveControllerHost } from "lit";

import {
  HA_DIALOG_SURFACE_BACKGROUND_PROPERTY,
  HA_DIALOG_SURFACE_BACKDROP_FILTER_PROPERTY,
} from "../styles/theme-tokens";

const EDIT_CARD_DIALOG_TAG = "HUI-DIALOG-EDIT-CARD";
const SECTION_PREVIEW_MAX_WIDTH = "100%";
const SECTION_PREVIEW_MAX_WIDTH_PROPERTY =
  "--ha-view-sections-column-max-width";
const DIALOG_CLOSED_EVENT = "dialog-closed";
const EDITOR_DIALOG_BACKGROUND_PROPERTY = "--wzc-editor-dialog-background";
const EDITOR_DIALOG_BACKDROP_FILTER_PROPERTY =
  "--wzc-editor-dialog-backdrop-filter";

interface HomeAssistantEditCardDialog<T> extends HTMLElement {
  _cardConfig?: T;
  _updateDirtyState?(config: T): void;
}

interface InlinePropertyState {
  readonly priority: string;
  readonly value: string;
}

interface PreviewWidthOverride {
  readonly closeHandler: EventListener;
  readonly previous: InlinePropertyState;
}

const previewWidthOverrides = new WeakMap<HTMLElement, PreviewWidthOverride>();

interface EditorSurfaceOverride {
  readonly closeHandler: EventListener;
  readonly previousBackground: InlinePropertyState;
  readonly previousBackdropFilter: InlinePropertyState;
}

const editorSurfaceOverrides = new WeakMap<
  HTMLElement,
  EditorSurfaceOverride
>();
const closedEditorSurfaceDialogs = new WeakSet<HTMLElement>();

function inlinePropertyState(
  element: HTMLElement,
  property: string,
): InlinePropertyState {
  return {
    priority: element.style.getPropertyPriority(property),
    value: element.style.getPropertyValue(property),
  };
}

function restoreInlineProperty(
  element: HTMLElement,
  property: string,
  previous: InlinePropertyState,
): void {
  if (previous.value) {
    element.style.setProperty(property, previous.value, previous.priority);
  } else {
    element.style.removeProperty(property);
  }
}

function releaseEditorSurface(dialog: HTMLElement): void {
  const override = editorSurfaceOverrides.get(dialog);
  if (!override) return;
  dialog.removeEventListener(DIALOG_CLOSED_EVENT, override.closeHandler);
  restoreInlineProperty(
    dialog,
    HA_DIALOG_SURFACE_BACKGROUND_PROPERTY,
    override.previousBackground,
  );
  restoreInlineProperty(
    dialog,
    HA_DIALOG_SURFACE_BACKDROP_FILTER_PROPERTY,
    override.previousBackdropFilter,
  );
  editorSurfaceOverrides.delete(dialog);
}

function retainEditorSurface(dialog: HTMLElement, host: HTMLElement): void {
  if (closedEditorSurfaceDialogs.has(dialog)) return;
  const hostStyle = getComputedStyle(host);
  const background = hostStyle
    .getPropertyValue(EDITOR_DIALOG_BACKGROUND_PROPERTY)
    .trim();
  if (!background) return;
  const backdropFilter =
    hostStyle.getPropertyValue(EDITOR_DIALOG_BACKDROP_FILTER_PROPERTY).trim() ||
    "none";
  let override = editorSurfaceOverrides.get(dialog);
  if (!override) {
    const closeHandler = (event: Event): void => {
      if (event.target !== dialog) return;
      closedEditorSurfaceDialogs.add(dialog);
      releaseEditorSurface(dialog);
    };
    override = {
      closeHandler,
      previousBackground: inlinePropertyState(
        dialog,
        HA_DIALOG_SURFACE_BACKGROUND_PROPERTY,
      ),
      previousBackdropFilter: inlinePropertyState(
        dialog,
        HA_DIALOG_SURFACE_BACKDROP_FILTER_PROPERTY,
      ),
    };
    editorSurfaceOverrides.set(dialog, override);
    dialog.addEventListener(DIALOG_CLOSED_EVENT, closeHandler);
  }
  dialog.style.setProperty(
    HA_DIALOG_SURFACE_BACKGROUND_PROPERTY,
    background,
    "important",
  );
  dialog.style.setProperty(
    HA_DIALOG_SURFACE_BACKDROP_FILTER_PROPERTY,
    backdropFilter,
    "important",
  );
}

function releasePreviewWidth(dialog: HTMLElement): void {
  const override = previewWidthOverrides.get(dialog);
  if (!override) return;
  dialog.removeEventListener(DIALOG_CLOSED_EVENT, override.closeHandler);
  const ownsPreviewWidth =
    dialog.style.getPropertyValue(SECTION_PREVIEW_MAX_WIDTH_PROPERTY).trim() ===
      SECTION_PREVIEW_MAX_WIDTH &&
    dialog.style.getPropertyPriority(SECTION_PREVIEW_MAX_WIDTH_PROPERTY) ===
      "important";
  if (ownsPreviewWidth) {
    if (override.previous.value) {
      dialog.style.setProperty(
        SECTION_PREVIEW_MAX_WIDTH_PROPERTY,
        override.previous.value,
        override.previous.priority,
      );
    } else {
      dialog.style.removeProperty(SECTION_PREVIEW_MAX_WIDTH_PROPERTY);
    }
  }
  previewWidthOverrides.delete(dialog);
}

function retainPreviewWidth(dialog: HTMLElement): void {
  if (previewWidthOverrides.has(dialog)) return;
  const closeHandler = (event: Event): void => {
    if (event.target !== dialog) return;
    releasePreviewWidth(dialog);
  };
  previewWidthOverrides.set(dialog, {
    closeHandler,
    previous: {
      priority: dialog.style.getPropertyPriority(
        SECTION_PREVIEW_MAX_WIDTH_PROPERTY,
      ),
      value: dialog.style.getPropertyValue(SECTION_PREVIEW_MAX_WIDTH_PROPERTY),
    },
  });
  dialog.addEventListener(DIALOG_CLOSED_EVENT, closeHandler);
  dialog.style.setProperty(
    SECTION_PREVIEW_MAX_WIDTH_PROPERTY,
    SECTION_PREVIEW_MAX_WIDTH,
    "important",
  );
}

/** Isolates the narrow Home Assistant edit-dialog compatibility boundary. */
export class HomeAssistantEditorBridge<T> implements ReactiveController {
  private _dialog?: HomeAssistantEditCardDialog<T>;

  public constructor(
    private readonly _host: ReactiveControllerHost & HTMLElement,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this._dialog = this._findDialog();
    if (!this._dialog) return;
    closedEditorSurfaceDialogs.delete(this._dialog);
    retainPreviewWidth(this._dialog);
    retainEditorSurface(this._dialog, this._host);
  }

  public hostUpdated(): void {
    if (this._dialog) retainEditorSurface(this._dialog, this._host);
  }

  public hostDisconnected(): void {
    const dialog = this._dialog;
    if (dialog) {
      queueMicrotask(() => {
        if (dialog.isConnected) return;
        releasePreviewWidth(dialog);
        releaseEditorSurface(dialog);
      });
    }
    this._dialog = undefined;
  }

  public commitDraftForSave(draft: T): boolean {
    const dialog = this._dialog ?? this._findDialog();
    if (!dialog || !("_cardConfig" in dialog)) return false;
    dialog._cardConfig = draft;
    dialog._updateDirtyState?.(draft);
    return true;
  }

  public isSaveClick(event: Event): boolean {
    const dialog = this._dialog ?? this._findDialog();
    if (!dialog) return false;
    const path = event.composedPath();
    return (
      path.includes(dialog) &&
      path.some(
        (item) => item instanceof HTMLElement && item.slot === "primaryAction",
      )
    );
  }

  private _findDialog(): HomeAssistantEditCardDialog<T> | undefined {
    let node: Node | null = this._host;
    for (let depth = 0; node && depth < 16; depth += 1) {
      if (
        node instanceof HTMLElement &&
        node.tagName === EDIT_CARD_DIALOG_TAG
      ) {
        return node as HomeAssistantEditCardDialog<T>;
      }
      const root = node.getRootNode();
      node = root instanceof ShadowRoot ? root.host : node.parentNode;
    }
    return undefined;
  }
}
