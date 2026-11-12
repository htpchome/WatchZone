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

type InlinePropertyState = readonly [value: string, priority: string];

type EditorDialogOverride = readonly [
  closeHandler: EventListener,
  previousPreviewWidth: InlinePropertyState,
  previousBackground: InlinePropertyState,
  previousBackdropFilter: InlinePropertyState,
];

const editorDialogOverrides = new WeakMap<HTMLElement, EditorDialogOverride>();
const closedEditorDialogs = new WeakSet<HTMLElement>();

function inlinePropertyState(
  element: HTMLElement,
  property: string,
): InlinePropertyState {
  return [
    element.style.getPropertyValue(property),
    element.style.getPropertyPriority(property),
  ];
}

function restoreInlineProperty(
  element: HTMLElement,
  property: string,
  previous: InlinePropertyState,
): void {
  if (previous[0]) {
    element.style.setProperty(property, previous[0], previous[1]);
  } else {
    element.style.removeProperty(property);
  }
}

function releaseEditorDialog(dialog: HTMLElement): void {
  const override = editorDialogOverrides.get(dialog);
  if (!override) return;
  dialog.removeEventListener(DIALOG_CLOSED_EVENT, override[0]);
  restoreInlineProperty(
    dialog,
    SECTION_PREVIEW_MAX_WIDTH_PROPERTY,
    override[1],
  );
  restoreInlineProperty(
    dialog,
    HA_DIALOG_SURFACE_BACKGROUND_PROPERTY,
    override[2],
  );
  restoreInlineProperty(
    dialog,
    HA_DIALOG_SURFACE_BACKDROP_FILTER_PROPERTY,
    override[3],
  );
  editorDialogOverrides.delete(dialog);
}

function retainEditorDialog(dialog: HTMLElement, host: HTMLElement): void {
  if (closedEditorDialogs.has(dialog)) return;
  const hostStyle = getComputedStyle(host);
  let override = editorDialogOverrides.get(dialog);
  if (!override) {
    const closeHandler = (event: Event): void => {
      if (event.target !== dialog) return;
      closedEditorDialogs.add(dialog);
      releaseEditorDialog(dialog);
    };
    override = [
      closeHandler,
      inlinePropertyState(dialog, SECTION_PREVIEW_MAX_WIDTH_PROPERTY),
      inlinePropertyState(dialog, HA_DIALOG_SURFACE_BACKGROUND_PROPERTY),
      inlinePropertyState(dialog, HA_DIALOG_SURFACE_BACKDROP_FILTER_PROPERTY),
    ];
    editorDialogOverrides.set(dialog, override);
    dialog.addEventListener(DIALOG_CLOSED_EVENT, closeHandler);
  }
  dialog.style.setProperty(
    SECTION_PREVIEW_MAX_WIDTH_PROPERTY,
    SECTION_PREVIEW_MAX_WIDTH,
    "important",
  );
  dialog.style.setProperty(
    HA_DIALOG_SURFACE_BACKGROUND_PROPERTY,
    hostStyle.getPropertyValue(EDITOR_DIALOG_BACKGROUND_PROPERTY).trim(),
    "important",
  );
  dialog.style.setProperty(
    HA_DIALOG_SURFACE_BACKDROP_FILTER_PROPERTY,
    hostStyle.getPropertyValue(EDITOR_DIALOG_BACKDROP_FILTER_PROPERTY).trim(),
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
    closedEditorDialogs.delete(this._dialog);
    retainEditorDialog(this._dialog, this._host);
  }

  public hostUpdated(): void {
    if (this._dialog) retainEditorDialog(this._dialog, this._host);
  }

  public hostDisconnected(): void {
    const dialog = this._dialog;
    if (dialog) {
      queueMicrotask(() => {
        if (dialog.isConnected) return;
        releaseEditorDialog(dialog);
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
