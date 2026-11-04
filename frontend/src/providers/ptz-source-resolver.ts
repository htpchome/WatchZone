import type { PtzCapability, PtzDirection, PtzProviderId } from "../api/ptz";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../core/home-assistant";

type HomeAssistantPtzProvider =
  typeof import("./home-assistant/ptz").HomeAssistantPtzProvider;

let homeAssistantProviderPromise:
  Promise<InstanceType<HomeAssistantPtzProvider>> | undefined;

function homeAssistantProvider(): Promise<
  InstanceType<HomeAssistantPtzProvider>
> {
  return (homeAssistantProviderPromise ??= import("./home-assistant/ptz").then(
    ({ HomeAssistantPtzProvider }) => new HomeAssistantPtzProvider(),
  ));
}

/** Provider-neutral PTZ entry used by the editor and PTZ module. */
export class PtzSourceResolver {
  public async capability(
    api: HomeAssistantApi,
    provider: PtzProviderId,
    entityId: string,
  ): Promise<PtzCapability> {
    return (await this._provider(provider)).capability(api, entityId);
  }

  public async start(
    api: HomeAssistantApi,
    provider: PtzProviderId,
    entityId: string,
    direction: PtzDirection,
  ): Promise<HomeAssistantUnsubscribe> {
    return (await this._provider(provider)).start(api, entityId, direction);
  }

  private _provider(
    provider: PtzProviderId,
  ): Promise<InstanceType<HomeAssistantPtzProvider>> {
    if (provider === "home_assistant") return homeAssistantProvider();
    return Promise.reject(new Error("Unsupported PTZ provider."));
  }
}
