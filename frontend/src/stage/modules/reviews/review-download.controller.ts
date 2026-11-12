import type { ReactiveController, ReactiveControllerHost } from "lit";

import type { HomeAssistantApi } from "../../../core/home-assistant";
import type { LocalizeFunction } from "../../../core/localization";
import type { ActivityListItem } from "../../../ui/activity-list";
import type { ToastManager } from "../../../ui/toast-manager";

const OBJECT_URL_REVOKE_DELAY_MS = 1_000;

/** Owns authenticated review downloads and their browser resource cleanup. */
export class ReviewDownloadController implements ReactiveController {
  private _abort?: AbortController;

  public constructor(
    host: ReactiveControllerHost,
    private readonly _api: () => HomeAssistantApi | undefined,
    private readonly _localize: () => LocalizeFunction,
    private readonly _toasts: ToastManager,
  ) {
    host.addController(this);
  }

  public hostDisconnected(): void {
    this._abort?.abort();
    this._abort = undefined;
  }

  public async download(item: ActivityListItem): Promise<void> {
    const api = this._api();
    const path = item.downloadUrl;
    if (!api || !path) return;
    this._abort?.abort();
    const abort = new AbortController();
    this._abort = abort;
    let objectUrl: string | undefined;
    try {
      const signed = await api.callWS<{ readonly path?: string }>({
        type: "auth/sign_path",
        path,
        expires: 3600,
      });
      const response = await fetch(api.resolveUrl(signed.path ?? path), {
        signal: abort.signal,
      });
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = item.downloadFilename ?? "review.mp4";
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }
    } catch {
      if (!abort.signal.aborted) {
        this._toasts.error(this._localize()("reviews.download_failed"), {
          key: `review-download-${item.id}`,
        });
      }
    } finally {
      if (this._abort === abort) this._abort = undefined;
      if (objectUrl) {
        const completedUrl = objectUrl;
        window.setTimeout(
          () => URL.revokeObjectURL(completedUrl),
          OBJECT_URL_REVOKE_DELAY_MS,
        );
      }
    }
  }
}
