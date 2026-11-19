import { html } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";

import type { CardConfig, CompanionRotateAction } from "../core/config";
import {
  DEFAULT_EVENT_HISTORY_DAYS,
  EDITOR_GENERAL_INFO_TAG,
  EDITOR_HEIGHT_SELECTOR_TAG,
  MAX_CARD_TITLE_LENGTH,
  MAX_EVENT_HISTORY_DAYS,
  MIN_EVENT_HISTORY_DAYS,
} from "../core/constants";
import type { HomeAssistant } from "../core/home-assistant";
import type { LocalizeFunction } from "../core/localization";
import type {
  SegmentedControlOption,
  SegmentedControlValueDetail,
} from "../ui/segmented-control";

export type BooleanConfigFlag =
  | "camera_bar_rounded_corners"
  | "camera_bar_rounded_corners_phone"
  | "camera_bar_shadows"
  | "camera_bar_shadows_phone"
  | "camera_rounded_corners"
  | "camera_rounded_corners_phone"
  | "camera_shadows"
  | "camera_shadows_phone"
  | "camera_switcher_overlay"
  | "display_event_type_badges"
  | "display_object_badges"
  | "display_zone"
  | "edge_to_edge_phone"
  | "event_rounded_corners"
  | "event_rounded_corners_phone"
  | "event_shadows"
  | "event_shadows_phone"
  | "highlight_camera_on_activity"
  | "minimal_camera_show_fullscreen_button"
  | "minimal_camera_show_mute_button"
  | "minimal_camera_show_pip_button"
  | "minimal_camera_show_source_label"
  | "mobile_data_saving"
  | "outer_padding"
  | "outer_padding_phone"
  | "outer_shadows"
  | "outer_shadows_phone"
  | "rounded_outer_corners"
  | "rounded_outer_corners_phone"
  | "start_alert_takeover_on"
  | "view_timelapse_on_thumbnail_hover";

interface ValueChangedEvent extends Event {
  readonly detail: { readonly value?: unknown };
}

interface CommonSectionOptions {
  readonly config?: CardConfig;
  readonly hass?: HomeAssistant;
  readonly localize: LocalizeFunction;
  readonly onChange: (event: ValueChangedEvent) => void;
}

interface GeneralSettingsOptions extends CommonSectionOptions {
  readonly onTitleChange: (event: Event) => void;
  readonly onTitleInput: (event: Event) => void;
}

interface MinimalCameraSettingsOptions extends CommonSectionOptions {
  readonly onMenuPositionChange: (
    event: CustomEvent<SegmentedControlValueDetail>,
  ) => void;
}

interface MobileAndTouchSettingsOptions extends CommonSectionOptions {
  readonly minimal: boolean;
  readonly onCompanionRotateActionChange: (
    event: CustomEvent<SegmentedControlValueDetail>,
  ) => void;
}

interface LiveMediaPlayerSettingsOptions extends CommonSectionOptions {
  readonly onAlertTakeoverModeChange: (
    event: CustomEvent<SegmentedControlValueDetail>,
  ) => void;
  readonly onPtzOverlayControlChange: (
    event: CustomEvent<SegmentedControlValueDetail>,
  ) => void;
  readonly onSlideAdvanceTimeChange: (
    event: CustomEvent<SegmentedControlValueDetail>,
  ) => void;
  readonly onSlideTransitionChange: (
    event: CustomEvent<SegmentedControlValueDetail>,
  ) => void;
}

interface ReviewSettingsOptions extends CommonSectionOptions {
  readonly onEventHistoryDaysChange: (event: ValueChangedEvent) => void;
}

const BOOLEAN_SELECTOR = { boolean: {} } as const;
const REVIEW_HISTORY_DAYS_SELECTOR = {
  number: {
    max: MAX_EVENT_HISTORY_DAYS,
    min: MIN_EVENT_HISTORY_DAYS,
    mode: "slider",
    slider_ticks: true,
    step: 1,
  },
} as const;
const generalInfoTag = unsafeStatic(EDITOR_GENERAL_INFO_TAG);
const heightSelectorTag = unsafeStatic(EDITOR_HEIGHT_SELECTOR_TAG);

function renderBooleanOption(
  options: CommonSectionOptions,
  key: BooleanConfigFlag,
  label: string,
  value: boolean,
) {
  return html`<ha-selector
    class="boolean-option"
    data-config-key=${key}
    label=${label}
    .hass=${options.hass}
    .selector=${BOOLEAN_SELECTOR}
    .value=${value}
    @value-changed=${options.onChange}
  ></ha-selector>`;
}

export function renderGeneralSettings(options: GeneralSettingsOptions) {
  return staticHtml`
    <${generalInfoTag} .hass=${options.hass}></${generalInfoTag}>
    <ha-input
      required
      auto-validate
      maxlength=${String(MAX_CARD_TITLE_LENGTH)}
      label=${options.localize("editor.title")}
      .value=${options.config?.title ?? ""}
      @input=${options.onTitleInput}
      @change=${options.onTitleChange}
    ></ha-input>
  `;
}

