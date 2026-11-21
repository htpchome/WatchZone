import { getBackendBootstrapStatus } from "../api/bootstrap-status";
import type { HomeAssistantApi } from "../core/home-assistant";
import type {
  BackendAvailabilityIncident,
  BackendRecoveryKind,
} from "./backend-availability";

/** Load and translate backend status only after a failure or explicit retry. */
export async function diagnoseBackend(
  api: HomeAssistantApi,
): Promise<BackendAvailabilityIncident | undefined> {
  const status = await getBackendBootstrapStatus(api);
  if (status.state === "ready") return undefined;
  const kind: BackendRecoveryKind =
    status.state === "incompatible_settings"
      ? "incompatible_settings"
      : status.state === "not_configured"
        ? "setup_required"
        : "load_failed";
  return {
    backendVersion: status.backend_version,
    checking: false,
    kind,
    ...(status.saved_settings_version === null
      ? {}
      : { savedSettingsVersion: status.saved_settings_version }),
    supportedSettingsVersion: status.supported_settings_version,
  };
}
