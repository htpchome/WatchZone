import { html, LitElement, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";

import {
  deleteExport,
  renameExport,
  type ExportItem,
} from "../../../api/exports";
import { EXPORTS_TAG } from "../../../core/constants";
import {
  formatHomeAssistantEventDate,
  formatHomeAssistantTime,
} from "../../../core/date-time";
import type { HomeAssistantApi } from "../../../core/home-assistant";
import {
  isExportJob,
  type ExportJob,
  type ExportLibraryItem,
} from "../../../features/exports";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../../core/localization";
import { openRecordedMedia } from "../../../core/recorded-media";
import { buttonBaseStyles } from "../../../ui/button.styles";
import { renderIcon } from "../../../ui/icons";
import { ToastManager } from "../../../ui/toast-manager";
import "../../../ui/toast-region";
import type { CameraSelectionContext } from "../../camera-selection-context";
import type { ExportFilterContext } from "../../export-filter-context";
import { ExportsController } from "./exports.controller";
import { exportsStyles } from "./exports.styles";

/** Mixed-camera persistent export library. */
export class ExportsModule extends LitElement {
  public static properties = {
    api: { attribute: false },
    cameraSelection: { attribute: false },
    exportFilter: { attribute: false },
    hoverPreviewEnabled: { attribute: false, type: Boolean },
    localize: { attribute: false },
    placeableId: { attribute: false },
    targetModuleId: { attribute: false },
    _deleting: { state: true },
    _draftTitle: { state: true },
    _editing: { state: true },
    _mutating: { state: true },
  };

  public api?: HomeAssistantApi;
  public cameraSelection?: CameraSelectionContext;
  public exportFilter?: ExportFilterContext;
  public hoverPreviewEnabled = true;
  public localize: LocalizeFunction = englishLocalize;
  public placeableId = "";
  public targetModuleId = "";

  private _deleting?: ExportItem;
  private _draftTitle = "";
  private _editing?: ExportItem;
  private _hoveredPreviewId?: string;
  private _mutating = false;
  private readonly _toasts = new ToastManager(this);
  private readonly _exports = new ExportsController(
    this,
    () => ({
      api: this.api,
      cameraSelection: this.cameraSelection,
      exportFilter: this.exportFilter,
      placeableId: this.placeableId,
      targetModuleId: this.targetModuleId,
    }),
    () =>
      this._toasts.error(this.localize("exports.load_failed"), {
        key: "exports-load-failed",
      }),
  );

  protected updated(): void {
    const dialog = this.shadowRoot?.querySelector<HTMLDialogElement>("dialog");
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  protected render() {
    const items = this._exports.filteredItems();
    return html`<div class="viewport">
        ${
          this._exports.loading && this._exports.items.length === 0
            ? html`<div class="empty" aria-busy="true">
                ${this.localize("exports.loading")}
              </div>`
            : items.length === 0
              ? html`<div class="empty">${this.localize("exports.empty")}</div>`
              : html`<div
                  class="list"
                  aria-label=${this.localize("exports.list")}
                >
                  ${repeat(
                    items,
                    (item) =>
                      isExportJob(item)
                        ? item.requestId
                        : `${item.entity_id}:${item.id}`,
                    (item) => this._renderItem(item),
                  )}
                </div>`
        }
      </div>
      <wzc-toast-region .notices=${this._toasts.notices}></wzc-toast-region>
      ${this._renderDialog()}`;
  }

  private _renderItem(item: ExportLibraryItem) {
    if (isExportJob(item)) return this._renderDraft(item);
    const camera = this._exports.cameraLabel(item.entity_id, item.camera);
    const title = this.localize("exports.open", { title: item.name });
    return html`<article
      class="tile"
      @pointermove=${(event: PointerEvent) =>
        this._updateHoverPreview(event, item)}
      @pointerleave=${() => this._clearHoverPreview(item.id)}
    >
      ${
        item.in_progress
          ? nothing
          : html`<button
              class="tile-player"
              data-recorded-media-opener="true"
              type="button"
              title=${title}
              aria-label=${title}
              @click=${() => this._open(item)}
            ></button>`
      }
      <div class="thumbnail">
        ${
          item.in_progress
            ? renderIcon("export")
            : html`<img
                src=${
                  this.api?.resolveUrl(item.thumbnail_path) ??
                  item.thumbnail_path
                }
                alt=""
              />`
        }
        ${
          !item.in_progress &&
          this.hoverPreviewEnabled &&
          this._hoveredPreviewId === item.id
            ? html`<video
                class="hover-preview"
                src=${this.api?.resolveUrl(item.video_path) ?? item.video_path}
                autoplay
                loop
                muted
                playsinline
                preload="metadata"
                @loadedmetadata=${this._setPreviewRate}
              ></video>`
            : nothing
        }
        ${
          item.in_progress
            ? html`<span class="processing"
                >${this.localize("exports.processing")}</span
              >`
            : nothing
        }
      </div>
      <div class="details">
        <span class="title">${item.name}</span>
        <span class="metadata"
          >${camera} ·
          ${formatHomeAssistantEventDate(
            new Date(item.created_time * 1000),
            this.api?.locale,
          )}
          ${formatHomeAssistantTime(
            new Date(item.created_time * 1000),
            this.api?.locale,
          )}</span
        >
      </div>
      <div class="actions">
        ${this._action(
          "mdi:pencil",
          this.localize("exports.edit_title"),
          () => this._beginEdit(item),
          item.in_progress,
        )}
        ${this._action(
          "mdi:delete",
          this.localize("exports.remove"),
          () => this._beginDelete(item),
          item.in_progress,
          "delete",
        )}
        ${this._action(
          "mdi:download",
          this.localize("exports.download"),
          () => void this._download(item),
          item.in_progress,
        )}
        ${this._action(
          "mdi:briefcase-plus-outline",
          this.localize("exports.add_to_case_coming_soon"),
          () => undefined,
          true,
        )}
      </div>
    </article>`;
  }

  private _renderDraft(job: ExportJob) {
    const camera = this._exports.cameraLabel(job.entityId, job.camera);
    const failed = job.status === "failed";
    return html`<article class=${`tile draft ${failed ? "failed" : ""}`}>
      <div class="thumbnail">${renderIcon("export")}</div>
      <div class="details">
        <span class="title">${job.name}</span>
        <span class="metadata"
          >${camera} ·
          ${formatHomeAssistantEventDate(
            new Date(job.createdTime * 1000),
            this.api?.locale,
          )}
          ${formatHomeAssistantTime(
            new Date(job.createdTime * 1000),
            this.api?.locale,
          )}</span
        >
        ${
          failed
            ? html`<span class="draft-status failed"
                >${this.localize("reviews.export_failed_status")}</span
              >`
            : html`<span class="draft-status progress">
                <ha-spinner size="small"></ha-spinner>
                <span>${this.localize("exports.processing")}</span>
              </span>`
        }
      </div>
      <div class="actions" aria-hidden="true"></div>
    </article>`;
  }

  private _action(
    icon: string,
    label: string,
    action: () => void,
    disabled: boolean,
    className = "",
  ) {
    return html`<button
      class=${`action wzc-icon-button ${className}`}
      type="button"
      title=${label}
      aria-label=${label}
      ?disabled=${disabled}
      @click=${action}
    >
      <ha-icon icon=${icon}></ha-icon>
    </button>`;
  }

  private _renderDialog() {
    if (this._editing) {
      return html`<dialog @close=${this._closeDialog}>
        <form class="dialog-content" @submit=${this._saveTitle}>
          <h3>${this.localize("exports.edit_title")}</h3>
          <input
            name="title"
            maxlength="256"
            .value=${this._draftTitle}
            aria-label=${this.localize("exports.title")}
            @input=${(event: InputEvent) => {
              this._draftTitle = (
                event.currentTarget as HTMLInputElement
              ).value;
            }}
          />
          <div class="dialog-actions">
            <button
              class="wzc-button"
              type="button"
              @click=${this._closeDialog}
            >
              ${this.localize("exports.cancel")}
            </button>
            <button
              class="wzc-button primary"
              type="submit"
              ?disabled=${this._mutating || !this._draftTitle.trim()}
            >
              ${this.localize("exports.save")}
            </button>
          </div>
        </form>
      </dialog>`;
    }
    if (this._deleting) {
      return html`<dialog @close=${this._closeDialog}>
        <section class="dialog-content">
          <h3>${this.localize("exports.remove_title")}</h3>
          <p>
            ${this.localize("exports.remove_confirm", {
              title: this._deleting.name,
            })}
          </p>
          <div class="dialog-actions">
            <button
              class="wzc-button"
              type="button"
              @click=${this._closeDialog}
            >
              ${this.localize("exports.cancel")}
            </button>
            <button
              class="wzc-button danger"
              type="button"
              ?disabled=${this._mutating}
              @click=${this._confirmDelete}
            >
              ${this.localize("exports.remove")}
            </button>
          </div>
        </section>
      </dialog>`;
    }
    return nothing;
  }

  private _beginEdit(item: ExportItem): void {
    this._editing = item;
    this._draftTitle = item.name;
  }

  private _beginDelete(item: ExportItem): void {
    this._deleting = item;
  }

  private readonly _closeDialog = (): void => {
    if (this._mutating) return;
    this._editing = undefined;
    this._deleting = undefined;
    this._draftTitle = "";
  };

  private readonly _saveTitle = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const api = this.api;
    const item = this._editing;
    const name = this._draftTitle.trim();
    if (!api || !item || !name || this._mutating) return;
    this._mutating = true;
    try {
      await renameExport(api, item, name);
      this._exports.renameItem(item.entity_id, item.id, name);
      this._mutating = false;
      this._closeDialog();
      this._toasts.success(this.localize("exports.rename_success"), {
        key: "exports-rename",
      });
    } catch {
      this._mutating = false;
      this._toasts.error(this.localize("exports.rename_failed"), {
        key: "exports-rename",
      });
    }
  };

  private readonly _confirmDelete = async (): Promise<void> => {
    const api = this.api;
    const item = this._deleting;
    if (!api || !item || this._mutating) return;
    this._mutating = true;
    try {
      await deleteExport(api, item);
      this._mutating = false;
      this._closeDialog();
      this._exports.refresh();
      this._toasts.success(this.localize("exports.remove_success"), {
        key: "exports-remove",
      });
    } catch {
      this._mutating = false;
      this._toasts.error(this.localize("exports.remove_failed"), {
        key: "exports-remove",
      });
    }
  };

  private async _download(item: ExportItem): Promise<void> {
    const api = this.api;
    if (!api) return;
    try {
      const signed = await api.callWS<{ readonly path?: string }>({
        type: "auth/sign_path",
        path: item.download_path,
        expires: 3600,
      });
      const anchor = document.createElement("a");
      anchor.href = api.resolveUrl(signed.path ?? item.download_path);
      anchor.download = `${item.name}.mp4`;
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }
    } catch {
      this._toasts.error(this.localize("exports.download_failed"), {
        key: "exports-download",
      });
    }
  }

  private _open(item: ExportItem): void {
    openRecordedMedia(this, {
      id: `${item.entity_id}:${item.id}`,
      kind: "video",
      posterUrl: this.api?.resolveUrl(item.thumbnail_path),
      preferredTransport: "file",
      presentation: "export",
      sources: [
        {
          content_type: "video/mp4",
          transport: "file",
          url: item.video_path,
        },
      ],
      title: item.name,
    });
  }

  private _updateHoverPreview(event: PointerEvent, item: ExportItem): void {
    if (
      event.pointerType !== "mouse" ||
      !this.hoverPreviewEnabled ||
      item.in_progress
    )
      return;
    const thumbnail = (event.currentTarget as HTMLElement).querySelector(
      ".thumbnail",
    );
    if (!(thumbnail instanceof HTMLElement)) return;
    const bounds = thumbnail.getBoundingClientRect();
    const hovered =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom;
    const nextId = hovered ? item.id : undefined;
    if (nextId === this._hoveredPreviewId) return;
    this._hoveredPreviewId = nextId;
    this.requestUpdate();
  }

  private _clearHoverPreview(itemId: string): void {
    if (this._hoveredPreviewId !== itemId) return;
    this._hoveredPreviewId = undefined;
    this.requestUpdate();
  }

  private readonly _setPreviewRate = (event: Event): void => {
    (event.currentTarget as HTMLVideoElement).playbackRate = 4;
  };

  static styles = [buttonBaseStyles, exportsStyles];
}

if (!customElements.get(EXPORTS_TAG)) {
  customElements.define(EXPORTS_TAG, ExportsModule);
}

declare global {
  interface HTMLElementTagNameMap {
    [EXPORTS_TAG]: ExportsModule;
  }
}
