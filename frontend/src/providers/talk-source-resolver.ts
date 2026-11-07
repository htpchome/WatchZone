import type { HomeAssistantApi } from "../core/home-assistant";
import type { LiveConnectionType } from "../core/config";

export interface TalkConnection {
  readonly localStream: MediaStream;
  readonly signalingPath?: string;
  close(): void;
  setMicrophoneMuted(muted: boolean): void;
}

type HomeAssistantTalkProvider =
  typeof import("./home-assistant/talk").HomeAssistantTalkProvider;

let providerPromise:
  Promise<InstanceType<HomeAssistantTalkProvider>> | undefined;

async function provider(): Promise<InstanceType<HomeAssistantTalkProvider>> {
  return (providerPromise ??= import("./home-assistant/talk").then(
    ({ HomeAssistantTalkProvider }) => new HomeAssistantTalkProvider(),
  ));
}

type FrigateTalkProvider = typeof import("./frigate/talk").FrigateTalkProvider;
let frigateProviderPromise:
  Promise<InstanceType<FrigateTalkProvider>> | undefined;

async function frigateProvider(): Promise<InstanceType<FrigateTalkProvider>> {
  return (frigateProviderPromise ??= import("./frigate/talk").then(
    ({ FrigateTalkProvider }) => new FrigateTalkProvider(),
  ));
}

/** Provider-neutral entry used by the two-way-talk component. */
export class TalkSourceResolver {
  public async supports(
    api: HomeAssistantApi,
    connection: LiveConnectionType,
    entityId: string,
  ): Promise<boolean> {
    const selected =
      connection === "frigate_go2rtc"
        ? await frigateProvider()
        : await provider();
    return selected.supports(api, entityId);
  }

  public async connect(
    api: HomeAssistantApi,
    connection: LiveConnectionType,
    entityId: string,
    signal: AbortSignal,
    onFailure: (error: Error) => void,
  ): Promise<TalkConnection> {
    const selected =
      connection === "frigate_go2rtc"
        ? await frigateProvider()
        : await provider();
    return selected.connect(api, entityId, signal, onFailure);
  }
}
