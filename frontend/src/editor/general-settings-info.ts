import { html, LitElement } from "lit";

import {
  APP_NAME,
  APP_VERSION,
  EDITOR_GENERAL_INFO_TAG,
} from "../core/constants";
import { formatHomeAssistantTimeZone } from "../core/date-time";
import {
  createHomeAssistantApi,
  type HomeAssistant,
} from "../core/home-assistant";
import {
  LocalizationController,
  type TranslationKey,
  type TranslationParameters,
} from "../core/localization";
import { renderIcon } from "../ui/icons";
import { generalSettingsInfoStyles } from "./general-settings-info.styles";
import { SystemInfoController } from "./system-info.controller";

export class GeneralSettingsInfo extends LitElement {
  public static properties = {
    hass: { attribute: false },
  };

  public static styles = generalSettingsInfoStyles;

  private _hass?: HomeAssistant;
  private readonly _localization = new LocalizationController(this);
  private readonly _systemInfo = new SystemInfoController(this);

  public set hass(value: HomeAssistant | undefined) {
    this._hass = value;
    if (value) {
      this._localization.setLanguage(value.locale?.language ?? value.language);
      this._systemInfo.sync(createHomeAssistantApi(value));
    }
  }

  public get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  protected render() {
    const frigate = this._systemInfo.info?.providers?.find(
      ({ provider_id }) => provider_id === "frigate_go2rtc",
    );
    const pendingValue = this._systemInfo.pending
      ? this._t("editor.system_info_loading")
      : this._t("editor.system_info_unavailable");
    const frigateVersion = frigate?.product_versions.length
      ? frigate.product_versions.join(", ")
      : pendingValue;
    const integrationStatus = frigate
      ? frigate.integration_installed
        ? frigate.integration_version
          ? this._t("editor.integration_installed_version", {
              version: frigate.integration_version,
            })
          : this._t("editor.integration_installed")
        : this._t("editor.integration_not_installed")
      : pendingValue;
    const locale = this._hass
      ? createHomeAssistantApi(this._hass).locale
      : undefined;
    const timeZone = formatHomeAssistantTimeZone(locale);
    const profileUrl =
      this._hass?.hassUrl("/profile/general") ?? "/profile/general";
    return html`
      <section
        class="system-summary"
        aria-label=${this._t("editor.system_information")}
      >
        <span class="system-summary-icon">${renderIcon("packageOutline")}</span>
        <div class="system-summary-content">
          <strong>${APP_NAME} ${this._t("editor.card")}</strong>
          <dl>
            <div>
              <dt>${this._t("editor.card_version")}</dt>
              <dd>v${APP_VERSION}</dd>
            </div>
            <div>
              <dt>${this._t("editor.home_assistant_version")}</dt>
              <dd>
                ${
                  this._hass?.config?.version ??
                  this._systemInfo.info?.home_assistant_version ??
                  pendingValue
                }
              </dd>
            </div>
            <div>
              <dt>${this._t("editor.frigate_version")}</dt>
              <dd>${frigateVersion}</dd>
            </div>
            <div>
              <dt>${this._t("editor.frigate_integration")}</dt>
              <dd>${integrationStatus}</dd>
            </div>
          </dl>
        </div>
      </section>
      <section class="timezone-summary">
        <div class="timezone-copy">
          <strong>${this._t("editor.timezone")}</strong>
          <small>
            ${this._t("editor.timezone_description_before")}
            <a href=${profileUrl}>${this._t("editor.home_assistant_profile")}</a
            >.
          </small>
        </div>
        <span class="timezone-value">
          ${renderIcon("clock")}
          <span>${timeZone}</span>
        </span>
      </section>
    `;
  }

  private _t(key: TranslationKey, variables?: TranslationParameters): string {
    return this._localization.localize(key, variables);
  }
}

if (!customElements.get(EDITOR_GENERAL_INFO_TAG)) {
  customElements.define(EDITOR_GENERAL_INFO_TAG, GeneralSettingsInfo);
}

declare global {
  interface HTMLElementTagNameMap {
    [EDITOR_GENERAL_INFO_TAG]: GeneralSettingsInfo;
  }
}
