import { html } from "lit";

import { APP_VERSION } from "../core/constants";
import type { LocalizeFunction } from "../core/localization";
import type { BackendAvailabilityIncident } from "./backend-availability";

export function renderBackendRecovery(
  incident: BackendAvailabilityIncident,
  localize: LocalizeFunction,
  openIntegrations: () => void,
  retry: () => void,
) {
  const setup = incident.kind === "setup_required";
  const incompatible = incident.kind === "incompatible_settings";
  return html`<section
    class="backend-recovery"
    role="alert"
    aria-live="assertive"
  >
    <div class="backend-recovery-content">
      <h2>
        ${localize(
          setup ? "recovery.setup_title" : "recovery.start_failed_title",
        )}
      </h2>
      <p>
        ${localize(
          setup
            ? "recovery.setup_introduction"
            : incompatible
              ? "recovery.incompatible_introduction"
              : "recovery.load_failed_introduction",
        )}
      </p>
      <h3>${localize("recovery.steps_title")}</h3>
      <ol>
        ${
          setup
            ? html`<li>${localize("recovery.setup_step_settings")}</li>
                <li>${localize("recovery.setup_step_devices")}</li>
                <li>${localize("recovery.setup_step_add")}</li>
                <li>${localize("recovery.setup_step_search")}</li>
                <li>${localize("recovery.setup_step_return")}</li>`
            : html`<li>${localize("recovery.failure_step_devices")}</li>
                <li>${localize("recovery.failure_step_reload")}</li>
                <li>
                  ${localize(
                    incompatible
                      ? "recovery.failure_step_update"
                      : "recovery.failure_step_logs",
                  )}
                </li>
                <li>${localize("recovery.setup_step_return")}</li>`
        }
      </ol>
      ${
        incompatible
          ? html`<p class="recovery-caution">
              ${localize("recovery.do_not_remove")}
            </p>`
          : null
      }
      <div class="backend-recovery-actions">
        <ha-button
          appearance="accent"
          variant="brand"
          size="m"
          type="button"
          @click=${openIntegrations}
        >
          ${localize("recovery.open_integrations")}
        </ha-button>
        <ha-button
          appearance="plain"
          variant="neutral"
          size="m"
          type="button"
          .disabled=${incident.checking}
          @click=${retry}
        >
          ${localize(
            incident.checking ? "recovery.checking" : "recovery.try_again",
          )}
        </ha-button>
      </div>
      ${
        incident.backendVersion
          ? html`<details class="backend-support-information">
              <summary>${localize("recovery.support_information")}</summary>
              <dl>
                <dt>${localize("recovery.card_version")}</dt>
                <dd>${APP_VERSION}</dd>
                <dt>${localize("recovery.integration_version")}</dt>
                <dd>${incident.backendVersion}</dd>
                ${
                  incident.savedSettingsVersion === undefined
                    ? null
                    : html`<dt>
                          ${localize("recovery.saved_settings_format")}
                        </dt>
                        <dd>${incident.savedSettingsVersion}</dd>`
                }
                ${
                  incident.supportedSettingsVersion === undefined
                    ? null
                    : html`<dt>
                          ${localize("recovery.supported_settings_format")}
                        </dt>
                        <dd>${incident.supportedSettingsVersion}</dd>`
                }
              </dl>
            </details>`
          : null
      }
    </div>
  </section>`;
}
