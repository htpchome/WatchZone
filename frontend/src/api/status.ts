import { INTEGRATION_ID } from "../core/constants";
import type { LocalizeFunction } from "../core/localization";
import { getMediaSessionManager } from "../core/media-session-manager";
import type {
  HomeAssistantApi,
  HomeAssistantUnsubscribe,
} from "../core/home-assistant";

export interface LiveAvailabilityNotification {
  readonly online: boolean;
}

interface AvailabilityObservation {
  readonly api: HomeAssistantApi;
  close: HomeAssistantUnsubscribe;
  readonly entityId: string;
  onRecovered: () => void;
}

interface SuccessNotifier {
  success(message: string, options: { readonly key: string }): void;
}

const observations = new WeakMap<object, AvailabilityObservation>();

/** Synchronize one card's optional provider-status signal. */
export function sync(
  owner: object,
  api: HomeAssistantApi | false | undefined,
  entityId: string | undefined,
  notifier: SuccessNotifier,
  localize: LocalizeFunction,
): void {
  const current = observations.get(owner);
  if (current && current.api === api && current.entityId === entityId) {
    current.onRecovered = () => {
      getMediaSessionManager().wake("frigate_go2rtc:");
      notifier.success(localize("frigate.up"), {
        key: "frigate-online",
      });
    };
    return;
  }
  current?.close();
  observations.delete(owner);
  if (!api || !entityId) return;
  const observation: AvailabilityObservation = {
    api,
    close: () => undefined,
    entityId,
    onRecovered: () => {
      getMediaSessionManager().wake("frigate_go2rtc:");
      notifier.success(localize("frigate.up"), {
        key: "frigate-online",
      });
    },
  };
  observations.set(owner, observation);
  observation.close = observeLiveAvailability(
    api,
    entityId,
    () => observation.onRecovered(),
    () => {
      if (observations.get(owner) === observation) observations.delete(owner);
    },
  );
}

function observeLiveAvailability(
  api: HomeAssistantApi,
  entityId: string,
  onRecovered: () => void,
  onError: () => void,
): HomeAssistantUnsubscribe {
  let previous: boolean | undefined;
  let active = true;
  let unsubscribe: HomeAssistantUnsubscribe | undefined;
  void api
    .subscribeMessage(
      ({ online }: LiveAvailabilityNotification) => {
        const recovered = online && previous === false;
        previous = online;
        if (recovered) onRecovered();
      },
      {
        type: `${INTEGRATION_ID}/live/availability/subscribe`,
        connection: "frigate_go2rtc",
        entity_id: entityId,
      },
      { resubscribe: true },
    )
    .then((value) => {
      const close = typeof value === "function" ? value : () => undefined;
      if (active) unsubscribe = close;
      else close();
    })
    .catch(onError);
  return () => {
    active = false;
    unsubscribe?.();
  };
}
