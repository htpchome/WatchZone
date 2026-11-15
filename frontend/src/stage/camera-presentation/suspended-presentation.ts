import { html, type TemplateResult } from "lit";

import type { LocalizeFunction } from "../../core/localization";
import { renderIcon } from "../../ui/icons";

/** Render the provider-neutral camera suspension state. */
export function renderCameraSuspendedPresentation(
  localize: LocalizeFunction,
): TemplateResult {
  return html`<div class="suspended-presentation" role="status">
    <span class="suspended-icon" aria-hidden="true"
      >${renderIcon("videoOff")}</span
    >
    <strong>${localize("camera.suspended")}</strong>
    <span>${localize("camera.suspended_description")}</span>
  </div>`;
}
