import type { CameraConnectionSource } from "../core/camera-connection-source";
import type { HomeAssistantApi } from "../core/home-assistant";

export interface TalkConnection {
  readonly localStream: MediaStream;
  readonly signalingPath?: string;
  close(): void;
  setMicrophoneMuted(muted: boolean): void;
}

type HomeAssistantTalkProvider =
  typeof import("./home-assistant/talk").HomeAssistantTalkProvider;
type FrigateTalkProvider = typeof import("./frigate/talk").FrigateTalkProvider;

let homeAssistantProviderPromise:
  Promise<InstanceType<HomeAssistantTalkProvider>> | undefined;
let frigateProviderPromise:
  Promise<InstanceType<FrigateTalkProvider>> | undefined;

async function homeAssistantProvider(): Promise<
  InstanceType<HomeAssistantTalkProvider>
> {
  return (homeAssistantProviderPromise ??= import("./home-assistant/talk").then(
    ({ HomeAssistantTalkProvider }) => new HomeAssistantTalkProvider(),
  ));
}

/** Provider-neutral entry used by the two-way-talk component. */
export class TalkSourceResolver {
  public async supports(
    api: HomeAssistantApi,
    source: CameraConnectionSource,
    entityId: string,
  ): Promise<boolean> {
    return (await this._provider(source)).supports(api, entityId);
  }

  public async connect(
    api: HomeAssistantApi,
    source: CameraConnectionSource,
    entityId: string,
    signal: AbortSignal,
    onFailure: (error: Error) => void,
  ): Promise<TalkConnection> {
    return (await this._provider(source)).connect(
      api,
      entityId,
      signal,
      onFailure,
    );
  }

  private _provider(
    source: CameraConnectionSource,
  ): Promise<
    InstanceType<HomeAssistantTalkProvider> | InstanceType<FrigateTalkProvider>
  > {
    if (source === "home_assistant") return homeAssistantProvider();
    return (frigateProviderPromise ??= import("./frigate/talk").then(
      ({ FrigateTalkProvider }) => new FrigateTalkProvider(),
    ));
  }
}
