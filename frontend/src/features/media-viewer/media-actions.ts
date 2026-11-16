import { html, nothing, type TemplateResult } from "lit";

import { RECORDED_MEDIA_ACTION_EVENT } from "../../core/constants";
import type { LocalizeFunction } from "../../core/localization";
import type { RecordedMediaRequest } from "../../core/recorded-media";

export type RecordedMediaActionDetail =
  | { readonly kind: "download" }
  | { readonly kind: "export_review" }
  | { readonly kind: "view"; readonly media: "snapshot" | "video" };

/** Renders presentation-neutral recorded-media actions into an owning shell. */
export function renderRecordedMediaActions(
  request: RecordedMediaRequest | undefined,
  localize: LocalizeFunction,
  dispatchTarget: EventTarget,
): TemplateResult | typeof nothing {
  if (!request) return nothing;
  const alternate =
    request.kind === "snapshot"
      ? request.actions?.variants?.video
      : request.actions?.variants?.snapshot;
  const download = request.actions?.variants?.[request.kind]?.download;
  const canExport =
    request.kind === "video" && Boolean(request.actions?.exportReview);
  if (!alternate && !download && !canExport) return nothing;

  const dispatch = (detail: RecordedMediaActionDetail): void => {
    dispatchTarget.dispatchEvent(
      new CustomEvent<RecordedMediaActionDetail>(RECORDED_MEDIA_ACTION_EVENT, {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  };

  return html`${
    canExport
      ? html`<button
          class="wzc-icon-button wzc-activity-action"
          type="button"
          title=${localize("reviews.export")}
          aria-label=${localize("reviews.export")}
          @click=${() => dispatch({ kind: "export_review" })}
        >
          <ha-icon icon="mdi:export" aria-hidden="true"></ha-icon>
        </button>`
      : nothing
  }
  ${
    download
      ? html`<button
          class="wzc-icon-button wzc-activity-action"
          type="button"
          title=${localize(
            request.kind === "snapshot"
              ? "media_player.download_snapshot"
              : request.presentation === "recording"
                ? "recordings.download"
                : "media_player.download_review",
          )}
          aria-label=${localize(
            request.kind === "snapshot"
              ? "media_player.download_snapshot"
              : request.presentation === "recording"
                ? "recordings.download"
                : "media_player.download_review",
          )}
          @click=${() => dispatch({ kind: "download" })}
        >
          <ha-icon icon="mdi:download" aria-hidden="true"></ha-icon>
        </button>`
      : nothing
  }
  ${
    alternate
      ? html`<button
          class="wzc-icon-button wzc-activity-action"
          type="button"
          title=${localize(
            alternate.kind === "snapshot"
              ? "media_player.view_snapshot"
              : "media_player.view_review",
          )}
          aria-label=${localize(
            alternate.kind === "snapshot"
              ? "media_player.view_snapshot"
              : "media_player.view_review",
          )}
          @click=${() => dispatch({ kind: "view", media: alternate.kind })}
        >
          <ha-icon
            icon=${alternate.kind === "snapshot" ? "mdi:camera" : "mdi:play"}
            aria-hidden="true"
          ></ha-icon>
        </button>`
      : nothing
  }`;
}
