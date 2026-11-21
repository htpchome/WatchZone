import { INTEGRATION_ID } from "../core/constants";
import type { HomeAssistantApi } from "../core/home-assistant";

export type BackendBootstrapState =
  | "incompatible_settings"
  | "load_failed"
  | "not_configured"
  | "ready"
  | "unavailable";

export interface BackendBootstrapStatus {
  readonly backend_version: string;
  readonly saved_settings_version: number | null;
  readonly state: BackendBootstrapState;
  readonly supported_settings_version: number;
}

/** This command performs no provider, storage, or media work. */
export function getBackendBootstrapStatus(
  api: HomeAssistantApi,
): Promise<BackendBootstrapStatus> {
  return api.callWS<BackendBootstrapStatus>({
    type: `${INTEGRATION_ID}/bootstrap/status`,
  });
}
