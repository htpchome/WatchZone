import type { PtzCapability, PtzDirection, PtzProviderId } from "../api/ptz";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../core/home-assistant";

type HomeAssistantPtzProvider =
  typeof import("./home-assistant/ptz").HomeAssistantPtzProvider;
type FrigatePtzProvider = typeof import("./frigate/ptz").FrigatePtzProvider;

let homeAssistantProviderPromise:
  Promise<InstanceType<HomeAssistantPtzProvider>> | undefined;
let frigateProviderPromise:
  Promise<InstanceType<FrigatePtzProvider>> | undefined;

function homeAssistantProvider(): Promise<
  InstanceType<HomeAssistantPtzProvider>
> {
  return (homeAssistantProviderPromise ??= import("./home-assistant/ptz").then(
    ({ HomeAssistantPtzProvider }) => new HomeAssistantPtzProvider(),
  ));
}

/** Provider-neutral PTZ entry used by the editor and PTZ component. */
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
  ): Promise<
    InstanceType<HomeAssistantPtzProvider> | InstanceType<FrigatePtzProvider>
  > {
    if (provider === "home_assistant") return homeAssistantProvider();
    return (frigateProviderPromise ??= import("./frigate/ptz").then(
      ({ FrigatePtzProvider }) => new FrigatePtzProvider(),
    ));
  }
}
