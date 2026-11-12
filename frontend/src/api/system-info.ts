import type { HomeAssistantApi } from "../core/home-assistant";

export interface ProviderSystemInfo {
  readonly integration_installed: boolean;
  readonly integration_version: string | null;
  readonly product_name: string;
  readonly product_versions: readonly string[];
  readonly provider_id: string;
}

export interface SystemInfo {
  readonly home_assistant_version: string;
  readonly providers: readonly ProviderSystemInfo[];
  readonly watchzone_version: string;
}

export function getSystemInfo(api: HomeAssistantApi): Promise<SystemInfo> {
  return api.callWS<SystemInfo>({ type: "watchzone/system_info" });
}