export function renderMobileAndTouchSettings(
  options: MobileAndTouchSettingsOptions,
) {
  const { config, localize } = options;
  const rotateOptions: readonly SegmentedControlOption[] = [
    { label: localize("editor.rotate_action_none"), value: "none" },
    ...(options.minimal
      ? []
      : [
          {
            label: localize("editor.rotate_action_double_column"),
            value: "double_column" satisfies CompanionRotateAction,
          },
        ]),
    {
      label: localize("editor.rotate_action_fullscreen_live_video"),
      value: "fullscreen_live_video",
    },
  ];
  return html`
    <div class="segmented-setting">
      <span class="segmented-setting-label">
        ${localize("editor.rotate_action_companion_app")}
      </span>
      <wzc-segmented-control
        class="editor-segmented-control"
        data-setting="companion-rotate-action"
        appearance="compact"
        mode="radio"
        .label=${localize("editor.rotate_action_companion_app")}
        .options=${rotateOptions}
        .value=${
          options.minimal &&
          (config?.companion_rotate_action ?? "double_column") ===
            "double_column"
            ? "none"
            : (config?.companion_rotate_action ?? "double_column")
        }
        @wzc-segmented-control-value=${options.onCompanionRotateActionChange}
      ></wzc-segmented-control>
    </div>
    ${renderBooleanOption(
      options,
      "mobile_data_saving",
      localize("editor.mobile_data_saving"),
      config?.mobile_data_saving === true,
    )}
  `;
}

export function renderMinimalCameraSettings(
  options: MinimalCameraSettingsOptions,
) {
  const { config, localize } = options;
  return html`
    ${renderBooleanOption(
      options,
      "edge_to_edge_phone",
      localize("editor.edge_to_edge_phone"),
      config?.edge_to_edge_phone !== false,
    )}
    ${renderBooleanOption(
      options,
      "highlight_camera_on_activity",
      localize("editor.highlight_camera_on_activity"),
      config?.highlight_camera_on_activity !== false,
    )}
    ${renderBooleanOption(
      options,
      "minimal_camera_show_mute_button",
      localize("editor.minimal_camera_show_mute_button"),
      config?.minimal_camera_show_mute_button !== false,
    )}
    ${renderBooleanOption(
      options,
      "minimal_camera_show_fullscreen_button",
      localize("editor.minimal_camera_show_fullscreen_button"),
      config?.minimal_camera_show_fullscreen_button !== false,
    )}
    ${renderBooleanOption(
      options,
      "minimal_camera_show_pip_button",
      localize("editor.minimal_camera_show_pip_button"),
      config?.minimal_camera_show_pip_button !== false,
    )}
    ${renderBooleanOption(
      options,
      "minimal_camera_show_source_label",
      localize("editor.minimal_camera_show_source_label"),
      config?.minimal_camera_show_source_label !== false,
    )}
    <div class="segmented-setting">
      <span class="segmented-setting-label">
        ${localize("editor.minimal_camera_menu_position")}
      </span>
      <wzc-segmented-control
        class="editor-segmented-control"
        data-setting="minimal-camera-menu-position"
        appearance="compact"
        .label=${localize("editor.minimal_camera_menu_position")}
        .options=${
          [
            {
              label: localize("editor.minimal_camera_menu_left"),
              value: "top_left",
            },
            {
              label: localize("editor.minimal_camera_menu_right"),
              value: "top_right",
            },
          ] satisfies readonly SegmentedControlOption[]
        }
        .value=${config?.minimal_camera_menu_position ?? "top_left"}
        @wzc-segmented-control-value=${options.onMenuPositionChange}
      ></wzc-segmented-control>
    </div>
  `;
}

