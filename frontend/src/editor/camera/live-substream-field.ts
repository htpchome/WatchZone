import { html, LitElement } from "lit";

import { listFrigateSubstreams } from "../../api/live-source";
import type { CameraConfig } from "../../core/config";
import { EDITOR_LIVE_SUBSTREAM_FIELD_TAG } from "../../core/constants";
import {
  createHomeAssistantApi,
  type HomeAssistant,
} from "../../core/home-assistant";
import { LocalizationController } from "../../core/localization";
import { liveSubstreamFieldStyles } from "./live-substream-field.styles";

const MAIN_STREAM_VALUE = "__camera_optics_main_stream__";
const MANAGED_SUBSTREAM_ATTRIBUTE = "camera_optics_substream";

export class LiveSubstreamField extends LitElement {
  public static properties = {
    camera: { attribute: false },
    hass: { attribute: false },
  };

  public static styles = liveSubstreamFieldStyles;

  public camera?: CameraConfig;
  public hass?: HomeAssistant;
  private readonly _localization = new LocalizationController(this);

  private _failed = false;
  private _generation = 0;
  private _pending = false;
  private _streams: readonly string[] = [];

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("hass")) {
      this._localization.setLanguage(
        this.hass?.locale?.language ?? this.hass?.language,
      );
    }
    if (!changed.has("camera") && !changed.has("hass")) return;
    const camera = this.camera;
    if (camera?.connection !== "frigate_go2rtc" || !camera.entity_id) {
      this._reset();
      return;
    }
    void this._load(camera.entity_id);
  }

  protected render() {
    const camera = this.camera;
    if (!camera) return html``;
    const frigate = camera.connection === "frigate_go2rtc";
    const configured = camera.live_substream;
    const managed = this._managedSubstreams(camera);
    const streams = frigate
      ? [...new Set([...this._streams, ...managed])]
      : managed;
    if (configured && !streams.includes(configured)) streams.push(configured);
    return html`<details class="live-substream-details">
        <summary>${this._t("editor.live_substream_details")}</summary>
        <p>
          ${this._t(
            frigate
              ? "editor.live_substream_details_body"
              : "editor.live_substream_ha_details_body",
          )}
        </p>
      </details>
      <ha-selector
        label=${this._t("editor.live_substream")}
        .hass=${this.hass}
        .selector=${{
          select: {
            mode: "dropdown",
            options: [
              {
                label: this._t("editor.main_stream"),
                value: MAIN_STREAM_VALUE,
              },
              ...streams.map((stream) => ({
                label: stream.startsWith("camera.")
                  ? String(
                      this.hass?.states[stream]?.attributes.friendly_name ??
                        stream,
                    )
                  : stream,
                value: stream,
              })),
            ],
          },
        }}
        .value=${configured ?? MAIN_STREAM_VALUE}
        .disabled=${!camera.entity_id || (frigate && this._pending)}
        @value-changed=${this._handleChange}
      ></ha-selector>
      <small>
        ${
          frigate
            ? this._pending
              ? this._t("editor.live_substream_checking")
              : this._failed
                ? this._t("editor.live_substream_discovery_failed")
                : this._streams.length === 0
                  ? this._t("editor.live_substream_none")
                  : this._t("editor.live_substream_frigate_help")
            : this._t("editor.live_substream_ha_help")
        }
      </small>`;
  }

  private readonly _handleChange = (
    event: CustomEvent<{ value?: unknown }>,
  ) => {
    if (!this.camera) return;
    const value =
      typeof event.detail.value === "string" ? event.detail.value : "";
    this.dispatchEvent(
      new CustomEvent("value-changed", {
        bubbles: true,
        composed: true,
        detail: {
          value: {
            ...this.camera,
            live_substream:
              value && value !== MAIN_STREAM_VALUE ? value : undefined,
          },
        },
      }),
    );
  };

  private _managedSubstreams(camera: CameraConfig): string[] {
    const entityIds = Object.keys(this.hass?.states ?? {}).filter(
      (entityId) =>
        entityId.startsWith("camera.") &&
        entityId !== camera.entity_id &&
        this.hass?.states[entityId]?.attributes[MANAGED_SUBSTREAM_ATTRIBUTE] ===
          true,
    );
    if (
      camera.live_substream?.startsWith("camera.") &&
      !entityIds.includes(camera.live_substream)
    ) {
      entityIds.push(camera.live_substream);
    }
    return entityIds.sort((left, right) => left.localeCompare(right));
  }

  private _t(key: Parameters<LocalizationController["localize"]>[0]): string {
    return this._localization.localize(key);
  }

  private _reset(): void {
    this._generation += 1;
    this._streams = [];
    this._failed = false;
    this._pending = false;
  }

  private async _load(entityId: string): Promise<void> {
    const hass = this.hass;
    const generation = ++this._generation;
    this._streams = [];
    this._failed = false;
    this._pending = Boolean(hass);
    if (!hass) return;
    try {
      const streams = await listFrigateSubstreams(
        createHomeAssistantApi(hass),
        entityId,
      );
      if (generation !== this._generation) return;
      this._streams = streams;
    } catch {
      if (generation !== this._generation) return;
      this._failed = true;
    } finally {
      if (generation === this._generation) {
        this._pending = false;
        this.requestUpdate();
      }
    }
  }
}

if (!customElements.get(EDITOR_LIVE_SUBSTREAM_FIELD_TAG)) {
  customElements.define(EDITOR_LIVE_SUBSTREAM_FIELD_TAG, LiveSubstreamField);
}

declare global {
  interface HTMLElementTagNameMap {
    [EDITOR_LIVE_SUBSTREAM_FIELD_TAG]: LiveSubstreamField;
  }
}
