import { html, nothing } from "lit";

import type { CardConfig } from "../core/config";
import type { HomeAssistant } from "../core/home-assistant";
import type { LocalizeFunction } from "../core/localization";

export type OptionalInteractionName = "double_tap_action" | "hold_action";

interface ValueChangedEvent extends Event {
  readonly detail: { readonly value?: unknown };
}

interface InteractionSettingsOptions {
  readonly choosingOptionalInteraction: boolean;
  readonly config?: CardConfig;
  readonly hass?: HomeAssistant;
  readonly localize: LocalizeFunction;
  readonly onActionsChange: (event: ValueChangedEvent) => void;
  readonly onAddOptionalInteraction: (event: Event) => void;
  readonly onRemoveOptionalInteraction: (event: Event) => void;
  readonly onToggleOptionalInteractionChoices: () => void;
  readonly visibleOptionalInteractions: ReadonlySet<OptionalInteractionName>;
}

const TAP_ACTION_SELECTOR = {
  ui_action: {
    actions: [
      "open-live-view",
      "toggle",
      "navigate",
      "url",
      "perform-action",
      "assist",
      "none",
    ],
    default_action: "open-live-view",
  },
} as const;
const OPTIONAL_ACTION_SELECTOR = {
  ui_action: {
    actions: [
      "open-live-view",
      "toggle",
      "navigate",
      "url",
      "perform-action",
      "assist",
      "none",
    ],
    default_action: "none",
  },
} as const;
const TAP_ACTION_SCHEMA = {
  name: "tap_action",
  selector: TAP_ACTION_SELECTOR,
} as const;
const OPTIONAL_ACTION_SCHEMAS = {
  hold_action: { name: "hold_action", selector: OPTIONAL_ACTION_SELECTOR },
  double_tap_action: {
    name: "double_tap_action",
    selector: OPTIONAL_ACTION_SELECTOR,
  },
} as const;

function interactionLabel(
  localize: LocalizeFunction,
  name: OptionalInteractionName,
): string {
  return localize(
    name === "hold_action"
      ? "editor.hold_behavior"
      : "editor.double_tap_behavior",
  );
}

function renderOptionalInteraction(
  options: InteractionSettingsOptions,
  name: OptionalInteractionName,
  action: CardConfig[OptionalInteractionName] | undefined,
) {
  const label = interactionLabel(options.localize, name);
  return html`<div class="optional-interaction">
    <ha-form
      .hass=${options.hass}
      .data=${{ [name]: action }}
      .schema=${[OPTIONAL_ACTION_SCHEMAS[name]]}
      .computeLabel=${() => label}
      @value-changed=${options.onActionsChange}
    ></ha-form>
    <div class="remove-interaction-action">
      <ha-button
        appearance="plain"
        variant="brand"
        size="s"
        type="button"
        data-interaction=${name}
        aria-label=${`${options.localize("common.remove")} ${label}`}
        @click=${options.onRemoveOptionalInteraction}
      >
        ${options.localize("common.remove")}
      </ha-button>
    </div>
  </div>`;
}

export function renderInteractionSettings(options: InteractionSettingsOptions) {
  const { config, localize, visibleOptionalInteractions } = options;
  const holdAction = config?.hold_action;
  const doubleTapAction = config?.double_tap_action;
  const showHold =
    visibleOptionalInteractions.has("hold_action") ||
    holdAction?.action !== "none";
  const showDoubleTap =
    visibleOptionalInteractions.has("double_tap_action") ||
    doubleTapAction?.action !== "none";
  const addable: OptionalInteractionName[] = [
    ...(!showHold ? (["hold_action"] as const) : []),
    ...(!showDoubleTap ? (["double_tap_action"] as const) : []),
  ];
  return html`<ha-form
      class="primary-interaction"
      .hass=${options.hass}
      .data=${{ tap_action: config?.tap_action }}
      .schema=${[TAP_ACTION_SCHEMA]}
      .computeLabel=${(schema: { readonly name?: string }) =>
        schema.name === "tap_action"
          ? localize("editor.tap_behavior")
          : schema.name === "hold_action"
            ? localize("editor.hold_behavior")
            : localize("editor.double_tap_behavior")}
      @value-changed=${options.onActionsChange}
    ></ha-form>
    ${
      showHold
        ? renderOptionalInteraction(options, "hold_action", holdAction)
        : nothing
    }
    ${
      showDoubleTap
        ? renderOptionalInteraction(
            options,
            "double_tap_action",
            doubleTapAction,
          )
        : nothing
    }
    ${
      addable.length
        ? html`<div class="add-interaction">
            <ha-button
              appearance="filled"
              variant="brand"
              size="s"
              type="button"
              aria-expanded=${String(options.choosingOptionalInteraction)}
              @click=${options.onToggleOptionalInteractionChoices}
            >
              <ha-icon icon="mdi:plus" slot="start"></ha-icon>
              ${localize("editor.add_interaction")}
            </ha-button>
            ${
              options.choosingOptionalInteraction
                ? html`<div class="add-interaction-choices">
                    ${addable.map(
                      (name) =>
                        html`<ha-button
                          appearance="plain"
                          variant="neutral"
                          size="s"
                          type="button"
                          data-interaction=${name}
                          @click=${options.onAddOptionalInteraction}
                        >
                          ${interactionLabel(localize, name)}
                        </ha-button>`,
                    )}
                  </div>`
                : nothing
            }
          </div>`
        : nothing
    }`;
}
