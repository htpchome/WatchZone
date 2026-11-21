import { html, LitElement, nothing } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import {
  BADGE_TAG,
  RECORDED_MEDIA_INFORMATION_TAG,
} from "../../core/constants";
import {
  formatHomeAssistantEventDate,
  formatHomeAssistantTime,
} from "../../core/date-time";
import type { HomeAssistantLocale } from "../../core/home-assistant";
import {
  englishLocalize,
  type LocalizeFunction,
} from "../../core/localization";
import { homeAssistantNumberFormat } from "../../core/number-format";
import type { RecordedMediaRequest } from "../../core/recorded-media";
import { activityBadgePresentations } from "../../ui/activity-list/badge-presentations";
import "../../ui/badge";
import { mediaInformationStyles } from "./media-information.styles";

const badgeTag = unsafeStatic(BADGE_TAG);

/** Reusable metadata presentation for recorded-media shells. */
export class RecordedMediaInformation extends LitElement {
  public static properties = {
    locale: { attribute: false },
    localize: { attribute: false },
    request: { attribute: false },
  };

  public locale?: HomeAssistantLocale;
  public localize: LocalizeFunction = englishLocalize;
  public request?: RecordedMediaRequest;

  protected render() {
    const request = this.request;
    const metadata = request?.metadata;
    if (!request || !metadata) return nothing;
    const start = new Date(metadata.startTime * 1_000);
    const duration =
      metadata.duration ??
      (metadata.endTime === null || metadata.endTime === undefined
        ? undefined
        : Math.max(0, metadata.endTime - metadata.startTime));
    const classification = metadata.classification
      ? this.localize(
          metadata.classification === "alert"
            ? "reviews.alert"
            : "reviews.detection",
        )
      : undefined;
    const objects = distinct(
      metadata.objects.map((value) => displayLabel(value, this.locale)),
    );
    const zones = distinct(
      metadata.zones.map((value) => displayLabel(value, this.locale)),
    );
    const badges = activityBadgePresentations(
      undefined,
      objects,
      classification
        ? {
            label: classification,
            variant:
              metadata.classification === "alert" ? "alert" : "detection",
          }
        : undefined,
    );
    const fields = [
      [
        this.localize("media_player.camera"),
        displayLabel(metadata.camera, this.locale),
      ],
      [
        this.localize("media_player.day_date"),
        formatHomeAssistantEventDate(start, this.locale),
      ],
      [
        this.localize("media_player.time"),
        formatHomeAssistantTime(start, this.locale),
      ],
      [
        this.localize("media_player.duration"),
        duration === undefined
          ? this.localize("media_player.in_progress")
          : formatDuration(duration),
      ],
      [
        this.localize("media_player.objects"),
        objects.join(", ") || this.localize("media_player.none"),
      ],
      [
        this.localize("media_player.zone"),
        zones.join(", ") || this.localize("media_player.none"),
      ],
      [
        this.localize("media_player.score"),
        metadata.score === undefined
          ? this.localize("media_player.unavailable")
          : homeAssistantNumberFormat(this.locale, {
              maximumFractionDigits: 0,
              style: "percent",
            }).format(metadata.score),
      ],
    ] as const;
    return html`<section
      class="information"
      aria-label=${this.localize("media_player.information")}
    >
      ${
        badges.length > 0
          ? staticHtml`<div class="badges">
              ${badges.map((badge) =>
                badge.variant
                  ? staticHtml`<${badgeTag}
                      shape="pill"
                      size="small"
                      variant=${badge.variant}
                    >${badge.label}</${badgeTag}>`
                  : staticHtml`<${badgeTag}
                      color=${badge.color ?? "neutral"}
                      shape="pill"
                      size="small"
                    >${badge.label}</${badgeTag}>`,
              )}
            </div>`
          : nothing
      }
      <dl class="metadata">
        ${fields.map(
          ([label, value]) =>
            html`<div class="field">
              <dt>${label}</dt>
              <dd>${value}</dd>
            </div>`,
        )}
      </dl>
    </section>`;
  }

  static styles = mediaInformationStyles;
}

export function recordedMediaHeading(
  request: RecordedMediaRequest | undefined,
  localize: LocalizeFunction,
  locale: HomeAssistantLocale | undefined,
): string {
  const metadata = request?.metadata;
  if (!request || !metadata) return request?.title ?? "";
  const start = new Date(metadata.startTime * 1_000);
  const classification = metadata.classification
    ? localize(
        metadata.classification === "alert"
          ? "reviews.alert"
          : "reviews.detection",
      )
    : undefined;
  return [
    classification,
    displayLabel(metadata.camera, locale),
    formatHomeAssistantTime(start, locale),
    formatHomeAssistantEventDate(start, locale),
  ]
    .filter(Boolean)
    .join(" · ");
}

function displayLabel(value: string, locale?: HomeAssistantLocale): string {
  const characters = Array.from(value.trim().replaceAll("_", " "));
  const first = characters.shift();
  return first
    ? `${first.toLocaleUpperCase(locale?.language)}${characters.join("")}`
    : "";
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const remainder = total % 60;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(remainder)}`;
  return `${minutes}:${pad(remainder)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

if (!customElements.get(RECORDED_MEDIA_INFORMATION_TAG)) {
  customElements.define(
    RECORDED_MEDIA_INFORMATION_TAG,
    RecordedMediaInformation,
  );
}

declare global {
  interface HTMLElementTagNameMap {
    [RECORDED_MEDIA_INFORMATION_TAG]: RecordedMediaInformation;
  }
}
