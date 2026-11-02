import type { ReactiveController, ReactiveControllerHost } from "lit";

const EDIT_CARD_DIALOG_TAG = "HUI-DIALOG-EDIT-CARD";
const SECTION_PREVIEW_MAX_WIDTH = "100%";
const SECTION_PREVIEW_MAX_WIDTH_PROPERTY =
  "--ha-view-sections-column-max-width";

interface HomeAssistantEditCardDialog<T> extends HTMLElement {
  _cardConfig?: T;
  _updateDirtyState?(config: T): void;
}

interface InlinePropertyState {
  readonly priority: string;
  readonly value: string;
}

/** Isolates the narrow Home Assistant edit-dialog compatibility boundary. */
export class HomeAssistantEditorBridge<T> implements ReactiveController {
  private _dialog?: HomeAssistantEditCardDialog<T>;
  private _previousPreviewWidth?: InlinePropertyState;

  public constructor(
    private readonly _host: ReactiveControllerHost & HTMLElement,
  ) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this._dialog = this._findDialog();
    if (!this._dialog) return;
    this._previousPreviewWidth = {
      priority: this._dialog.style.getPropertyPriority(
        SECTION_PREVIEW_MAX_WIDTH_PROPERTY,
      ),
      value: this._dialog.style.getPropertyValue(
        SECTION_PREVIEW_MAX_WIDTH_PROPERTY,
      ),
    };
    this._dialog.style.setProperty(
      SECTION_PREVIEW_MAX_WIDTH_PROPERTY,
      SECTION_PREVIEW_MAX_WIDTH,
      "important",
    );
  }

  public hostDisconnected(): void {
    const ownsPreviewWidth = Boolean(
      this._dialog &&
      this._dialog.style
        .getPropertyValue(SECTION_PREVIEW_MAX_WIDTH_PROPERTY)
        .trim() === SECTION_PREVIEW_MAX_WIDTH &&
      this._dialog.style.getPropertyPriority(
        SECTION_PREVIEW_MAX_WIDTH_PROPERTY,
      ) === "important",
    );
    if (this._dialog && this._previousPreviewWidth && ownsPreviewWidth) {
      if (this._previousPreviewWidth.value) {
        this._dialog.style.setProperty(
          SECTION_PREVIEW_MAX_WIDTH_PROPERTY,
          this._previousPreviewWidth.value,
          this._previousPreviewWidth.priority,
        );
      } else {
        this._dialog.style.removeProperty(SECTION_PREVIEW_MAX_WIDTH_PROPERTY);
      }
    }
    this._dialog = undefined;
    this._previousPreviewWidth = undefined;
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
