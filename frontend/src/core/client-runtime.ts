interface NavigatorUserAgentData {
  readonly platform?: string;
}

interface ClientNavigator {
  readonly platform?: string;
  readonly userAgent?: string;
  readonly userAgentData?: NavigatorUserAgentData;
}

export class HomeAssistantClientRuntime {
  public readonly catalyst: boolean;

  public constructor(navigatorObject: ClientNavigator = globalThis.navigator) {
    const userAgent = String(navigatorObject.userAgent ?? "").toLowerCase();
    const platform = String(
      navigatorObject.userAgentData?.platform ?? navigatorObject.platform ?? "",
    ).toLowerCase();
    const homeAssistantHost =
      /home assistant\//.test(userAgent) ||
      /homeassistant\/|mobile\/homeassistant/.test(userAgent);
    this.catalyst =
      homeAssistantHost &&
      (platform.includes("mac") || userAgent.includes("macintosh"));
  }
}

let clientRuntime: HomeAssistantClientRuntime | undefined;

export function getHomeAssistantClientRuntime(): HomeAssistantClientRuntime {
  return (clientRuntime ??= new HomeAssistantClientRuntime());
}