export function renderLiveMediaPlayerSettings(
  options: LiveMediaPlayerSettingsOptions,
) {
  const { config, localize } = options;
  const ptzOptions: readonly SegmentedControlOption[] = [
    { label: localize("editor.ptz_overlay_none"), value: "none" },
    {
      label: localize("editor.ptz_overlay_start_closed"),
      value: "start_closed",
    },
    {
      label: localize("editor.ptz_overlay_start_open"),
      value: "start_open",
    },
    {
      disabled: true,
      label: localize("editor.ptz_overlay_open_in_drawer"),
      value: "open_in_drawer",
    },
  ];
  return html`
    ${renderBooleanOption(
      options,
      "camera_switcher_overlay",
      localize("editor.camera_switcher_overlay"),
      config?.camera_switcher_overlay === true,
    )}
    ${renderBooleanOption(
      options,
      "highlight_camera_on_activity",
      localize("editor.highlight_camera_on_activity"),
      config?.highlight_camera_on_activity !== false,
    )}
    <div class="segmented-setting">
      <span class="segmented-setting-label">
        ${localize("editor.alert_detection_takeover")}
      </span>
      <span class="segmented-setting-description">
        ${localize("editor.alert_detection_takeover_description")}
      </span>
      <wzc-segmented-control
        class="editor-segmented-control"
        data-setting="alert-detection-takeover"
        appearance="compact"
        .label=${localize("editor.alert_detection_takeover")}
        .options=${
          [
            {
              label: localize("editor.alert_detection_takeover_off"),
              value: "off",
            },
            {
              label: localize("editor.alert_detection_takeover_alerts"),
              value: "alerts",
            },
            {
              label: localize("editor.alert_detection_takeover_detections"),
              value: "detections",
            },
            {
              label: localize("editor.alert_detection_takeover_both"),
              value: "both",
            },
          ] satisfies readonly SegmentedControlOption[]
        }
        .value=${config?.alert_detection_takeover ?? "both"}
        @wzc-segmented-control-value=${options.onAlertTakeoverModeChange}
      ></wzc-segmented-control>
    </div>
    ${renderBooleanOption(
      options,
      "start_alert_takeover_on",
      localize("editor.start_alert_takeover_on"),
      config?.start_alert_takeover_on === true,
    )}
    <div class="segmented-setting">
      <span class="segmented-setting-label" id="ptz-overlay-control-label">
        ${localize("editor.ptz_overlay_control")}
      </span>
      <wzc-segmented-control
        class="editor-segmented-control"
        data-setting="ptz-overlay-control"
        appearance="compact"
        .label=${localize("editor.ptz_overlay_control")}
        .options=${ptzOptions}
        .value=${config?.ptz_overlay_control ?? "start_open"}
        @wzc-segmented-control-value=${options.onPtzOverlayControlChange}
      ></wzc-segmented-control>
    </div>
    <div class="segmented-setting">
      <span class="segmented-setting-label">
        ${localize("editor.slide_transition")}
      </span>
      <wzc-segmented-control
        class="editor-segmented-control"
        data-setting="slide-transition"
        appearance="compact"
        .label=${localize("editor.slide_transition")}
        .options=${
          [
            { label: localize("editor.slide_transition_none"), value: "none" },
            {
              label: localize("editor.slide_transition_slide"),
              value: "slide",
            },
            { label: localize("editor.slide_transition_fade"), value: "fade" },
          ] satisfies readonly SegmentedControlOption[]
        }
        .value=${config?.slide_transition ?? "slide"}
        @wzc-segmented-control-value=${options.onSlideTransitionChange}
      ></wzc-segmented-control>
    </div>
    <div class="segmented-setting">
      <span class="segmented-setting-label">
        ${localize("editor.slide_advance_time")}
      </span>
      <wzc-segmented-control
        class="editor-segmented-control"
        data-setting="slide-advance-time"
        appearance="compact"
        .label=${localize("editor.slide_advance_time")}
        .options=${
          [5, 10, 20, 30].map((seconds) => ({
            label: localize("editor.slide_advance_seconds", { seconds }),
            value: String(seconds),
          })) satisfies readonly SegmentedControlOption[]
        }
        .value=${String(config?.slide_advance_time ?? 10)}
        @wzc-segmented-control-value=${options.onSlideAdvanceTimeChange}
      ></wzc-segmented-control>
    </div>
  `;
}

export function renderReviewSettings(options: ReviewSettingsOptions) {
  const { config, localize } = options;
  return html`
    <div class="review-settings-list">
      <ha-selector
        label=${localize("editor.event_history_days")}
        .hass=${options.hass}
        .selector=${REVIEW_HISTORY_DAYS_SELECTOR}
        .value=${config?.event_history_days ?? DEFAULT_EVENT_HISTORY_DAYS}
        @value-changed=${options.onEventHistoryDaysChange}
      ></ha-selector>
      ${renderBooleanOption(
        options,
        "view_timelapse_on_thumbnail_hover",
        localize("editor.view_timelapse_on_thumbnail_hover"),
        config?.view_timelapse_on_thumbnail_hover !== false,
      )}
      ${renderBooleanOption(
        options,
        "display_object_badges",
        localize("editor.display_object_badges"),
        config?.display_object_badges !== false,
      )}
      ${renderBooleanOption(
        options,
        "display_event_type_badges",
        localize("editor.display_event_type_badges"),
        config?.display_event_type_badges !== false,
      )}
      ${renderBooleanOption(
        options,
        "display_zone",
        localize("editor.display_zone"),
        config?.display_zone !== false,
      )}
    </div>
  `;
}

export function renderLayoutSettings(options: CommonSectionOptions) {
  return staticHtml`
    <${heightSelectorTag}
      .hass=${options.hass}
      .config=${options.config}
      @value-changed=${options.onChange}
    ></${heightSelectorTag}>
  `;
}
