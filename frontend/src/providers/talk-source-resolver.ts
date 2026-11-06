import type { HomeAssistantApi } from "../core/home-assistant";

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

/** Provider-neutral entry used by the two-way-talk component. */
export class TalkSourceResolver {
  public async supports(
    api: HomeAssistantApi,
    entityId: string,
  ): Promise<boolean> {
    return (await provider()).supports(api, entityId);
  }

  public async connect(
    api: HomeAssistantApi,
    entityId: string,
    signal: AbortSignal,
    onFailure: (error: Error) => void,
  ): Promise<TalkConnection> {
    return (await provider()).connect(api, entityId, signal, onFailure);
  }
}
