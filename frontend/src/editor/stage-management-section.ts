import { html } from "lit";

import type { CardConfig } from "../core/config";
import type { LocalizeFunction } from "../core/localization";
import type { AvailableStageType, ConfiguredStageFlow } from "../core/stage";
import { builtInStageOptions } from "../stage/built-in-stages/catalog";

interface StageManagementOptions {
  readonly config?: CardConfig;
  readonly localize: LocalizeFunction;
  readonly onStageLayoutChange: (event: Event) => void;
  readonly onStageTypeChange: (event: Event) => void;
}

function renderStageTypeOption(
  options: StageManagementOptions,
  value: AvailableStageType,
  label: string,
  description: string,
  selected: AvailableStageType,
) {
  return html`<label
    class=${`stage-type-option${selected === value ? " selected" : ""}`}
  >
    <input
      type="radio"
      name="stage-type"
      value=${value}
      .checked=${selected === value}
      @change=${options.onStageTypeChange}
    />
    <span class="stage-type-copy">
      <strong>${label}</strong>
      <small>${description}</small>
    </span>
  </label>`;
}

function stageDesignLabel(
  localize: LocalizeFunction,
  id: string,
  fallback: string,
): string {
  return id === "default-stage"
    ? localize("editor.default_stage_layout")
    : fallback;
}

function renderStageLayoutOptions(
  options: StageManagementOptions,
  profile: keyof ConfiguredStageFlow,
  heading: string,
  stageType: AvailableStageType,
) {
  const selected = options.config?.stage_flow[profile] ?? [];
  return html`<fieldset class="stage-layout-setting">
    <legend>${heading}</legend>
    <div class="stage-layout-options">
      ${builtInStageOptions(stageType).map(
        (stage) =>
          html`<label
            class=${`stage-layout-option${
              selected.includes(stage.id) ? " selected" : ""
            }`}
          >
            <input
              type="checkbox"
              data-stage-profile=${profile}
              value=${stage.id}
              .checked=${selected.includes(stage.id)}
              @change=${options.onStageLayoutChange}
            />
            <span
              >${stageDesignLabel(options.localize, stage.id, stage.name)}</span
            >
          </label>`,
      )}
      <label class="stage-layout-option disabled">
        <input type="checkbox" disabled />
        <span>${options.localize("editor.future_stage_layout")}</span>
      </label>
    </div>
  </fieldset>`;
}

export function renderStageManagement(options: StageManagementOptions) {
  const { localize } = options;
  const stageType = options.config?.stage_type ?? "full";
  return html`
    <fieldset class="stage-type-setting">
      <legend>${localize("editor.stage_type")}</legend>
      <div class="stage-type-options">
        ${renderStageTypeOption(
          options,
          "minimal_camera_only",
          localize("editor.minimal_camera_stage"),
          localize("editor.minimal_camera_stage_description"),
          stageType,
        )}
        ${renderStageTypeOption(
          options,
          "camera_only",
          localize("editor.camera_only_stage"),
          localize("editor.camera_only_stage_description"),
          stageType,
        )}
        ${renderStageTypeOption(
          options,
          "full",
          localize("editor.full_stage"),
          localize("editor.full_stage_description"),
          stageType,
        )}
      </div>
    </fieldset>
    ${
      stageType === "full"
        ? renderStageLayoutOptions(
            options,
            "default",
            localize("editor.stage_layout"),
            stageType,
          )
        : null
    }
    ${
      stageType === "full"
        ? renderStageLayoutOptions(
            options,
            "phone",
            localize("editor.mobile_stage_layout"),
            stageType,
          )
        : null
    }
  `;
}
